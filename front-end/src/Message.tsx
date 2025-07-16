import React from 'react';
import './App.css';

interface MessageProps {
  text: string;
  sender: 'user' | 'system';
  pushed: boolean;
}

const Message: React.FC<MessageProps> = ({ text, sender, pushed }) => {
    const bubbleClass = sender === 'user' ? 'chat-message user' : 'chat-message system';
    const fullBubbleClass = pushed === true ? bubbleClass + ' right': bubbleClass + ' left';
  
    return <div 
              className={fullBubbleClass}
              dangerouslySetInnerHTML={{ __html: text }}
            />;
};

export default Message;
