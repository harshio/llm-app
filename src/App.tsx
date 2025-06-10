import React from 'react';
import logo from './logo.svg';
import './App.css';

function App() {
  return (
    <div className="App">
      <div className="chat-input-bar">
        <textarea placeholder="What is the weather?"></textarea>
        <button type="submit" className="btn btn-primary">
          <i className="bi bi-send"></i>
        </button>
      </div>
    </div>
  );
}

export default App;
