import React, { useState } from 'react';
import './App.css';
import Message from './Message';

function App() {
  //I guess we have to store a bunch of messages arrays in localStorage or something
  const [messages, setMessages] = useState<{ text: string; sender: 'user' | 'system' }[]>([]);
  const [inputText, setInputText] = useState('');

  const handleSend = () => {
    if (inputText.trim()) {
      setMessages([
        ...messages,
        { text: inputText, sender: 'user' },
      ]);
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
            setMessages([
              ...messages,
              { text: inputText, sender: 'user' },
              { text: reply, sender: 'system' }
            ]);})
            .catch(error => {console.error("Damn boy");});
      setInputText('');
    }
  };
  

  return (
    <div className="App">
      <div className="title">
        Studio Gem LLM
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
