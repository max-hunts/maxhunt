import './app.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { backend, navigate, resetDemo, server, session, ui } from './app.ts';

// A deliberate debug handle: the end-to-end checks drive the page through it.
declare global {
  interface Window {
    __gg: unknown;
  }
}
window.__gg = { backend, server, session, ui, navigate, resetDemo };

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
