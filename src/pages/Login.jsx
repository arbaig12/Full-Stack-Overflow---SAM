import React, { useState } from 'react';
import { GoogleLogin } from '@react-oauth/google';
import { jwtDecode } from 'jwt-decode';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

const brandText = { fontSize: 28, fontWeight: 800, letterSpacing: '0.5px' };

const wrapStyle = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: '#f6f7fb',
  padding: 24,
};

const cardStyle = {
  width: 560,
  minHeight: 400,
  padding: 40,
  borderRadius: 16,
  background: '#fff',
  boxShadow: '0 18px 60px rgba(0,0,0,0.12)',
  textAlign: 'center',
};

function normalizeRole(raw) {
  const r = (raw ?? '').toString().trim().toLowerCase();
  if (!r) return null;
  if (r === 'registrar') return 'registrar';
  if (r === 'student') return 'student';
  if (r === 'advisor') return 'advisor';
  if (r === 'instructor') return 'instructor';
  return r;
}

function extractRole(data) {
  return (
    data?.user?.role ??
    data?.user?.user_role ??
    data?.user?.userRole ??
    data?.role ??
    null
  );
}

function persistRoleFromResponse(data) {
  const normalized = normalizeRole(extractRole(data));
  if (normalized) localStorage.setItem('role', normalized);
  else localStorage.removeItem('role');
  return normalized;
}

export default function Login() {
  const { signin } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const enableBypass = process.env.REACT_APP_ENABLE_AUTH_BYPASS === 'true';

  const handlePasswordLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      localStorage.removeItem('role');

      const r = await fetch('http://localhost:4000/api/auth/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      });

      const data = await r.json();

      if (!r.ok || !data.ok) {
        localStorage.removeItem('role');
        throw new Error(data.error || 'Login failed');
      }

      const role = persistRoleFromResponse(data);

      signin(
        {
          name: data.user?.name || email,
          email: email,
          picture: null,
          sub: null,
          role: role || null,
        },
        null
      );

      navigate('/app', { replace: true });
    } catch (err) {
      console.error(err);
      setError(err.message || 'Password login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <header
        style={{
          height: 60,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 24px',
          borderBottom: '1px solid #eee',
          background: '#fff',
          boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <img src="/logo192.png" alt="SAM" style={{ width: 40, height: 40 }} />
          <span style={brandText}>SAM</span>
        </div>
      </header>

      <div style={wrapStyle}>
        <div style={cardStyle}>
          <img src="/logo192.png" alt="SAM" style={{ width: 56, marginBottom: 12 }} />
          <h2 style={{ margin: '40px 0 20px', fontSize: 24 }}>Sign in to SAM</h2>

          {enableBypass && (
            <div style={{ marginBottom: 30, textAlign: 'left' }}>
              <form onSubmit={handlePasswordLogin}>
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', marginBottom: 8, fontSize: 14, fontWeight: 500 }}>
                    Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      fontSize: 14,
                      border: '1px solid #ddd',
                      borderRadius: 8,
                      boxSizing: 'border-box',
                    }}
                    placeholder="email@stonybrook.edu"
                  />
                </div>

                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', marginBottom: 8, fontSize: 14, fontWeight: 500 }}>
                    Password
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      fontSize: 14,
                      border: '1px solid #ddd',
                      borderRadius: 8,
                      boxSizing: 'border-box',
                    }}
                    placeholder="Enter password"
                  />
                </div>

                {error && (
                  <div
                    style={{
                      marginBottom: 16,
                      padding: '10px',
                      backgroundColor: '#fee',
                      color: '#c33',
                      borderRadius: 8,
                      fontSize: 14,
                    }}
                  >
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    width: '100%',
                    padding: '12px',
                    fontSize: 16,
                    fontWeight: 500,
                    color: '#fff',
                    backgroundColor: loading ? '#ccc' : '#1976d2',
                    border: 'none',
                    borderRadius: 8,
                    cursor: loading ? 'not-allowed' : 'pointer',
                    marginBottom: 20,
                  }}
                >
                  {loading ? 'Signing in...' : 'Sign in with Password'}
                </button>
              </form>

              <div style={{ display: 'flex', alignItems: 'center', marginBottom: 20, marginTop: 20 }}>
                <div style={{ flex: 1, height: 1, backgroundColor: '#ddd' }}></div>
                <span style={{ margin: '0 12px', fontSize: 14, color: '#666' }}>OR</span>
                <div style={{ flex: 1, height: 1, backgroundColor: '#ddd' }}></div>
              </div>
            </div>
          )}

          <GoogleLogin
            size="large"
            onSuccess={async (res) => {
              try {
                localStorage.removeItem('role');

                const r = await fetch('http://localhost:4000/api/auth/google', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  credentials: 'include',
                  body: JSON.stringify({ credential: res.credential }),
                });

                const data = await r.json();
                if (!data.ok) {
                  localStorage.removeItem('role');
                  throw new Error('Login failed');
                }

                const role = persistRoleFromResponse(data);

                const decoded = jwtDecode(res.credential);
                signin(
                  {
                    name: decoded.name,
                    email: decoded.email,
                    picture: decoded.picture,
                    sub: decoded.sub,
                    role: role || null,
                  },
                  res.credential
                );

                navigate('/app', { replace: true });
              } catch (err) {
                console.error(err);
                alert('Google login failed');
              }
            }}
            onError={() => {
              alert('Google Sign-In failed. Please try again.');
            }}
            useOneTap
          />

          <p style={{ fontSize: 12, marginTop: 16, color: '#666' }}>
            By continuing, you agree to our Terms and acknowledge our Privacy Policy.
          </p>
        </div>
      </div>
    </div>
  );
}
