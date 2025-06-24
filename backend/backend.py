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


load_dotenv()


app = FastAPI()


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


API_KEY = os.getenv("GEMINI_API_KEY")


@app.post("/api/generate")
async def generate_content(request: Request):
   body = await request.json()
   user_input = body.get("prompt", "")


   response = requests.post(
       f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={API_KEY}",
       headers={"Content-Type": "application/json"},
       json={
           "contents": [
               {
                   "role": "user",
                   "parts": [{"text": user_input}]
               }
           ]
       }
   )


   return response.json()


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