# backend.py
from datetime import datetime, timedelta
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
import json
import re
import geocoder
import bleach

load_dotenv()

app = FastAPI()

llm = ChatGoogleGenerativeAI(model="models/gemini-2.0-flash")

CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET")
REFRESH_TOKEN = os.getenv("GOOGLE_REFRESH_TOKEN")

print("Client ID:", CLIENT_ID)
print("Client Secret:", CLIENT_SECRET)
print("Refresh Token:", REFRESH_TOKEN, "...")



def get_access_token():
   token_url = "https://oauth2.googleapis.com/token"
   data = {
       "client_id": CLIENT_ID,
       "client_secret": CLIENT_SECRET,
       "refresh_token": REFRESH_TOKEN,
       "grant_type": "refresh_token"
   }


   response = requests.post(token_url, data=data)
   print("Token refresh error:", response.text)
   response.raise_for_status()
   access_token = response.json()["access_token"]
   return access_token

def create_calendar_event(summary: str, description: str, date: str, startTime: str, endTime: str) -> str:
   access_token = get_access_token()
   headers = {
       "Authorization": f"Bearer {access_token}",
       "Content-Type": "application/json"
   }

   if hasattr(date, "content"):
        date = date.content.strip()
   else:
        date = str(date).strip()

   event = {
       "summary": summary,
       "description": description,
       "start": {
           "dateTime": f"{date}T{startTime}",
           "timeZone": "America/New_York"
       },
       "end": {
           "dateTime": f"{date}T{endTime}",
           "timeZone": "America/New_York"
       }
   }

   print(json.dumps(event, indent=2))
   start_datetime = f"{date}T{startTime}-04:00"
   end_datetime = f"{date}T{endTime}-04:00"
   query_params = {
        "timeMin": f"{date}T00:00:00-04:00",
        "timeMax": f"{date}T23:59:59-04:00",
        "singleEvents": "true",
        "orderBy": "startTime"
   }
   get_url = "https://www.googleapis.com/calendar/v3/calendars/primary/events"
   check_response = requests.get(get_url, headers=headers, params=query_params)
   if check_response.status_code == 200:
        events = check_response.json().get("items", [])
        print("Start: ", start_datetime)
        print("End: ", end_datetime)
        print("Found events on same day: ", len(events))
        for existing in events:
            existing_end = existing.get("end", {}).get("dateTime", "")
            existing_start = existing.get("start", {}).get("dateTime", "")
            print("Existing Event: ")
            print("Start: ", existing_start)
            print("End: ", existing_end)
            if existing_end == end_datetime and existing_start == start_datetime:
                print(existing)
                return existing["summary"]
   else:
       print("Failed to check for duplicates. Proceeding with event creation.")
   url = "https://www.googleapis.com/calendar/v3/calendars/primary/events"
   response = requests.post(url, json=event, headers=headers)
   if response.status_code == 200 or response.status_code == 201:
       print("✅ Event created successfully!")
       return "There is no need"
   else:
       print("❌ Failed to create event.")
       print(response.text)
       return "Whoopsy"

def do_search(query: str) -> dict:
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
        
        links = [item["link"] for item in data.get("organic", [])[:5]]

    except Exception as e:
        print("❌ Serper search failed:", e)
        result = f"Search failed: {str(e)}"
        links = []

    return {
        "research": result,
        "sources": links,
        "query": query
    }

def research_agent(state: dict) -> dict:
    query = state["input"]
    today = datetime.now()
    today_str = today.strftime("%A, %B %d, %Y")
    g = geocoder.ip('me')
    curr_city = g.city
    curr_state = g.state
    curr_country = g.country
    print(today_str)
    print(curr_city)
    print(curr_state)
    print(curr_country)
    prompt = PromptTemplate.from_template("""
You are an agent in charge of performing effective online searches.

Your task is to rephrase the following query: {query}

Only modify it by adding the current city ({curr_city}), state ({curr_state}), country ({curr_country}), and today's date ({today_str}), *if and only if* doing so helps clarify or localize the intent of the query.

Do not change the topic or intent of the original query. Do not invent a new query. Do not guess what the user might have meant.

Just rewrite the query with relevant contextual details (like location/time), and nothing else.

Respond with the final rephrased query only.
""")
    chain = prompt | llm
    response = chain.invoke({
        "query": state["input"],
        "curr_city": curr_city,
        "curr_state": curr_state,
        "curr_country": curr_country,
        "today_str": today_str
    })
    new_query = response.content
    print("OVER HERE: " + new_query)
    return do_search(new_query)

