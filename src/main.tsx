import React from 'react';
import ReactDOM from 'react-dom/client';
import { initWebDatabase } from './db/webAdapter';
import App from './App';
import './index.css';

initWebDatabase();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);