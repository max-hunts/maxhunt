import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/jetbrains-mono/latin-400.css';
import '@fontsource/jetbrains-mono/latin-500.css';
import '@fontsource/jetbrains-mono/latin-700.css';
import './app.css';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { boot } from './boot.ts';
import { board } from './canvas/board.ts';
import { useApp } from './store.ts';
import { wallet } from './wallet/wallet.ts';

createRoot(document.getElementById('root')!).render(<App />);
void boot();

// Handle for the end-to-end checks (and for poking around in the console).
(window as unknown as { __polypaint: unknown }).__polypaint = { board, store: useApp, wallet };
