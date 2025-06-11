import React, { useState, useEffect } from 'react';
import './App.css';
import Message from './Message';

function App() {
  //I guess we have to store a bunch of messages arrays in localStorage or something
  const [messages, setMessages] = useState<{ text: string; sender: 'user' | 'system' }[]>([]);
  const [inputText, setInputText] = useState('');
  const [counter, setCounter] = useState(0);

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

    //We're very close. Now we need to find a way of saving to localStorages that doesn't override old messages arrays.
    //Once we do all this, we can extend to placing this in a SQLite database or something.
    
  
    // ✅ Save to localStorage whenever messages change
    useEffect(() => {
      localStorage.setItem('messages', JSON.stringify(messages));
      localStorage.setItem('counter', JSON.stringify(counter));
    }, [messages, counter]);

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
    //Before we do setMessages([]), we need to place the old value of message in localStorage
    //That way, we'll able to use it later in a history tab
    const saved = localStorage.getItem('counter');
    let counterValue = saved !== null ? parseInt(saved, 10) : 0;
    //If there actually is a set of messages to save before going to the new chat, then we'll save them first
    if(messages && messages.length > 0){
      counterValue++;
      localStorage.setItem('old' + counterValue, JSON.stringify(messages));
      setCounter(counterValue); //this also triggers the useEffect, since counter is a dependency in it. It should save the new value of counter in localStorage
      //asynchronous, untrustworthy, put it last.
    }
    //Regardless of whether or not there actually is a set of messages to save or not, we can still just make a new chat
    //It doesn't really matter if we put setMessages([]) in the if-statement or after it
    setMessages([]);
  };
  

  return (
    <div className="App">
      <div className="title">
        Studio Gem LLM
      </div>
      <button className = "newChat" onClick={handleNew}>New Chat</button>
      <button onClick={() => localStorage.clear()}>For testing</button>
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
