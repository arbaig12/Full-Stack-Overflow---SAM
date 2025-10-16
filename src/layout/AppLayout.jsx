import React, { useState } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export default function AppLayout() {
  const [open, setOpen] = useState(true);
  
  //delete if functionality not needed
  const [role, setRole] = useState(() => localStorage.getItem('role') || 'registrar');
  const handleRoleChange = (newRole) => {
    setRole(newRole);
    localStorage.setItem('role', newRole);
  };

  const { user, signout } = useAuth();
  const loc = useLocation();
  const brandText = {
    fontSize: 28,               // bigger “SAM” text
    fontWeight: 800,            // extra bold
    letterSpacing: '0.5px'
    };

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: open ? '240px 1fr' : '64px 1fr',
        gridTemplateRows: '56px 1fr',
        height: '100vh',
        background: '#f6f7fb'
      }}
    >
      {/* Top bar */}
      <header
        style={{
          height: 60, 
          gridColumn: '1 / -1',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 16px',
          borderBottom: '1px solid #eee',
          background: '#fff'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => setOpen(o => !o)} style={iconBtn} title="Toggle sidebar">☰</button>
          <img src="/logo192.png" alt="SAM" style={{ width: 28, height: 28 }} />
          <span style={brandText}>SAM</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {user && (
            <>
              <img
                src={user.profile?.picture}
                alt="profile"
                referrerPolicy="no-referrer"
                style={{ width: 28, height: 28, borderRadius: '50%' }}
              />

              {/* Role selector */}
                <select
                  value={role}
                  onChange={e => handleRoleChange(e.target.value)}
                  style={{
                    fontSize: 16,
                    padding: '2px 6px',
                    borderRadius: 4,
                    border: '1px solid #ccc',
                  }}
                >
                  <option value="student">Student</option>
                  <option value="advisor">Advisor</option>
                  <option value="instructor">instructor</option>
                  <option value="registrar">registrar</option>
                </select>

              <span style={{ fontSize: 20 }}>{user.profile?.name}</span>
              <button onClick={signout} style={pillBtn}>Sign out</button>
            </>
          )}
        </div>
      </header>

      {/* Sidebar */}
      <aside style={{ borderRight: '1px solid #eee', background: '#fafafa', padding: 10 }}>
        <nav style={{ display: 'grid', gap: 8 }}>
          {role === 'student' ? (
        <>
        <NavItem to="/app">Dashboard</NavItem>
        <NavItem to="/app/catalog">Course Catalog</NavItem>
        <NavItem to="/app/schedule">Register / Schedule</NavItem>
        <NavItem to="/app/degree">Degree Progress</NavItem>
        <NavItem to="/app/studentProfile">Student Profile</NavItem>
        </>
            ) : role === 'advisor' ? (
        <>
        <NavItem to="/app">Dashboard</NavItem>
        <NavItem to="/app/rosters">Rosters & Grading</NavItem>
        <NavItem to="/app/userManage">User Management</NavItem>
        </>
            ) : role === 'instructor' ? (
        <>
        <NavItem to="/app">Dashboard</NavItem>
        <NavItem to="/app/rosters">Rosters & Grading</NavItem>
        </>
            ) : role === 'registrar' ? (
        <>
        <NavItem to="/app">Dashboard</NavItem>
        <NavItem to="/app/catalog">Course Catalog</NavItem>
        <NavItem to="/app/schedule">Register / Schedule</NavItem>
        <NavItem to="/app/degree">Degree Progress</NavItem>
        <NavItem to="/app/rosters">Rosters & Grading</NavItem>
        <NavItem to="/app/userManage">User Management</NavItem>
        <NavItem to="/app/import">Import</NavItem>
        <NavItem to="/app/currentDate">Current Date</NavItem>
        </>
            ) : null}
        </nav>
      </aside>

      {/* Main content */}
      <main style={{ padding: 16, overflow: 'auto' }}>
        <Outlet />
      </main>
    </div>
  );
}

function NavItem({ to, children }) {
  return (
    <Link
      to={to}
      style={{
        padding: '9px 12px',
        borderRadius: 8,
        textDecoration: 'none',
        color: '#333',
        background: '#fff',
        border: '1px solid #eee'
      }}
    >
      {children}
    </Link>
  );
}

const iconBtn = { border: '1px solid #ddd', background: '#fff', borderRadius: 8, padding: '6px 10px', cursor: 'pointer' };
const pillBtn = { border: '1px solid #ddd', background: '#fff', borderRadius: 999, padding: '6px 12px', cursor: 'pointer' };
