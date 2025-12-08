import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { GoogleOAuthProvider } from '@react-oauth/google';
import App from './App.js';
import AuthProvider from './auth/AuthContext.jsx';
import ErrorBoundary from './utils/ErrorBoundary.jsx';

const clientId = process.env.REACT_APP_GOOGLE_CLIENT_ID;
const originalFetch = window.fetch;
window.fetch = function(url, options = {}) {
  options.credentials = "include"; 
  return originalFetch(url, options);
};

// Suppress ResizeObserver loop warnings (common, harmless browser warning)
// This error occurs when ResizeObserver callbacks trigger layout changes
// It's often caused by third-party components like Google OAuth

// Patch ResizeObserver at the source to prevent errors
if (typeof window !== 'undefined' && window.ResizeObserver) {
  const OriginalResizeObserver = window.ResizeObserver;
  window.ResizeObserver = class extends OriginalResizeObserver {
    constructor(callback) {
      const wrappedCallback = (entries, observer) => {
        try {
          callback(entries, observer);
        } catch (error) {
          // Suppress ResizeObserver loop errors
          if (!error?.message?.includes('ResizeObserver loop')) {
            throw error; // Re-throw non-ResizeObserver errors
          }
        }
      };
      super(wrappedCallback);
    }
  };
}

// Set up error suppression BEFORE React loads
const suppressResizeObserverError = (error) => {
  const errorMessage = error?.message || error?.toString() || '';
  const errorStack = error?.stack || '';
  if (
    typeof errorMessage === 'string' &&
    (errorMessage.includes('ResizeObserver loop') || 
     errorMessage.includes('ResizeObserver loop completed with undelivered notifications') ||
     errorStack.includes('ResizeObserver'))
  ) {
    return true; // Suppress the error
  }
  // Also check if error is a string directly
  if (typeof error === 'string' && error.includes('ResizeObserver loop')) {
    return true;
  }
  return false;
};

// Override window.onerror FIRST (before React loads)
const originalOnError = window.onerror;
window.onerror = function(message, source, lineno, colno, error) {
  if (typeof message === 'string' && suppressResizeObserverError({ message })) {
    return true; // Suppress the error
  }
  if (error && suppressResizeObserverError(error)) {
    return true;
  }
  if (originalOnError) {
    return originalOnError.call(this, message, source, lineno, colno, error);
  }
  return false;
};

// Suppress in global error handler (capture phase - highest priority)
window.addEventListener('error', (e) => {
  if (suppressResizeObserverError(e.error || e)) {
    e.stopImmediatePropagation();
    e.stopPropagation();
    e.preventDefault();
    return false;
  }
}, true);

// Suppress in unhandled promise rejection handler
window.addEventListener('unhandledrejection', (e) => {
  if (suppressResizeObserverError(e.reason)) {
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
  const allArgsStr = args.map(arg => String(arg)).join(' ');
  if (
    (typeof firstArg === 'string' && firstArg.includes('ResizeObserver loop')) ||
    (firstArg?.message && typeof firstArg.message === 'string' && firstArg.message.includes('ResizeObserver loop')) ||
    (firstArg?.stack && typeof firstArg.stack === 'string' && firstArg.stack.includes('ResizeObserver')) ||
    allArgsStr.includes('ResizeObserver loop')
  ) {
    return; // Suppress ResizeObserver errors
  }
  originalConsoleError.apply(console, args);
};

// Also suppress console warnings for ResizeObserver
const originalConsoleWarn = console.warn;
console.warn = (...args) => {
  const firstArg = args[0];
  const allArgsStr = args.map(arg => String(arg)).join(' ');
  if (
    (typeof firstArg === 'string' && firstArg.includes('ResizeObserver loop')) ||
    (firstArg?.message && typeof firstArg.message === 'string' && firstArg.message.includes('ResizeObserver loop')) ||
    allArgsStr.includes('ResizeObserver loop')
  ) {
    return; // Suppress ResizeObserver warnings
  }
  originalConsoleWarn.apply(console, args);
};

// Suppress React error overlay for ResizeObserver errors
if (process.env.NODE_ENV === 'development') {
  // Override React's error overlay handler - this is the key to preventing the overlay
  const overrideReactErrorOverlay = () => {
    // Override the error overlay handler if it exists (React DevTools)
    if (window.__REACT_ERROR_OVERLAY_GLOBAL_HANDLER__) {
      const originalHandler = window.__REACT_ERROR_OVERLAY_GLOBAL_HANDLER__;
      window.__REACT_ERROR_OVERLAY_GLOBAL_HANDLER__ = (error, isFatal) => {
        if (suppressResizeObserverError(error)) {
          return; // Suppress ResizeObserver errors
        }
        return originalHandler(error, isFatal);
      };
    }
  };
  
  // Try immediately and repeatedly to catch React's overlay as it loads
  overrideReactErrorOverlay();
  setTimeout(overrideReactErrorOverlay, 0);
  setTimeout(overrideReactErrorOverlay, 100);
  setTimeout(overrideReactErrorOverlay, 500);
  setTimeout(overrideReactErrorOverlay, 1000);
  setTimeout(overrideReactErrorOverlay, 2000);
  
  // Intercept React's internal error reporting
  const originalReportError = window.reportError;
  if (originalReportError) {
    window.reportError = function(error) {
      if (suppressResizeObserverError(error)) {
        return;
      }
      return originalReportError.call(this, error);
    };
  }
  
  // Override React's internal error handling by intercepting error events
  // before they bubble to React's error overlay
  document.addEventListener('error', (e) => {
    if (suppressResizeObserverError(e.error || e)) {
      e.stopImmediatePropagation();
      e.preventDefault();
    }
  }, true);
  
  // Use MutationObserver to detect and suppress errors in React's error overlay iframe
  const observer = new MutationObserver(() => {
    // Find React error overlay iframes and suppress errors in them
    const iframes = document.querySelectorAll('iframe[src*="react-error"], iframe[data-react-error-overlay]');
    iframes.forEach(iframe => {
      try {
        const iframeWindow = iframe.contentWindow || iframe.contentDocument?.defaultView;
        if (iframeWindow && !iframeWindow.__RESIZE_OBSERVER_SUPPRESSED__) {
          iframeWindow.__RESIZE_OBSERVER_SUPPRESSED__ = true;
          
          // Add error handlers to the iframe window
          iframeWindow.addEventListener('error', (e) => {
            if (suppressResizeObserverError(e.error || e)) {
              e.stopImmediatePropagation();
              e.preventDefault();
              return false;
            }
          }, true);
          
          // Override console.error in iframe
          const originalIframeError = iframeWindow.console?.error;
          if (originalIframeError) {
            iframeWindow.console.error = (...args) => {
              const allArgsStr = args.map(arg => String(arg)).join(' ');
              if (allArgsStr.includes('ResizeObserver loop')) {
                return;
              }
              return originalIframeError.apply(iframeWindow.console, args);
            };
          }
        }
      } catch (e) {
        // Cross-origin iframe, can't access
      }
    });
  });
  
  // Start observing for React error overlay iframes
  observer.observe(document.body || document.documentElement, {
    childList: true,
    subtree: true
  });
}
createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <GoogleOAuthProvider clientId={clientId}>
      <AuthProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AuthProvider>
    </GoogleOAuthProvider>
  </ErrorBoundary>
);
