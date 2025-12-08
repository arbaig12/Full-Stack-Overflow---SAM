import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { GoogleOAuthProvider } from '@react-oauth/google';
import App from './App.js';
import AuthProvider from './auth/AuthContext.jsx';

const clientId = process.env.REACT_APP_GOOGLE_CLIENT_ID;
const originalFetch = window.fetch;
window.fetch = function(url, options = {}) {
  options.credentials = "include"; 
  return originalFetch(url, options);
};

// Suppress ResizeObserver loop warnings (common, harmless browser warning)
// This error occurs when ResizeObserver callbacks trigger layout changes
// It's often caused by third-party components like Google OAuth

// Suppress in global error handler
window.addEventListener('error', (e) => {
  if (
    e.message && 
    (e.message.includes('ResizeObserver loop') || 
     e.message.includes('ResizeObserver loop completed with undelivered notifications'))
  ) {
    e.stopImmediatePropagation();
    e.stopPropagation();
    e.preventDefault();
    return false;
  }
}, true);

// Suppress in unhandled promise rejection handler
window.addEventListener('unhandledrejection', (e) => {
  const message = e.reason?.message || e.reason || '';
  if (
    typeof message === 'string' &&
    (message.includes('ResizeObserver loop') || 
     message.includes('ResizeObserver loop completed with undelivered notifications'))
  ) {
    e.stopImmediatePropagation();
    e.stopPropagation();
    e.preventDefault();
    return false;
  }
}, true);

// Suppress console errors for ResizeObserver
const originalConsoleError = console.error;
console.error = (...args) => {
  const firstArg = args[0];
  if (
    (typeof firstArg === 'string' && firstArg.includes('ResizeObserver loop')) ||
    (firstArg?.message && typeof firstArg.message === 'string' && firstArg.message.includes('ResizeObserver loop'))
  ) {
    return; // Suppress ResizeObserver errors
  }
  originalConsoleError.apply(console, args);
};

// Suppress React error overlay for ResizeObserver errors
if (process.env.NODE_ENV === 'development') {
  // Try to override React's error overlay handler
  // Use setTimeout to ensure React's overlay is loaded first
  setTimeout(() => {
    // Override the error overlay handler if it exists
    if (window.__REACT_ERROR_OVERLAY_GLOBAL_HANDLER__) {
      const originalHandler = window.__REACT_ERROR_OVERLAY_GLOBAL_HANDLER__;
      window.__REACT_ERROR_OVERLAY_GLOBAL_HANDLER__ = (error, isFatal) => {
        const errorMessage = error?.message || error?.toString() || '';
        if (errorMessage.includes('ResizeObserver loop')) {
          return; // Suppress ResizeObserver errors
        }
        return originalHandler(error, isFatal);
      };
    }
    
    // Also try to intercept via window.onerror override
    const originalOnError = window.onerror;
    window.onerror = function(message, source, lineno, colno, error) {
      if (typeof message === 'string' && message.includes('ResizeObserver loop')) {
        return true; // Suppress the error
      }
      if (originalOnError) {
        return originalOnError.call(this, message, source, lineno, colno, error);
      }
      return false;
    };
  }, 100);
}
createRoot(document.getElementById('root')).render(
  <GoogleOAuthProvider clientId={clientId}>
    <AuthProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </AuthProvider>
  </GoogleOAuthProvider>
);
