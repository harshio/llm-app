import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import Message from './Message';

function App() {
  const [messages, setMessages] = useState<{ text: string; sender: 'user' | 'system' }[]>([]);
  const [inputText, setInputText] = useState('');
  const [chatIds, setChatIds] = useState<string[]>([]);
  const [chats, setChats] = useState<{ [chatId: string]: { text: string; sender: 'user' | 'system' }[] }>({});
  const [isDirty, setIsDirty] = useState(true);
  const [currentChatId, setCurrentChatId] = useState<string>('0');
  const [selectedDropdownValue, setSelectedDropdownValue] = useState('');
  const [lastSavedMessageCount, setLastSavedMessageCount] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const savedMessages = localStorage.getItem('messages');
    if (savedMessages) setMessages(JSON.parse(savedMessages));

    const savedCurrentChatId = localStorage.getItem('currentChatId');
    if (savedCurrentChatId) setCurrentChatId(JSON.parse(savedCurrentChatId));

    const saveDropdownValue = localStorage.getItem('selectedDropdownValue');
    if (saveDropdownValue) setSelectedDropdownValue(JSON.parse(saveDropdownValue));

    fetch("http://localhost:8000/api/chats/grouped")
      .then(res => res.json())
      .then(data => {
        setChats(data);
        setChatIds(Object.keys(data));
      })
      .catch(err => console.error("Failed to load chat IDs:", err));
  }, []);

  useEffect(() => {
    localStorage.setItem('messages', JSON.stringify(messages));
    localStorage.setItem('currentChatId', JSON.stringify(currentChatId));
    localStorage.setItem('selectedDropdownValue', JSON.stringify(selectedDropdownValue));
  }, [messages]);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  useEffect(() => {
    console.log(lastSavedMessageCount);
  }, [lastSavedMessageCount]);
  

  const loadChatById = async (chatId: string) => {
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

    const res = await fetch("http://localhost:8000/api/chats/grouped");
    const data = await res.json();
    setChats(data);
    setChatIds(Object.keys(data));
    setSelectedDropdownValue('');
  };

  const saveCurrentChatWithMessages = async (messageList: typeof messages): Promise<string | null> => {
    const unsavedMessages = messageList.slice(lastSavedMessageCount);
    if (isDirty && messageList.length > 0) {
      const isNewChat = currentChatId === '0';
      const payload = isNewChat
        ? { messages: unsavedMessages }
        : { chat_id: currentChatId, messages: unsavedMessages };
  
      const res = await fetch("http://localhost:8000/api/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
  
      const data = await res.json();
      const newChatId = data.chat_id?.toString() ?? null;
  
      if (isNewChat && newChatId) {
        setCurrentChatId(newChatId);
      }
  
      setIsDirty(false);
      setLastSavedMessageCount(messageList.length);
  
      return newChatId;
    }
  
    return null;
  };
  

  const handleSend = async () => {
    if (inputText.trim()) {
      const userMessage = { text: inputText, sender: 'user' as const };

      const updatedMessages = [...messages, userMessage];
      setMessages(updatedMessages);
      setIsDirty(true);
      setInputText('');


      if (currentChatId === '0' && messages.length === 0) {
        const newChatId = await saveCurrentChatWithMessages(updatedMessages);
        if(newChatId){
          const res = await fetch("http://localhost:8000/api/chats/grouped");
          const data = await res.json();
          setChats(data);
          setChatIds(Object.keys(data));
        }
      }

      const recentMessages = updatedMessages.slice(-20);
      const fullPrompt = recentMessages
        .map(m => `${m.sender === 'user' ? 'User' : 'Assistant'}: ${m.text}`)
        .join('\n');
      const finalInput = `${fullPrompt}\nUser: ${inputText}, also say like 3-4 sentences in response.`;

      fetch("http://localhost:8000/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: finalInput })
      })
        .then(res => res.json())
        .then(data => {
          const reply = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "[No reply]";
          const systemMessage = { text: reply, sender: 'system' as const };
          setMessages(prev => [...prev, systemMessage]);
        })
        .catch(err => console.error("Error calling FastAPI:", err));

      setInputText('');
    }
  };

  const handleNew = async () => {
    await saveCurrentChatWithMessages(messages);
    setMessages([]);
    setCurrentChatId('0');
    setSelectedDropdownValue('');

    const res = await fetch("http://localhost:8000/api/chats/grouped");
    const data = await res.json();
    setChats(data);
    setChatIds(Object.keys(data));
  };

  const handleSelect = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const chatId = e.target.value;
    await saveCurrentChatWithMessages(messages);
    await loadChatById(chatId);
  };

  return (
    <div className="layout">
      <div className="header-container">
        <div className="title">Studio Gem LLM</div>
      </div>

      <button className="hamburger" onClick={() => setSidebarOpen(!sidebarOpen)}>
        &#9776;
      </button>

      <div className={`sidebar ${sidebarOpen ? 'open' : 'closed'}`}>
        <button className="newChat" onClick={handleNew}>New Chat</button>
        <div className="sidebar-title">Chats</div>
        {chatIds.map(chatId => (
          <div
            key={chatId}
            className={`sidebar-chat ${currentChatId === chatId ? 'active' : ''}`}
            onClick={async () => {
              if (chatId !== currentChatId) {
                setSelectedDropdownValue(chatId);
                await saveCurrentChatWithMessages(messages);
                await loadChatById(chatId);
              }
            }}
          >
            Chat #{chatId}
          </div>
        ))}
      </div>

      <div className={`App ${messages.length === 0 ? 'centered-input' : 'bottom-input'}`}>
        {messages.length === 0 && <div className="welcomeMsg">How may I help you today?</div>}
        <div className="message-list">
          {messages.map((msg, index) => (
            <Message key={index} text={msg.text} sender={msg.sender} />
          ))}
          <div ref={messagesEndRef} />
        </div>

        <div className={`chat-input-bar ${messages.length === 0 ? 'centered' : 'bottom'}`}>
          <textarea
            value={inputText}
            onChange={(e) => {
              setInputText(e.target.value);
              setIsDirty(true);
            }}
            placeholder="What is the weather?"
          ></textarea>
          <button type="submit" className="btn btn-primary" onClick={handleSend}>
            <i className="bi bi-send"></i>
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;



