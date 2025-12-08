import React, { useState, useEffect } from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export default function AppLayout() {
  const [open, setOpen] = useState(true);
  const [role, setRole] = useState(null); // Will be set from API response

  // Fetch user role from backend
  useEffect(() => {
    async function fetchUserRole() {
      try {
        const res = await fetch('/api/dashboard', {
          credentials: 'include'
        });
        if (res.ok) {
          const data = await res.json();
          if (data.role) {
            setRole(data.role);
          }
        }
      } catch (err) {
        console.error('Error fetching user role:', err);
      }
    }
    fetchUserRole();
  }, []);

  const { user, signout } = useAuth();
  const loc = useLocation();
  const brandText = {
    fontSize: 28,
    fontWeight: 800,
    letterSpacing: '0.5px'
  };

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: open ? '200px 1fr' : '0px 1fr',
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
          <button
            onClick={() => setOpen(o => !o)}
            style={{
              ...iconBtn,               
              ...(open ? {} : offBtn),  
            }}
            title={open ? 'Collapse sidebar' : 'Expand sidebar'}
            aria-expanded={open}
            aria-controls="sam-sidebar"
          >
            ☰
          </button>
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

              {/* Role display (read-only) */}
              <span style={{
                fontSize: 16,
                padding: '2px 6px',
                borderRadius: 4,
                border: '1px solid #ccc',
                background: '#f5f5f5',
                color: '#333',
                fontWeight: '500',
                textTransform: 'capitalize'
              }}>
                {role ? role.charAt(0).toUpperCase() + role.slice(1) : 'Loading...'}
              </span>

              <span style={{ fontSize: 20 }}>{user.profile?.name}</span>
              <button onClick={signout} style={pillBtn}>Sign out</button>
            </>
          )}
        </div>
      </header>

      {/* Sidebar */}
      <aside
        id="sam-sidebar"
        style={{
          borderRight: '1px solid #eee',
          background: '#fafafa',
          padding: open ? 10 : 8,     // a bit tighter when closed
          overflow: 'hidden',          // prevents any layout bleed when closed
          transition: 'all 0.3s ease'
        }}
      >
        {/* Only render menu when open */}
        {open && (
          <nav style={{ display: 'grid', gap: 8 }}>
            {role === 'student' ? (
              <>
                <NavItem to="/app" end>Dashboard</NavItem>
                <NavItem to="/app/catalog">Course Catalog</NavItem>
                <NavItem to="/app/schedule">Register / Schedule</NavItem>
                <NavItem to="/app/degree">Degree Progress</NavItem>
                <NavItem to="/app/declare">Declare Major/Minor</NavItem>
                <NavItem to="/app/plan">Schedule Planning</NavItem>
                <NavItem to="/app/academicCalendar">Academic Calendar</NavItem>
                <NavItem to="/app/studentProfile">Student Profile</NavItem>
              </>
            ) : role === 'advisor' ? (
              <>
                <NavItem to="/app" end>Dashboard</NavItem>
                <NavItem to="/app/majorMinorRequests">Major/Minor Requests</NavItem>
                <NavItem to="/app/rosters">Rosters & Grading</NavItem>
                <NavItem to="/app/userManage">User Management</NavItem>
                <NavItem to="/app/academicCalendar">Academic Calendar</NavItem>
                <NavItem to="/app/waiversHolds">Waivers & Holds</NavItem>
                <NavItem to="/app/auditLog">Audit Log</NavItem>
              </>
            ) : role === 'instructor' ? (
              <>
                <NavItem to="/app" end>Dashboard</NavItem>
                <NavItem to="/app/rosters">Rosters & Grading</NavItem>
                <NavItem to="/app/academicCalendar">Academic Calendar</NavItem>
                <NavItem to="/app/waiversHolds">Waivers & Holds</NavItem>
              </>
            ) : role === 'registrar' ? (
              <>
                <NavItem to="/app" end>Dashboard</NavItem>
                <NavItem to="/app/catalog">Course Catalog</NavItem>
                <NavItem to="/app/classManage">Manage Class Sections</NavItem>
                <NavItem to="/app/degreeRequirements">Degree Requirements</NavItem>
                <NavItem to="/app/rosters">Rosters & Grading</NavItem>
                <NavItem to="/app/userManage">User Management</NavItem>
                <NavItem to="/app/import">Import</NavItem>
                <NavItem to="/app/academicCalendar">Academic Calendar</NavItem>
                <NavItem to="/app/currentDate">Current Date</NavItem>
                <NavItem to="/app/waiversHolds">Waivers & Holds</NavItem>
                <NavItem to="/app/auditLog">Audit Log</NavItem>
              </>
            ) : null}
          </nav>
        )}
      </aside>

      {/* Main content */}
      <main style={{ padding: 16, overflow: 'auto' }}>
        <Outlet />
      </main>
    </div>
  );
}

function NavItem({ to, children, end = false }) {
  return (
    <NavLink
      to={to}
      end={end}
      style={({ isActive }) => ({
        padding: '9px 12px',
        borderRadius: 8,
        textDecoration: 'none',
        color: isActive ? '#fff' : '#333',        
        background: isActive ? '#555' : '#fff', 
        border: '1px solid #eee',
        transition: 'all 0.2s ease',
        cursor: 'pointer',
      })}
    >
      {children}
    </NavLink>
  );
}

const iconBtn = { border: '1px solid #aaa', background: '#bfbfbf', borderRadius: 8, padding: '6px 10px', cursor: 'pointer' };
const offBtn = { border: '1px solid #ddd', background: '#fff', borderRadius: 8, padding: '6px 10px', cursor: 'pointer' };
const pillBtn = { border: '1px solid #ddd', background: '#fff', borderRadius: 999, padding: '6px 12px', cursor: 'pointer' };