def summary_agent(state: dict) -> dict:
   print("\n Summarizing research results...")
   prompt = PromptTemplate.from_template(
    """
    Summarize the following search results:

    {research}

    Your summary should:
    - Be as concise as possible.
    - Include only factual content from the results.
    - Answer the original query: "{query}" — nothing more, nothing less.

    If the results are already a complete answer, return them as-is.
    Do not speculate, rephrase unnecessarily, or add extra information.
    """
   )
   chain = prompt | llm
   print(state["query"])
   summary = chain.invoke({
       "research": state["research"],
       "query": state["query"]
    })
   sources = "\n".join(state["sources"])
   summary.content += f"\nHere are my sources: \n{sources}"
   print("\n Summary:\n", summary.content)
   return {"summary": summary}

def table_replacer(state: dict) -> dict:
    checking = ""
    if "answer" in state:
        checking = state["answer"].content
    elif "summary" in state:
        checking = state["summary"].content
    prompt = PromptTemplate.from_template("""
You will be given a piece of text. If any parts of it look
like they are structured as lists or data that belongs in
rows/columns, convert these parts to HTML tables.
Use only <table>, <thead>, <tbody>, <tr>, <th>, and <td> tags.
Do not use Markdown or tab characters. Do not explain your
changes. 
                                          
Important:
- Leave all other parts of the text exactly as they are.
- If no part of the text should be turned into a table, return the original text unchanged.
- Preserve surrounding narrative, context, or explanation text.

Here are a few examples. Each one contains original text and a corrected version with
valid HTML tables.

----

Example 1:
Original:
| Rank | Flavor | |------|------------| | 1 | Chocolate | | 2 | Vanilla | | 3 | Strawberry |

Fixed:
Top 3 flavors:
<table>
  <thead><tr><th>Rank</th><th>Flavor</th></tr></thead>
  <tbody>
    <tr><td>1</td><td>Chocolate</td></tr>
    <tr><td>2</td><td>Vanilla</td></tr>
    <tr><td>3</td><td>Strawberry</td></tr>
  </tbody>
</table>
                                          
----
                                          
Example 2:
Original:
Plan:
- Monday: Gym
- Tuesday: Work
- Wednesday: Rest

Fixed:
<table>
  <thead><tr><th>Day</th><th>Activity</th></tr></thead>
  <tbody>
    <tr><td>Monday</td><td>Gym</td></tr>
    <tr><td>Tuesday</td><td>Work</td></tr>
    <tr><td>Wednesday</td><td>Rest</td></tr>
  </tbody>
</table>

----
                                          
Example 3:
Original:
Name    Score
Alice   92
Bob     88
Carol   95

Fixed:
<table>
  <thead><tr><th>Name</th><th>Score</th></tr></thead>
  <tbody>
    <tr><td>Alice</td><td>92</td></tr>
    <tr><td>Bob</td><td>88</td></tr>
    <tr><td>Carol</td><td>95</td></tr>
  </tbody>
</table>
                                          
----
                                          
Example 4:
Original:
The invention of ice cream is often credited to ancient China, where early versions were made using snow, milk, and rice. Over time, variations spread to Persia, Italy, and eventually became popular worldwide.

Fixed:
The invention of ice cream is often credited to ancient China, where early versions were made using snow, milk, and rice. Over time, variations spread to Persia, Italy, and eventually became popular worldwide.

----
                                         
Example 5:
Original:
Here are some fun facts about ice cream. The average American eats about 20 pounds of ice cream each year. Below is a breakdown of consumption by age group:

Age Group    Pounds per Year
Children     25
Teens        22
Adults       18
Seniors      15

Ice cream sales tend to spike in July, which is recognized as National Ice Cream Month.

Fixed:
Here are some fun facts about ice cream. The average American eats about 20 pounds of ice cream each year. Below is a breakdown of consumption by age group:

<table>
  <thead><tr><th>Age Group</th><th>Pounds per Year</th></tr></thead>
  <tbody>
    <tr><td>Children</td><td>25</td></tr>
    <tr><td>Teens</td><td>22</td></tr>
    <tr><td>Adults</td><td>18</td></tr>
    <tr><td>Seniors</td><td>15</td></tr>
  </tbody>
</table>

Ice cream sales tend to spike in July, which is recognized as National Ice Cream Month.

----
                                          

Return the full modified text. 
Text:
{text}                                      
""")
    chain = prompt | llm
    response = chain.invoke({"text": checking})
    html_response = response.content
    clean_html = bleach.clean(html_response, tags=["table", "thead", "tbody", "tr", "th", "td", "p", "br"], strip=True)
    print(clean_html)
    return {"table_replaced": clean_html}

