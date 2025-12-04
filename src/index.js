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
createRoot(document.getElementById('root')).render(
  <GoogleOAuthProvider clientId={clientId}>
    <AuthProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </AuthProvider>
  </GoogleOAuthProvider>
);
