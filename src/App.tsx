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
      const API_KEY = process.env.REACT_APP_GEMINI_API_KEY;
      fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${API_KEY}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              contents: [
                {
                  role: "user",
                  parts: [{ text: inputText }]
                }
              ]
            })
          })
            .then(res=>res.json()) //we need to convert our response object into a JSON object
            .then(data => {
            const reply = data.candidates?.[0]?.content?.parts?.[0]?.text;
            const systemMessage = { text: reply, sender: 'system' as const};
            setMessages(prev => [...prev, systemMessage]);
          })
            .catch(error => {console.error("We could not find a response to the user's question.");});
      setInputText('');
    }
  };

  const handleNew = () => {
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