def initial_planner(state: dict) -> dict:
    prompt = PromptTemplate.from_template("""
You are a scheduling agent.

Your job is to extract key event details from the user's request and return them as a single JSON object.

User's request:
"{question}"

Return a JSON object with the following fields:
- "summary": a short, two-word summary of the event
- "description": a detailed explanation of the event
- "date": the date the event occurs, formatted exactly as YYYY-MM-DD
- "startTime": the event start time, formatted exactly as HH:MM:00 (24-hour format)
- "endTime": the event end time, formatted exactly as HH:MM:00 (24-hour format)

Respond with only the JSON object. Do not include any explanation, notes, or Markdown formatting.
""")

    chain = prompt | llm
    response = chain.invoke({"question": state["input"]})
    #response is now a JSON string hopefully
    raw_text = response.content.strip()
    cleaned = re.sub(r"```(?:json)?|```", "", raw_text, flags=re.IGNORECASE).strip()

    print("🧹 Cleaned LLM response (initial_planner):", cleaned)

    try:
        responses = json.loads(cleaned)
    except json.JSONDecodeError as e:
        print("❌ JSON decode error in initial_planner:", e)
        print("🧾 Raw response was:", raw_text)
        raise
    created = create_calendar_event(responses["summary"], responses["description"], responses["date"], responses["startTime"], responses["endTime"])
    #now the event should be scheduled.
    if created == "There is no need":
        return {"solution": "The event has been scheduled. Check your Google Calendar for confirmation."}
    else:
        return {"solution": f"The event, {created}, has unfortunately already been scheduled for this time slot."}

def date_normalizer(state: dict) -> dict:
    today = datetime.now()
    today_str = today.strftime("%A, %B %d, %Y")
    prompt = PromptTemplate.from_template("""
You are an agent skilled at interpreting vague or relative date phrases.

Assume today's date is: {today_date}

Given the user's request:
"{question}"

Determine what specific calendar date the user is referring to.
Return only the date in this exact format:

YYYY-MM-DD

Do not include any explanation, punctuation, or extra text — just return the date.
    """)

    chain = prompt | llm
    response = chain.invoke(
        {
            "today_date": today_str,
            "question": state["input"]
        }
    ) #will theoretically return something like 2025-0-04
    #and store it in response
    return {"response": response, "question": state["input"]}

def planner_agent(state: dict) -> dict:
    date = state["response"]
    prompt = PromptTemplate.from_template("""
You are a scheduling agent.

Your job is to extract key event details from the user's request and return them as a single JSON object.

User's request:
"{question}"

Return a JSON object with the following fields:
- "summary": a short, two-word summary of the event
- "description": a detailed explanation of the event
- "startTime": the event start time, formatted exactly as HH:MM:00 (24-hour format)
- "endTime": the event end time, formatted exactly as HH:MM:00 (24-hour format)

Respond with only the JSON object. Do not include any explanation, notes, or Markdown formatting.
""")

    chain = prompt | llm
    response = chain.invoke({"question": state["question"]})
    raw_text = response.content.strip()
    cleaned = re.sub(r"```(?:json)?|```", "", raw_text, flags=re.IGNORECASE).strip()

    print("🧹 Cleaned LLM response:", cleaned)

    try:
        responses = json.loads(cleaned)
    except json.JSONDecodeError as e:
        print("❌ JSON decode error in planner_agent:", e)
        print("🧾 Raw response was:", raw_text)
        raise
    created = create_calendar_event(responses["summary"], responses["description"], date, responses["startTime"], responses["endTime"])
    #now the event should be scheduled.
    if created == "There is no need":
        return {"solution": "The event has been scheduled. Check your Google Calendar for confirmation."}
    else:
        return  {"solution": f"The event, {created}, has unfortunately already been scheduled for this time slot."}

def calendar_planner(state: dict) -> dict:
    prompt = PromptTemplate.from_template("""
You are a smart router agent specializing in scheduling. Given the user's request:

"{question}"

Determine whether the date in the request is already in the format YYYY-MM-DD.

If the date is correctly formatted, respond with exactly:
PLANNER

If the date is vague, relative, or needs conversion, respond with exactly:
DATE

Respond with just one of those two words. Do not include any punctuation, explanation, or quotation marks.
""")


    chain = prompt | llm
    response = chain.invoke({"question": state["input"]})
    decision = response.content.strip().upper()
    new_state = {"next": decision, "input": state["input"]}
    return new_state


def router_agent(state: dict) -> dict:
   print("\n🧭 Deciding how to handle the query...")
   print("\n🔍 Full incoming state to router:", state)

   prompt = PromptTemplate.from_template("""
You are a smart router agent. Given the user's question:


"{question}"


Decide whether it can be answered directly ("INITIAL") or needs online research ("RESEARCH"), or if the user is asking to schedule something ("CALENDAR"), or if the user is asking a coding-related question that doesn't require up-to-date information ("CODING").
If the input question involves current time, date, or location, or asks something dependent on those, you should choose research.
Respond with one word: INITIAL or RESEARCH or CALENDAR or CODING.
""")


   chain = prompt | llm
   response = chain.invoke({"question": state["input"]})
   decision = response.content.strip().upper()


   print(f"🧭 LLM chose: {decision}")

   new_state = {"next": decision, "input": state["input"]}

   if decision == "INITIAL" and "messages" in state:
       new_state["messages"] = state["messages"]

   return new_state


