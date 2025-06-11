import React, { useState, useEffect } from 'react';
import './App.css';
import Message from './Message';

function App() {
  //I guess we have to store a bunch of messages arrays in localStorage or something
  const [messages, setMessages] = useState<{ text: string; sender: 'user' | 'system' }[]>([]);
  const [inputText, setInputText] = useState('');

    // ✅ Load messages from localStorage on first render
    useEffect(() => {
      console.log('I will do something');
    }, []);

    //We're very close. Now we need to find a way of saving to localStorages that doesn't override old messages arrays.
    //Once we do all this, we can extend to placing this in a SQLite database or something.
    
  
    // ✅ Save to localStorage whenever messages change
    useEffect(() => {
      console.log('I may do something');
    }, [messages]);

  const handleSend = () => {
    if (inputText.trim()) {
      const userMessage = { text: inputText, sender: 'user' as const};
      setMessages(prev => [...prev, userMessage]);
      fetch("http://localhost:8000/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ prompt: inputText })
      })
        .then(res => res.json())
        .then(data => {
          const reply = data.candidates?.[0]?.content?.parts?.[0]?.text;
          const systemMessage = { text: reply, sender: 'system' as const };
          setMessages(prev => [...prev, systemMessage]);
        })
        .catch(err => console.error("Error calling FastAPI:", err));
      
      setInputText('');
    }
  };

  const handleNew = () => {
    //We'll put another fetch call here: It will be a POST request, and it'll contain our old message
    //before we get to the setMessages([]) line
    //Before we can do that though, we'll have to implement it in our backend. It should have a body of
    //messages. Later on, we should attempt to better format messages.
    setMessages([]);
  };
  

  return (
    <div className="App">
      <div className="title">
        Studio Gem LLM
      </div>
      <button className = "newChat" onClick={handleNew}>New Chat</button>
      <select id="chatHistory" className="custom-dropdown">
        <option value="chat1">Chat 1</option>
        <option value="chat2">Chat 2</option>
        <option value="chat3">Chat 3</option>
      </select>

      <div className="message-list">
        {messages.map((msg, index) => (
          <Message key={index} text={msg.text} sender={msg.sender}/>
        ))}
      </div>
      <div className="chat-input-bar">
        <textarea value={inputText} onChange={(e) => setInputText(e.target.value)}placeholder="What is the weather?"></textarea>
        <button type="submit" className="btn btn-primary" onClick={handleSend}>
          <i className="bi bi-send"></i>
        </button>
      </div>
    </div>
  );
}

export default App;
