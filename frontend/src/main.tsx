import React from 'react';
import ReactDOM from 'react-dom/client';
import { AdminApp } from './AdminApp';
import { App } from './App';
import './styles.css';

window.Telegram?.WebApp?.ready();
window.Telegram?.WebApp?.expand();
window.Telegram?.WebApp?.MainButton?.hide();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {window.location.pathname.startsWith('/admin') ? <AdminApp /> : <App />}
  </React.StrictMode>,
);
