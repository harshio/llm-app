import React, { useState, useEffect } from 'react';
import './App.css';
import Message from './Message';

function App() {
  const [messages, setMessages] = useState<{ text: string; sender: 'user' | 'system' }[]>([]);
  const [inputText, setInputText] = useState('');
  const [chatIds, setChatIds] = useState<string[]>([]);
  const [chats, setChats] = useState<{
    [chatId: string]: { text: string; sender: 'user' | 'system' }[];
  }>({});
  const [isDirty, setIsDirty] = useState(true);
  const [currentChatId, setCurrentChatId] = useState<string>('0');
  const [selectedDropdownValue, setSelectedDropdownValue] = useState('');
  const [lastSavedMessageCount, setLastSavedMessageCount] = useState(0);


  // Load chat IDs and data on first render
  useEffect(() => {
    fetch("http://localhost:8000/api/chats/grouped")
      .then(res => res.json())
      .then(data => {
        setChats(data);
        setChatIds(Object.keys(data));
      })
      .catch(err => console.error("Failed to load chat IDs:", err));
  }, []);

  // Send a message and get system reply
  const handleSend = () => {
    if (inputText.trim()) {
      const userMessage = { text: inputText, sender: 'user' as const };
      setMessages(prev => [...prev, userMessage]);
      setIsDirty(true); // Ensure chat gets saved later
      const recentMessages = messages.slice(-20);  // ⬅️ get last 20 messages
      const fullPrompt = recentMessages
        .map(m => `${m.sender === 'user' ? 'User' : 'Assistant'}: ${m.text}`)
        .join('\n');

      const finalInput = `${fullPrompt}\nUser: ${inputText}`;

  
      fetch("http://localhost:8000/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ prompt: finalInput })
      })
        .then(res => res.json())
        .then(data => {
          console.log("RECEIVED FROM API:", JSON.stringify(data, null, 2));
          const reply = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "[No reply]";
          const systemMessage = { text: reply, sender: 'system' as const };
          setMessages(prev => [...prev, systemMessage]);
        })
        .catch(err => console.error("Error calling FastAPI:", err));
  
      setInputText('');
    }
  };
  

  // Archive current messages as a new chat
  const handleNew = () => {
    const unsavedMessages = messages.slice(lastSavedMessageCount);
    if (isDirty && messages.length > 0) {
      const isNewChat = currentChatId === '0';
  
      const payload = isNewChat
        ? { messages: unsavedMessages }
        : { chat_id: currentChatId, messages: unsavedMessages };
  
      fetch("http://localhost:8000/api/chats", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      })
        .then(res => res.json())
        .then(data => {
          setMessages([]);
          setCurrentChatId('0');
          setIsDirty(false);
          setLastSavedMessageCount(0);
          return fetch("http://localhost:8000/api/chats/grouped");
        })
        .then(res => res.json())
        .then(data => {
          setChats(data);
          setChatIds(Object.keys(data));
          setSelectedDropdownValue('');
        })
        .catch(err => console.error("Failed to create or update chat:", err));
    } else {
      setMessages([]);
      setCurrentChatId('0');
      setSelectedDropdownValue('');
    }
  };
  

  // Load a chat from local data
  const handleSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const chatId = e.target.value;
    if (chats[chatId]) {
      setMessages(chats[chatId]);
      setLastSavedMessageCount(chats[chatId].length);
      setCurrentChatId(chatId);
      setIsDirty(false);
    } else {
      console.error("Chat ID not found in memory:", chatId);
      setMessages([]);
      setLastSavedMessageCount(0);
    }
  };

  return (
    <div className="App">
      <div className="title">Studio Gem LLM</div>

      <button className="newChat" onClick={handleNew}>New Chat</button>

      <select className="custom-dropdown" onChange={ (e) => {
        setSelectedDropdownValue(e.target.value);
        handleSelect(e);
      }} 
        value={selectedDropdownValue}>
        <option value="" disabled>Select a chat</option>
        {chatIds.map(chatId => (
          <option key={chatId} value={chatId}>
            Chat #{chatId}
          </option>
        ))}
      </select>

      <div className="message-list">
        {messages.map((msg, index) => (
          <Message key={index} text={msg.text} sender={msg.sender} />
        ))}
      </div>

      <div className="chat-input-bar">
        <textarea
          value={inputText}
          onChange={(e) => {
            setInputText(e.target.value);
            setIsDirty(true);  // 👈 Mark the chat as modified
          }}          
          placeholder="What is the weather?"
        ></textarea>
        <button type="submit" className="btn btn-primary" onClick={handleSend}>
          <i className="bi bi-send"></i>
        </button>
      </div>
    </div>
  );
}

export default App;



