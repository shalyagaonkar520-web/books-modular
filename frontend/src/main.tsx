import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import { App } from './App';
import { applyTheme, initialTheme } from './app/theme';
import { AppContentProvider } from './app/AppContentContext';
import { AuthProvider } from './auth/AuthContext';
import { ErrorBoundary, UnhandledErrorNotifier } from './components/ErrorBoundary';
import { ToastProvider } from './components/ui/Toast';
import './styles/index.css';

applyTheme(initialTheme());

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <UnhandledErrorNotifier />
        <AuthProvider>
          <AppContentProvider>
            <ErrorBoundary>
              <App />
            </ErrorBoundary>
          </AppContentProvider>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
