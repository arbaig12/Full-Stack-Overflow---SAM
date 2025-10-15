import React, { createContext, useContext, useState } from 'react';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export default function AuthProvider({ children }) {
  // Persist across reloads for dev convenience
  const [user, setUser] = useState(() => {
    try {
      const raw = localStorage.getItem('sam_user');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  const signin = (profile, credential) => {
    // profile: { name, email, picture, sub } from decoded Google ID token
    const u = { profile, credential };
    setUser(u);
    localStorage.setItem('sam_user', JSON.stringify(u));
  };

  const signout = () => {
    setUser(null);
    localStorage.removeItem('sam_user');
  };

  return (
    <AuthContext.Provider value={{ user, signin, signout }}>
      {children}
    </AuthContext.Provider>
  );
}
