import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@rooman/shell/tokens.css';
import { applyTheme, initialTheme } from '@rooman/shell';
import { App } from './App';
import './styles.css';

applyTheme(initialTheme());

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
