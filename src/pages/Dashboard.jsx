import React, { useState, useEffect } from 'react';
import { useAuth } from '../auth/AuthContext';

export default function Dashboard() {
  const { user } = useAuth();
  const [role, setRole] = useState(() => localStorage.getItem('role') || 'student');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [recentActivity, setRecentActivity] = useState([]);

  // Fetch SAM's current date from backend and update display
  useEffect(() => {
    const fetchSystemDate = async () => {
      try {
        const res = await fetch('/api/current-date', {
          credentials: 'include'
        });
        if (res.ok) {
          const data = await res.json();
          if (data.ok && data.currentDateObject) {
            // Parse the system date from backend
            const systemDate = new Date(data.currentDateObject);
            // Get current browser time to preserve the time display
            const now = new Date();
            // Combine: use system date but add current time of day
            const displayDate = new Date(systemDate);
            displayDate.setHours(now.getHours(), now.getMinutes(), now.getSeconds());
            setCurrentDate(displayDate);
          }
        }
      } catch (err) {
        console.error('Error fetching system date:', err);
        // Fallback to actual date if API fails
        setCurrentDate(new Date());
      }
    };

    // Fetch initial date
    fetchSystemDate();

    // Update every second (increment time but keep the base date from system)
    const timer = setInterval(() => {
      setCurrentDate(prev => {
        // Increment the time by 1 second while keeping the date
        const updated = new Date(prev);
        updated.setSeconds(updated.getSeconds() + 1);
        return updated;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Fetch dashboard data from backend
  useEffect(() => {
    async function fetchDashboard() {
      try {
        setLoading(true);
        const res = await fetch('/api/dashboard', {
          credentials: 'include'
        });
        if (!res.ok) {
          throw new Error('Failed to load dashboard');
        }
        const data = await res.json();
        setStats(data.stats || {});
        setRecentActivity(data.recentActivity || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    fetchDashboard();
  }, [role]); // when you wire real roles, this might come from user instead

  // Quick actions & labels still live in the frontend
  const quickActionsByRole = {
    student: [
      { label: 'Register for Courses', path: '/app/schedule', color: '#2196f3' },
      { label: 'View Course Catalog', path: '/app/catalog', color: '#4caf50' },
      { label: 'Check Degree Progress', path: '/app/degree', color: '#ff9800' },
      { label: 'Update Profile', path: '/app/studentProfile', color: '#9c27b0' }
    ],
    instructor: [
      { label: 'View Rosters', path: '/app/rosters', color: '#2196f3' },
      { label: 'Enter Grades', path: '/app/rosters', color: '#4caf50' },
      { label: 'Course Catalog', path: '/app/catalog', color: '#ff9800' }
    ],
    advisor: [
      { label: 'Manage Users', path: '/app/userManage', color: '#2196f3' },
      { label: 'View Rosters', path: '/app/rosters', color: '#4caf50' },
      { label: 'Course Catalog', path: '/app/catalog', color: '#ff9800' }
    ],
    registrar: [
      { label: 'Import Data', path: '/app/import', color: '#2196f3' },
      { label: 'Manage Users', path: '/app/userManage', color: '#4caf50' },
      { label: 'Course Catalog', path: '/app/catalog', color: '#ff9800' },
      { label: 'Set Current Date', path: '/app/currentDate', color: '#9c27b0' }
    ]
  };

  const titleByRole = {
    student: 'Student Dashboard',
    instructor: 'Instructor Dashboard',
    advisor: 'Academic Advisor Dashboard',
    registrar: 'Registrar Dashboard'
  };

  const getActivityIcon = (type) => {
    switch (type) {
      case 'enrollment': return '📝';
      case 'grade': return '📊';
      case 'hold': return '⚠️';
      case 'roster': return '👥';
      case 'office': return '🏢';
      case 'approval': return '✅';
      case 'meeting': return '📅';
      case 'alert': return '🚨';
      case 'import': return '📥';
      case 'user': return '👤';
      case 'system': return '⚙️';
      default: return '📋';
    }
  };

  const quickActions = quickActionsByRole[role] || [];

  // Build stat cards from backend stats, with labels/colors here
  let statCards = [];
  if (role === 'student' && stats) {
    statCards = [
      { label: 'Enrolled Courses', value: stats.enrolledCourses, color: '#2196f3' },
      { label: 'Total Credits', value: stats.totalCompletedCredits, color: '#4caf50' },
      {
        label: 'Current GPA',
        value: stats.currentGpa != null ? stats.currentGpa.toFixed(2) : 'N/A',
        color: '#ff9800'
      },
      { label: 'Credits to Graduate', value: stats.creditsToGraduate, color: '#9c27b0' }
    ];
  } else if (role === 'instructor' && stats) {
    statCards = [
      { label: 'Teaching Courses', value: stats.teachingCourses, color: '#2196f3' },
      { label: 'Total Students', value: stats.totalStudents, color: '#4caf50' },
      { label: 'Pending Grades', value: stats.pendingGrades, color: '#ff9800' }
    ];
  } else if (role === 'advisor' && stats) {
    statCards = [
      { label: 'Total Advisees', value: stats.totalAdvisees, color: '#2196f3' },
      { label: 'Pending Approvals', value: stats.pendingApprovals, color: '#ff9800' },
      { label: 'Graduating This Term', value: stats.graduatingThisTerm, color: '#4caf50' },
      { label: 'At Risk Students', value: stats.atRiskStudents, color: '#f44336' }
    ];
  } else if (role === 'registrar' && stats) {
    statCards = [
      { label: 'Total Students', value: stats.totalStudents, color: '#2196f3' },
      { label: 'Active Courses', value: stats.activeCourses, color: '#4caf50' },
      { label: 'Pending Imports', value: stats.pendingImports, color: '#ff9800' },
      { label: 'System Status', value: stats.systemStatus, color: '#4caf50' }
    ];
  }

  return (
    <div style={{ padding: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
        <div>
          <h1 style={{ margin: 0, color: '#333' }}>{titleByRole[role] || 'Dashboard'}</h1>
          <p style={{ margin: '8px 0 0 0', color: '#666' }}>
            Welcome back, {user?.profile?.name || 'User'} • {currentDate.toLocaleDateString()} {currentDate.toLocaleTimeString()}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ color: '#666', fontSize: 14 }}>Role:</span>
          <select
            value={role}
            onChange={(e) => {
              setRole(e.target.value);
              localStorage.setItem('role', e.target.value);
            }}
            style={{
              padding: '6px 12px',
              border: '1px solid #ddd',
              borderRadius: 6,
              fontSize: 14,
              background: '#fff'
            }}
          >
            <option value="student">Student</option>
            <option value="instructor">Instructor</option>
            <option value="advisor">Advisor</option>
            <option value="registrar">Registrar</option>
          </select>
        </div>
      </div>

      {loading && <div>Loading dashboard...</div>}

      {!loading && (
        <>
          {/* Stats Cards */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 20,
            marginBottom: 32
          }}>
            {statCards.map((stat, index) => (
              <div
                key={index}
                style={{
                  padding: 24,
                  borderRadius: 12,
                  background: '#fff',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                  border: '1px solid #e0e0e0',
                  textAlign: 'center'
                }}
              >
                <div style={{
                  fontSize: 32,
                  fontWeight: 'bold',
                  color: stat.color,
                  marginBottom: 8
                }}>
                  {stat.value}
                </div>
                <div style={{ color: '#666', fontSize: 14 }}>
                  {stat.label}
                </div>
              </div>
            ))}
          </div>

          {/* Main Content Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 24 }}>
            {/* Quick Actions */}
            <div style={{
              padding: 24,
              borderRadius: 12,
              background: '#fff',
              boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
              border: '1px solid #e0e0e0'
            }}>
              <h2 style={{ margin: '0 0 20px 0', color: '#333' }}>Quick Actions</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
                {quickActions.map((action, index) => (
                  <button
                    key={index}
                    onClick={() => (window.location.href = action.path)}
                    style={{
                      padding: '16px 20px',
                      borderRadius: 8,
                      border: 'none',
                      background: action.color,
                      color: 'white',
                      cursor: 'pointer',
                      fontSize: 14,
                      fontWeight: 'bold',
                      textAlign: 'left',
                      transition: 'transform 0.2s, box-shadow 0.2s'
                    }}
                    onMouseOver={(e) => {
                      e.target.style.transform = 'translateY(-2px)';
                      e.target.style.boxShadow = '0 6px 20px rgba(0,0,0,0.15)';
                    }}
                    onMouseOut={(e) => {
                      e.target.style.transform = 'translateY(0)';
                      e.target.style.boxShadow = 'none';
                    }}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Recent Activity */}
            <div style={{
              padding: 24,
              borderRadius: 12,
              background: '#fff',
              boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
              border: '1px solid #e0e0e0'
            }}>
              <h2 style={{ margin: '0 0 20px 0', color: '#333' }}>Recent Activity</h2>
              <div style={{ display: 'grid', gap: 12 }}>
                {recentActivity.map((activity, index) => (
                  <div
                    key={index}
                    style={{
                      padding: 12,
                      borderRadius: 8,
                      background: '#f8f9fa',
                      border: '1px solid #e0e0e0',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 12
                    }}
                  >
                    <span style={{ fontSize: 16 }}>{getActivityIcon(activity.type)}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, color: '#333', marginBottom: 4 }}>
                        {activity.message}
                      </div>
                      <div style={{ fontSize: 12, color: '#666' }}>
                        {activity.time ? new Date(activity.time).toLocaleString() : ''}
                      </div>
                    </div>
                  </div>
                ))}
                {recentActivity.length === 0 && (
                  <div style={{ fontSize: 14, color: '#666' }}>No recent activity yet.</div>
                )}
              </div>
            </div>
          </div>

          {/* System Status (for registrar) */}
          {role === 'registrar' && stats && (
            <div style={{ marginTop: 24 }}>
              <div style={{
                padding: 20,
                borderRadius: 12,
                background: '#e8f5e8',
                border: '1px solid #4caf50',
                display: 'flex',
                alignItems: 'center',
                gap: 12
              }}>
                <span style={{ fontSize: 20 }}>✅</span>
                <div>
                  <div style={{ fontWeight: 'bold', color: '#2e7d32' }}>
                    System Status: {stats.systemStatus}
                  </div>
                  <div style={{ fontSize: 14, color: '#388e3c' }}>
                    All systems operational • Last updated: {currentDate.toLocaleTimeString()}
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
