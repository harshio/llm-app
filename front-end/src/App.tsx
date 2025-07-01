import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import Message from './Message';
//serper.dev API Key: 83ff61fc7181a5f7237b88e7efeb91bfb1d5620a

function App() {
  const [messages, setMessages] = useState<{ text: string; sender: 'user' | 'system' }[]>([]);
  const [inputText, setInputText] = useState('');
  const [chatIds, setChatIds] = useState<string[]>([]);
  const [chats, setChats] = useState<{ [chatId: string]: { text: string; sender: 'user' | 'system' }[] }>({});
  const [currentChatId, setCurrentChatId] = useState<string>('0');
  const [selectedDropdownValue, setSelectedDropdownValue] = useState('');
  const [lastSavedMessageCount, setLastSavedMessageCount] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [summaries, setSummaries] = useState<{ [chatId: string]: string }>({});
  const [fileText, setFileText] = useState('');
  const[searching, setSearch] = useState(false);

  useEffect(() => {
    const savedMessages = localStorage.getItem('messages');
    if (savedMessages) setMessages(JSON.parse(savedMessages));

    const savedCurrentChatId = localStorage.getItem('currentChatId');
    if (savedCurrentChatId) setCurrentChatId(JSON.parse(savedCurrentChatId));

    const saveDropdownValue = localStorage.getItem('selectedDropdownValue');
    if (saveDropdownValue) setSelectedDropdownValue(JSON.parse(saveDropdownValue));

    const savedLastSavedCount = localStorage.getItem('lastSavedMessageCount');
    if (savedLastSavedCount) setLastSavedMessageCount(JSON.parse(savedLastSavedCount));

    const savedSummaries = localStorage.getItem('summaries');
    if (savedSummaries) {
      setSummaries(JSON.parse(savedSummaries));
    }

    setSearch(false);

    fetch("http://localhost:8000/api/chats/grouped")
      .then(res => res.json())
      .then(data => {
        setChats(data);
        setChatIds(Object.keys(data));
      })
      .catch(err => console.error("Failed to load chat IDs:", err));
  }, []);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      // Optional: prompt the user
      // e.preventDefault();
      // e.returnValue = '';
  
      // Save the current messages
      if (messages.length > 0) {
        saveCurrentChatWithMessages(messages);
      }
    };
  
    window.addEventListener('beforeunload', handleBeforeUnload);
  
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [messages]);

  useEffect(() => {
    localStorage.setItem('messages', JSON.stringify(messages));
    localStorage.setItem('currentChatId', JSON.stringify(currentChatId));
    localStorage.setItem('selectedDropdownValue', JSON.stringify(selectedDropdownValue));
    localStorage.setItem('lastSavedMessageCount', JSON.stringify(messages.length));
    localStorage.setItem('summaries', JSON.stringify(summaries));
  }, [messages, currentChatId, selectedDropdownValue, summaries]);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  useEffect(() => {
    console.log(lastSavedMessageCount);
  }, [lastSavedMessageCount]);
  
  // Example: fetch a summary for messages[0]
  const generateSummary = async (chatId: string, firstMessage: string) => {
    const res = await fetch("http://localhost:8000/api/summary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: firstMessage }),
    });

    const data = await res.json();
    const summary = data.response ?? "No summary";

    setSummaries(prev => ({ ...prev, [chatId]: summary }));
  };


  const loadChatById = async (chatId: string) => {
    if (chats[chatId]) {
      setMessages(chats[chatId]);
      setLastSavedMessageCount(chats[chatId].length);
      setCurrentChatId(chatId);
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
    console.log(unsavedMessages.map(m => `${m.sender}: ${m.text}`));
    if (messageList.length > 0) {
      console.log("Sing it twice!");
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
      console.log(newChatId);
  
      if (isNewChat && newChatId) {
        setCurrentChatId(newChatId);
        const firstUserMessage = messageList.find(m => m.sender === 'user');
        if (firstUserMessage) {
          await generateSummary(newChatId, firstUserMessage.text);
        }
        //Over here, I think we need to do a fetch call with /api/generate, using the
        //first message in messages. I'll be like: Write a two-word description of 
        //this request: messages[0] or however I'll access it
        //I believe I'll need the React hooks for maintaining the current summary,
        //and for maintaining a list of all summaries.
      }
      setLastSavedMessageCount(messageList.length);
      return newChatId;
    }
  
    return null;
  };
  

  const handleSend = async () => {
    if (inputText.trim() || fileText.trim()) {
      const userMessage = { text: inputText, sender: 'user' as const };
      const priorMessages = [...messages];
      const updatedMessages = [...messages, userMessage];
      setMessages(updatedMessages);
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

      //gonna make this let finalInput real soon
      let finalInput = ``;
      if(inputText && inputText.trim() !== ''){
        finalInput += `${inputText}.`;
      }
      if (fileText && fileText.trim() !== '') {
        finalInput += `\n\n[Attached File Content]:\n${fileText}`;
      }
      fetch("http://localhost:8000/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          prompt: finalInput,
          messages: priorMessages.slice(-20),
         })
      })
        .then(res => res.json())
        .then(data => {
          const reply = data.response ?? "[No reply]";
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
    setLastSavedMessageCount(0);
    setSelectedDropdownValue('');
    setSearch(false);

    const res = await fetch("http://localhost:8000/api/chats/grouped");
    const data = await res.json();
    setChats(data);
    setChatIds(Object.keys(data));
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
            <div className="chat-summary">{summaries[chatId] ?? "..."}</div>
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
        <div className={`chat-input-container ${messages.length === 0 ? 'centered' : 'bottom'}`}>
          <div className="chat-input-wrapper">
            <div className="chat-input-bar">
              <textarea
                value={inputText}
                onChange={(e) => {
                  setInputText(e.target.value);
                }}
                placeholder="What is the weather?"
              ></textarea>
              <button type="submit" className="btn btn-primary" onClick={handleSend}>
                <i className="bi bi-send"></i>
              </button>
            </div>
            <div className="button-row">
              <label htmlFor="hidden-file-upload" className="upload-plus">
                +
              </label>
              <input
                id="hidden-file-upload"
                type="file"
                accept=".txt,.csv,.json"
                style={{ display: 'none' }}
                onChange={async (e) => {
                  if (e.target.files?.[0]) {
                    const formData = new FormData();
                    formData.append("file", e.target.files[0]);

                    try {
                      const res = await fetch("http://localhost:8000/api/upload", {
                        method: "POST",
                        body: formData
                      });

                      const data = await res.json();
                      if (data.text) {
                        setFileText(data.text);
                      } else {
                        alert("No text extracted.");
                      }
                    } catch (err) {
                      console.error("Upload failed", err);
                      alert("Upload failed");
                    }
                  }
                }}
              />
              <div className={`extra-button ${searching ? 'black' : ''}`} onClick={()=>{
                setSearch(!searching);
                }}>Search</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;