def coding_agent(state: dict) -> dict:
    prompt = PromptTemplate.from_template(
        "Answer this question: '{question}'."
    )
    chain = prompt | llm
    answer = chain.invoke({
        "question": state["input"]
    })
    return {"answer": answer}

def code_formatter(state: dict) -> dict:
    gemini_output = state["answer"].content
    prompt = PromptTemplate.from_template(
   """
You are an agent whose only job is to convert code written in Markdown format
into properly formatted HTML. You will receive a full string, and some, all, or none
of it may be in Markdown code blocks (triple backticks).

⚠️ Important Rules:
- DO NOT add or explain anything.
- DO NOT modify content that is not part of a Markdown code block.
- ONLY replace Markdown code blocks (```lang ... ```) with corresponding <pre><code class="language-lang">...</code></pre>.
- If the original string contains no Markdown code, return it unchanged.

Examples:

---
Original String:
```python def add(x, y): return x + y ```

Fixed String:
<pre><code class="language-python">
def add(x, y): return x + y
</code></pre>
---
Original String:
```python def add(x, y): return x + y ```
This part of the code defines a function that returns the sum of two numbers.

Fixed String:
<pre><code class="language-python">
def add(x, y): return x + y
</code></pre>
This part of the code defines a function that returns the sum of two numbers.
---
Original String:
The quick brown fox jumped over the lazy dog.

Fixed String:
The quick brown fox jumped over the lazy dog.
---
Here is your original string: {output}
Please return only the fixed string. Do not add any explanations or comments.
"""
    )
    chain = prompt | llm
    answer = chain.invoke({
        "output": gemini_output
    })
    html_response = answer.content
    clean_html = bleach.clean(html_response, tags=["pre", "code", "p", "br"], strip=True)
    return {"coding": clean_html}

def initial_agent(state: dict) -> dict:
    print("\n💡 Initial answer agent responding...")
    print("\n🧾 State passed into initial agent:", state)

    messages = state.get("messages", [])
    conversation = ""
    for msg in messages:
        sender = msg["sender"].capitalize()
        text = msg["text"]
        conversation += f"{sender}: {text}\n"

    prompt = PromptTemplate.from_template(
        "Here is the conversation so far:\n\n{chat_history}\n\nUser: {question}\n\nAnswer briefly and clearly."
    )
    chain = prompt | llm
    answer = chain.invoke({
        "chat_history": conversation.strip(),
        "question": state["input"]
    })

    print("💬", answer.content)
    return {"answer": answer}


builder = StateGraph(dict)
builder.add_node("TableReplacer", table_replacer)
builder.add_node("Coder", coding_agent)
builder.add_node("CodeFormatter", code_formatter)
builder.add_node("Router", router_agent)
builder.add_node("Initial", initial_agent)
builder.add_node("Research", research_agent)
builder.add_node("Summary", summary_agent)
builder.add_node("Calendar", calendar_planner)
builder.add_node("InitialPlanner", initial_planner)
builder.add_node("DateNormalizer", date_normalizer)
builder.add_node("Planner", planner_agent)
builder.set_entry_point("Router")
builder.add_conditional_edges("Router", lambda state: state["next"], {
   "INITIAL": "Initial",
   "RESEARCH": "Research",
   "CALENDAR": "Calendar",
   "CODING": "Coder"
})
builder.add_conditional_edges("Calendar", lambda state: state["next"], {
    "PLANNER": "InitialPlanner",
    "DATE": "DateNormalizer"
})
builder.add_edge("Initial", "TableReplacer")
builder.add_edge("Research", "Summary")
builder.add_edge("Summary", "TableReplacer")
builder.add_edge("DateNormalizer", "Planner")
builder.add_edge("Coder", "CodeFormatter")
builder.add_edge("InitialPlanner", END)
builder.add_edge("TableReplacer", END)
builder.add_edge("Planner", END)
builder.add_edge("CodeFormatter", END)
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
    print("\n📩 Received request body:", body)
    user_input = body.get("prompt", "")
    messages = body.get("messages", "")
    result = workflow.invoke({"input": user_input,
                              "messages": messages
                              })
    if "table_replaced" in result:
        content = result["table_replaced"]
    elif "solution" in result:
        content = result["solution"]
    elif "coding" in result:
        content = result["coding"]
    else:
        content = "Sorry, I couldn't generate a response."
    return {"response": content}


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