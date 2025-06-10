import React, { useState } from 'react';
import './App.css';
import Message from './Message';

function App() {
  const [messages, setMessages] = useState<{ text: string; sender: 'user' | 'system' }[]>([]);
  const [inputText, setInputText] = useState('');

  const handleSend = () => {
    if (inputText.trim()) {
      setMessages([
        ...messages,
        { text: inputText, sender: 'user' },
        /*fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=YOUR_API_KEY", {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    contents: [
      {
        parts: [
          { text: inputText }
        ]
      }
    ]
  })
})*/
        { text: '💡 Auto-reply: Thanks for your message!', sender: 'system' } //We have to replace the hardcoded string with a part of our response object. Fetch is asynchronous, so I have to figure out how to work with that.
        //I'm pretty sure the API documentation is saying that I have to do a POST request and that the JSON object has to contain the user's input string. It will then return something I can use.
      ]);
      setInputText('');
    }
  };
  

  return (
    <div className="App">
      <div className="title">
        Good Title LLM
      </div>
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
