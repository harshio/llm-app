import React, { useState, useEffect } from 'react';
import './App.css';
import Message from './Message';

function App() {
  //I guess we have to store a bunch of messages arrays in localStorage or something
  const [messages, setMessages] = useState<{ text: string; sender: 'user' | 'system' }[]>([]);
  const [inputText, setInputText] = useState('');

    // ✅ Load messages from localStorage on first render
    useEffect(() => {
      const savedMessages = localStorage.getItem('messages');
      console.log("On mount, savedMessages =", savedMessages);
      if (savedMessages) {
        try {
          const parsed = JSON.parse(savedMessages);
          if (Array.isArray(parsed)) {
            setMessages(parsed);
          }
        } catch (e) {
          console.error("Failed to parse localStorage messages", e);
        }
      }
    }, []);
    
  
    // ✅ Save to localStorage whenever messages change
    useEffect(() => {
      localStorage.setItem('messages', JSON.stringify(messages));
    }, [messages]);

  const handleSend = () => {
    if (inputText.trim()) {
      const userMessage = { text: inputText, sender: 'user' as const};
      setMessages(prev => [...prev, userMessage]);
      fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=AIzaSyBwLWMppNZktkQgPFQdxyXh5u6kzjFrWgk", {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              contents: [
                {
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
  

  return (
    <div className="App">
      <div className="title">
        Studio Gem LLM
      </div>
      <button className = "newChat" onClick={() => setMessages([])}>New Chat</button>
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
