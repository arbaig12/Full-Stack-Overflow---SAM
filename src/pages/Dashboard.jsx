import React, { useState, useEffect } from 'react';
import { useAuth } from '../auth/AuthContext';

export default function Dashboard() {
  const { user } = useAuth();
  const [role, setRole] = useState(() => localStorage.getItem('role') || 'student');
  const [currentDate, setCurrentDate] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentDate(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Sample data based on role
  const getDashboardData = () => {
    switch (role) {
      case 'student':
        return {
          title: 'Student Dashboard',
          stats: [
            { label: 'Enrolled Courses', value: '4', color: '#2196f3' },
            { label: 'Total Credits', value: '13', color: '#4caf50' },
            { label: 'Current GPA', value: '3.65', color: '#ff9800' },
            { label: 'Credits to Graduate', value: '107', color: '#9c27b0' }
          ],
          quickActions: [
            { label: 'Register for Courses', path: '/app/schedule', color: '#2196f3' },
            { label: 'View Course Catalog', path: '/app/catalog', color: '#4caf50' },
            { label: 'Check Degree Progress', path: '/app/degree', color: '#ff9800' },
            { label: 'Update Profile', path: '/app/studentProfile', color: '#9c27b0' }
          ],
          recentActivity: [
            { type: 'enrollment', message: 'Registered for CSE316 - Database Systems', time: '2 hours ago' },
            { type: 'grade', message: 'Received grade A- for CSE214 - Data Structures', time: '1 day ago' },
            { type: 'hold', message: 'Financial hold cleared', time: '3 days ago' }
          ]
        };
      case 'instructor':
        return {
          title: 'Instructor Dashboard',
          stats: [
            { label: 'Teaching Courses', value: '2', color: '#2196f3' },
            { label: 'Total Students', value: '55', color: '#4caf50' },
            { label: 'Pending Grades', value: '12', color: '#ff9800' },
            { label: 'Office Hours', value: 'Tue/Thu 2-4 PM', color: '#9c27b0' }
          ],
          quickActions: [
            { label: 'View Rosters', path: '/app/rosters', color: '#2196f3' },
            { label: 'Enter Grades', path: '/app/rosters', color: '#4caf50' },
            { label: 'Course Catalog', path: '/app/catalog', color: '#ff9800' }
          ],
          recentActivity: [
            { type: 'grade', message: 'Graded 15 assignments for CSE101', time: '1 hour ago' },
            { type: 'roster', message: 'New student enrolled in CSE214', time: '4 hours ago' },
            { type: 'office', message: 'Office hours completed', time: '1 day ago' }
          ]
        };
      case 'advisor':
        return {
          title: 'Academic Advisor Dashboard',
          stats: [
            { label: 'Total Advisees', value: '25', color: '#2196f3' },
            { label: 'Pending Approvals', value: '3', color: '#ff9800' },
            { label: 'Graduating This Term', value: '5', color: '#4caf50' },
            { label: 'At Risk Students', value: '2', color: '#f44336' }
          ],
          quickActions: [
            { label: 'Manage Users', path: '/app/userManage', color: '#2196f3' },
            { label: 'View Rosters', path: '/app/rosters', color: '#4caf50' },
            { label: 'Course Catalog', path: '/app/catalog', color: '#ff9800' }
          ],
          recentActivity: [
            { type: 'approval', message: 'Approved course override for John Doe', time: '30 minutes ago' },
            { type: 'meeting', message: 'Scheduled meeting with Jane Smith', time: '2 hours ago' },
            { type: 'alert', message: 'Student at risk: Bob Johnson', time: '1 day ago' }
          ]
        };
      case 'registrar':
        return {
          title: 'Registrar Dashboard',
          stats: [
            { label: 'Total Students', value: '1,250', color: '#2196f3' },
            { label: 'Active Courses', value: '85', color: '#4caf50' },
            { label: 'Pending Imports', value: '2', color: '#ff9800' },
            { label: 'System Status', value: 'Online', color: '#4caf50' }
          ],
          quickActions: [
            { label: 'Import Data', path: '/app/import', color: '#2196f3' },
            { label: 'Manage Users', path: '/app/userManage', color: '#4caf50' },
            { label: 'Course Catalog', path: '/app/catalog', color: '#ff9800' },
            { label: 'Set Current Date', path: '/app/currentDate', color: '#9c27b0' }
          ],
          recentActivity: [
            { type: 'import', message: 'Successfully imported course catalog for Fall 2025', time: '1 hour ago' },
            { type: 'user', message: 'Created new user account for Dr. Wilson', time: '3 hours ago' },
            { type: 'system', message: 'System backup completed successfully', time: '1 day ago' }
          ]
        };
      default:
        return {
          title: 'Dashboard',
          stats: [],
          quickActions: [],
          recentActivity: []
        };
    }
  };

  const dashboardData = getDashboardData();

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

  return (
    <div style={{ padding: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
        <div>
          <h1 style={{ margin: 0, color: '#333' }}>{dashboardData.title}</h1>
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

      {/* Stats Cards */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
        gap: 20, 
        marginBottom: 32 
      }}>
        {dashboardData.stats.map((stat, index) => (
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
            {dashboardData.quickActions.map((action, index) => (
              <button
                key={index}
                onClick={() => window.location.href = action.path}
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
            {dashboardData.recentActivity.map((activity, index) => (
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
                    {activity.time}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* System Status (for registrar) */}
      {role === 'registrar' && (
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
              <div style={{ fontWeight: 'bold', color: '#2e7d32' }}>System Status: Online</div>
              <div style={{ fontSize: 14, color: '#388e3c' }}>
                All systems operational • Last updated: {currentDate.toLocaleTimeString()}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
