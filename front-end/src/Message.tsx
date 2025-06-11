import React from 'react';
import './App.css';

interface MessageProps {
  text: string;
  sender: 'user' | 'system';
}

const Message: React.FC<MessageProps> = ({ text, sender }) => {
    const bubbleClass = sender === 'user' ? 'chat-message user' : 'chat-message system';
  
    return <div className={bubbleClass}>{text}</div>;
};

export default Message;
