# backend.py
import random
from fastapi import FastAPI, Request, Depends, APIRouter, Body, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
import requests
import os
from dotenv import load_dotenv
from pydantic import BaseModel
from typing import List, Literal, Dict, Any, Optional
from sqlalchemy.orm import Session
from models import Message as DBMessage, SessionLocal
from fastapi.responses import JSONResponse
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain.prompts import PromptTemplate
from langgraph.graph import StateGraph, END
from langchain_community.tools import DuckDuckGoSearchRun
from langchain_core.tools import tool
from langchain_core.messages import HumanMessage, AIMessage
import json

load_dotenv()

app = FastAPI()

llm = ChatGoogleGenerativeAI(model="models/gemini-2.0-flash")
search_tool = DuckDuckGoSearchRun()

@tool
def web_search(query: str) -> str:
   """Search the web using DuckDuckGo."""
   return search_tool.run(query)

def research_agent(state: dict) -> dict:
    query = state["input"]
    print(f"\n🔍 Researching via Serper: {query}")

    try:
        response = requests.post(
            "https://google.serper.dev/search",
            headers={
                "X-API-KEY": SEARCH_KEY,
                "Content-Type": "application/json"
            },
            json={"q": query}
        )

        data = response.json()

        # Extract useful parts
        if "answerBox" in data and "answer" in data["answerBox"]:
            result = data["answerBox"]["answer"]
        elif "organic" in data and len(data["organic"]) > 0:
            result = data["organic"][0]["snippet"]
        else:
            result = "No good search results found."

    except Exception as e:
        print("❌ Serper search failed:", e)
        result = f"Search failed: {str(e)}"

    return {"research": result}

def summary_agent(state: dict) -> dict:
   print("\n Summarizing research results...")
   prompt = PromptTemplate.from_template(
       "Summarize the following research results:\n\n{research}."
   )
   chain = prompt | llm
   summary = chain.invoke({"research": state["research"]})
   print("\n Summary:\n", summary.content)
   return {"summary": summary}


def router_agent(state: dict) -> dict:
   print("\n🧭 Deciding how to handle the query...")


   prompt = PromptTemplate.from_template("""
You are a smart router agent. Given the user's question:


"{question}"


Decide whether it can be answered directly ("INITIAL") or needs online research ("RESEARCH").
Respond with one word: INITIAL or RESEARCH.
""")


   chain = prompt | llm
   response = chain.invoke({"question": state["input"]})
   decision = response.content.strip().upper()


   print(f"🧭 LLM chose: {decision}")
   return {
       "next": decision,
       "input": state["input"]  # ✅ forward input to the next agent
   }




def initial_agent(state: dict) -> dict:
    print("\n💡 Initial answer agent responding...")

    formatted_history = state.get("history", "")

    prompt = PromptTemplate.from_template("""
You are a helpful assistant in an ongoing conversation.

Conversation so far:
{history}

Now the user says: {question}

Respond helpfully and naturally.
""")

    chain = prompt | llm
    answer = chain.invoke({
        "history": formatted_history,
        "question": state["input"]
    })

    print("💬", answer.content)
    return {"answer": answer}


builder = StateGraph(dict)
builder.add_node("Router", router_agent)
builder.add_node("Initial", initial_agent)
builder.add_node("Research", research_agent)
builder.add_node("Summary", summary_agent)
builder.set_entry_point("Router")
builder.add_conditional_edges("Router", lambda state: state["next"], {
   "INITIAL": "Initial",
   "RESEARCH": "Research"
})
builder.add_edge("Initial", END)
builder.add_edge("Research", "Summary")
builder.add_edge("Summary", END)
workflow = builder.compile()


def get_db():
   db = SessionLocal()
   try:
       yield db
   finally:
       db.close()


class MessageIn(BaseModel):
   text: str
   sender: Literal["user", "system"]


# CORS so your frontend (React) can talk to this backend
app.add_middleware(
   CORSMiddleware,
   allow_origins=["*"],  # Change to your frontend URL in production
   allow_methods=["*"],
   allow_headers=["*"],
)


API_KEY = os.getenv("GOOGLE_API_KEY")
SEARCH_KEY = os.getenv("SERPER_API_KEY")

#handleSend will either use the /api/generate route or the /api/search route
#depending on whether the search button is pressed or not
@app.post("/api/search") #this route will no longer be called since we'll be removing the search tool option
async def search_content(request: Request):
    body = await request.json()
    user_input = body.get("prompt", "") #we will also make the user send us their query similarly to generate except only the input typed in by the user in will matter.

    response = requests.post(
        f"https://google.serper.dev/search",
        headers={
            "X-API-KEY": SEARCH_KEY,
            "Content-Type": "application/json"
        },
        json={"q": user_input}
    )

    return response.json()

@app.post("/api/summary")
async def generate_summary(request: Request):
    body = await request.json()
    first_message = body.get("message", "")
    
    # Keep this very simple: just ask Gemini to give 2-word summary.
    prompt = PromptTemplate.from_template("Write a 2-word description of this request:\n\n{message}")
    chain = prompt | llm
    result = chain.invoke({"message": first_message})
    return {"response": result.content.strip()}

@app.post("/api/generate")
async def generate_content(request: Request):
    body = await request.json()
    user_input = body.get("prompt", "")
    messages = body.get("messages", [])

    # Rebuild memory from provided messages
    from langchain.memory.chat_message_histories import ChatMessageHistory
    memory = ChatMessageHistory()

    for m in messages:
        if m["sender"] == "user":
            memory.add_user_message(m["text"])
        else:
            memory.add_ai_message(m["text"])

    # Format chat history
    formatted_history = "\n".join([
        f"{'User' if isinstance(m, HumanMessage) else 'Assistant'}: {m.content}"
        for m in memory.messages
    ])
    print("\n🧠 Formatted chat history being sent to LLM:\n", formatted_history)

    # Run through your initial agent only
    prompt = PromptTemplate.from_template(
        """You are a helpful assistant in an ongoing conversation.

Conversation so far:
{history}

Now the user says: {question}

Respond helpfully and naturally."""
    )
    chain = prompt | llm
    answer = chain.invoke({
        "history": formatted_history,
        "question": user_input
    })

    return {"response": answer.content}


@app.post("/api/chats")
def save_chat(messages: List[MessageIn], chat_id: Optional[int] = Body(0), db: Session = Depends(get_db)):
    if not messages:
        return {"error": "No messages provided"}, 400

    # Generate a new ID if chat_id is 0 or missing
    if chat_id == 0:
        chat_id = random.randint(100000, 999999)

    for msg in messages:
        db_msg = DBMessage(text=msg.text, sender=msg.sender, chat_id=chat_id)
        db.add(db_msg)
    
    db.commit()
    return {"status": "saved", "chat_id": chat_id, "count": len(messages)}

@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    try:
        contents = await file.read()
        text = contents.decode("utf-8")
        return JSONResponse(content={"text": text})  # ✅ send raw text back
    except Exception as e:
        return JSONResponse(content={"error": f"File read failed: {e}"}, status_code=400)


@app.get("/api/chats")
def get_all_messages(db: Session = Depends(get_db)):
   messages = db.query(DBMessage).all()
   return messages


@app.get("/api/chats/grouped")
def get_all_grouped_chats(db: Session = Depends(get_db)):
   messages = db.query(DBMessage).all()


   grouped = {}
   for msg in messages:
       key = msg.chat_id
       if key not in grouped:
           grouped[key] = []
       grouped[key].append({
           "text": msg.text,
           "sender": msg.sender
       })


   return grouped