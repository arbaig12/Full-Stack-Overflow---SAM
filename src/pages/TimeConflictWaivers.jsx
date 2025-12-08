import React, { useState, useEffect } from 'react';
import { useAuth } from '../auth/AuthContext';

export default function TimeConflictWaivers() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [waivers, setWaivers] = useState([]);
  const [processingWaiver, setProcessingWaiver] = useState(null);
  const [userRole, setUserRole] = useState(null); // Will be set from API response

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
            setUserRole(data.role); // Backend returns 'Instructor', 'Advisor', etc.
          } else {
            // No role in response, set to empty string to trigger access denied
            setUserRole('');
          }
        } else {
          // Request failed, set to empty string to trigger access denied
          setUserRole('');
        }
      } catch (err) {
        console.error('Error fetching user role:', err);
        // On error, set to empty string to trigger access denied
        setUserRole('');
      }
    }
    fetchUserRole();
  }, []);

  async function loadWaivers() {
    try {
      setLoading(true);
      setError('');

      // Normalize role to lowercase for comparison (API returns lowercase)
      const normalizedRole = (userRole || '').toLowerCase();
      let endpoint = '';
      if (normalizedRole === 'instructor') {
        endpoint = '/api/registration/time-conflict-waiver/pending-instructor';
      } else if (normalizedRole === 'advisor') {
        endpoint = '/api/registration/time-conflict-waiver/pending-advisor';
      } else {
        setError('This page is only available for instructors and advisors');
        setLoading(false);
        return;
      }

      const res = await fetch(endpoint, {
        credentials: 'include',
        cache: 'no-cache'
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to load waivers');
      }

      const data = await res.json();
      setWaivers(data.waivers || []);
    } catch (err) {
      setError(err.message);
      console.error('[TimeConflictWaivers] Error loading waivers:', err);
    } finally {
      setLoading(false);
    }
  }

  // Load waivers when role is available
  useEffect(() => {
    if (userRole) {
      loadWaivers();
    } else if (userRole === null) {
      // Still loading role - keep loading state
      setLoading(true);
    } else {
      // Role loaded but not Instructor or Advisor - stop loading
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userRole]);

  async function handleApprove(waiverId) {
    if (!window.confirm('Are you sure you want to approve this time conflict waiver?')) {
      return;
    }

    try {
      setProcessingWaiver(waiverId);
      setError('');

      // Normalize role to lowercase for comparison
      const normalizedRole = (userRole || '').toLowerCase();
      let endpoint = '';
      if (normalizedRole === 'instructor') {
        endpoint = `/api/registration/time-conflict-waiver/${waiverId}/approve-instructor`;
      } else if (normalizedRole === 'advisor') {
        endpoint = `/api/registration/time-conflict-waiver/${waiverId}/approve-advisor`;
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ approved: true })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to approve waiver');
      }

      // Reload waivers
      await loadWaivers();
    } catch (err) {
      setError(err.message);
      console.error('[TimeConflictWaivers] Error approving waiver:', err);
    } finally {
      setProcessingWaiver(null);
    }
  }

  async function handleDeny(waiverId) {
    if (!window.confirm('Are you sure you want to deny this time conflict waiver?')) {
      return;
    }

    try {
      setProcessingWaiver(waiverId);
      setError('');

      // Normalize role to lowercase for comparison
      const normalizedRole = (userRole || '').toLowerCase();
      let endpoint = '';
      if (normalizedRole === 'instructor') {
        endpoint = `/api/registration/time-conflict-waiver/${waiverId}/approve-instructor`;
      } else if (normalizedRole === 'advisor') {
        endpoint = `/api/registration/time-conflict-waiver/${waiverId}/approve-advisor`;
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ approved: false })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to deny waiver');
      }

      // Reload waivers
      await loadWaivers();
    } catch (err) {
      setError(err.message);
      console.error('[TimeConflictWaivers] Error denying waiver:', err);
    } finally {
      setProcessingWaiver(null);
    }
  }

  function formatSchedule(meetingDays, meetingTimes) {
    if (!meetingDays && !meetingTimes) return 'TBA';
    return `${meetingDays || ''} ${meetingTimes || ''}`.trim() || 'TBA';
  }

  // Show loading while fetching role or waivers
  if (loading || userRole === null) {
    return (
      <div style={{ padding: 20 }}>
        <h1>Time Conflict Waivers</h1>
        <div>Loading...</div>
      </div>
    );
  }

  // Check if user has appropriate role (case-insensitive)
  const normalizedRole = (userRole || '').toLowerCase();
  if (normalizedRole !== 'instructor' && normalizedRole !== 'advisor') {
    return (
      <div style={{ padding: 20 }}>
        <h1>Time Conflict Waivers</h1>
        <div style={{
          padding: 12,
          marginBottom: 16,
          borderRadius: 6,
          background: '#ffebee',
          color: '#c62828',
          border: '1px solid #ef5350'
        }}>
          This page is only available for instructors and advisors.
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ margin: 0 }}>Time Conflict Waivers</h1>
        <button
          onClick={loadWaivers}
          style={{
            padding: '8px 16px',
            borderRadius: 6,
            border: '1px solid #ddd',
            background: 'white',
            cursor: 'pointer',
            fontWeight: 'bold'
          }}
        >
          Refresh
        </button>
      </div>

      {error && (
        <div style={{
          padding: 12,
          marginBottom: 16,
          borderRadius: 6,
          background: '#ffebee',
          color: '#c62828',
          border: '1px solid #ef5350'
        }}>
          {error}
        </div>
      )}

      {waivers.length === 0 ? (
        <div style={{
          padding: 24,
          textAlign: 'center',
          background: '#f5f5f5',
          borderRadius: 8,
          color: '#666'
        }}>
          <p style={{ fontSize: 18, margin: 0 }}>No pending time conflict waivers</p>
          <p style={{ fontSize: 14, marginTop: 8 }}>All waivers requiring your approval have been processed.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 16 }}>
          {waivers.map(waiver => (
            <div
              key={waiver.waiverId}
              style={{
                padding: 20,
                borderRadius: 8,
                background: '#fff3cd',
                border: '1px solid #ffc107',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 16 }}>
                <div style={{ flex: 1 }}>
                  <h3 style={{ margin: '0 0 12px 0', color: '#856404' }}>
                    Time Conflict Waiver Request
                  </h3>
                  <div style={{ marginBottom: 8 }}>
                    <strong>Student:</strong> {waiver.studentName} ({waiver.studentEmail})
                  </div>
                  <div style={{ marginBottom: 8, fontSize: 14, color: '#666' }}>
                    <strong>Requested:</strong> {new Date(waiver.requestedAt).toLocaleString()}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => handleApprove(waiver.waiverId)}
                    disabled={processingWaiver === waiver.waiverId}
                    style={{
                      padding: '8px 16px',
                      borderRadius: 6,
                      border: 'none',
                      background: '#28a745',
                      color: 'white',
                      cursor: processingWaiver === waiver.waiverId ? 'not-allowed' : 'pointer',
                      fontWeight: 'bold',
                      opacity: processingWaiver === waiver.waiverId ? 0.6 : 1
                    }}
                  >
                    {processingWaiver === waiver.waiverId ? 'Processing...' : 'Approve'}
                  </button>
                  <button
                    onClick={() => handleDeny(waiver.waiverId)}
                    disabled={processingWaiver === waiver.waiverId}
                    style={{
                      padding: '8px 16px',
                      borderRadius: 6,
                      border: 'none',
                      background: '#dc3545',
                      color: 'white',
                      cursor: processingWaiver === waiver.waiverId ? 'not-allowed' : 'pointer',
                      fontWeight: 'bold',
                      opacity: processingWaiver === waiver.waiverId ? 0.6 : 1
                    }}
                  >
                    Deny
                  </button>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                {/* Class 1 */}
                <div style={{
                  padding: 12,
                  background: 'white',
                  borderRadius: 6,
                  border: '1px solid #ddd'
                }}>
                  <div style={{ fontWeight: 'bold', marginBottom: 8, color: '#1976d2' }}>
                    Class 1
                    {normalizedRole === 'instructor' && waiver.instructorClassNumber === 1 && (
                      <span style={{ marginLeft: 8, fontSize: 12, color: '#ff9800' }}>(Your Class)</span>
                    )}
                  </div>
                  <div style={{ fontSize: 14, marginBottom: 4 }}>
                    <strong>{waiver.class1.courseCode}</strong> - {waiver.class1.courseTitle}
                  </div>
                  <div style={{ fontSize: 14, marginBottom: 4 }}>
                    Section {waiver.class1.sectionNum} • {waiver.class1.term}
                  </div>
                  <div style={{ fontSize: 14, color: '#666' }}>
                    {formatSchedule(waiver.class1.meetingDays, waiver.class1.meetingTimes)}
                  </div>
                  {normalizedRole === 'instructor' && waiver.instructorClassNumber === 1 && (
                    <div style={{ marginTop: 8, fontSize: 12, color: waiver.instructor1Approved ? '#28a745' : '#ff9800' }}>
                      {waiver.instructor1Approved ? '✓ Approved' : 'Pending your approval'}
                    </div>
                  )}
                </div>

                {/* Class 2 */}
                <div style={{
                  padding: 12,
                  background: 'white',
                  borderRadius: 6,
                  border: '1px solid #ddd'
                }}>
                  <div style={{ fontWeight: 'bold', marginBottom: 8, color: '#1976d2' }}>
                    Class 2
                    {normalizedRole === 'instructor' && waiver.instructorClassNumber === 2 && (
                      <span style={{ marginLeft: 8, fontSize: 12, color: '#ff9800' }}>(Your Class)</span>
                    )}
                  </div>
                  <div style={{ fontSize: 14, marginBottom: 4 }}>
                    <strong>{waiver.class2.courseCode}</strong> - {waiver.class2.courseTitle}
                  </div>
                  <div style={{ fontSize: 14, marginBottom: 4 }}>
                    Section {waiver.class2.sectionNum} • {waiver.class2.term}
                  </div>
                  <div style={{ fontSize: 14, color: '#666' }}>
                    {formatSchedule(waiver.class2.meetingDays, waiver.class2.meetingTimes)}
                  </div>
                  {normalizedRole === 'instructor' && waiver.instructorClassNumber === 2 && (
                    <div style={{ marginTop: 8, fontSize: 12, color: waiver.instructor2Approved ? '#28a745' : '#ff9800' }}>
                      {waiver.instructor2Approved ? '✓ Approved' : 'Pending your approval'}
                    </div>
                  )}
                </div>
              </div>

              {/* Approval Status */}
              <div style={{
                padding: 12,
                background: '#f5f5f5',
                borderRadius: 6,
                fontSize: 14
              }}>
                <div style={{ fontWeight: 'bold', marginBottom: 8 }}>Approval Status:</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                  <div>
                    <strong>Instructor 1:</strong>{' '}
                    <span style={{ color: waiver.instructor1Approved ? '#28a745' : '#ff9800' }}>
                      {waiver.instructor1Approved ? '✓ Approved' : '⏳ Pending'}
                    </span>
                  </div>
                  <div>
                    <strong>Instructor 2:</strong>{' '}
                    <span style={{ color: waiver.instructor2Approved ? '#28a745' : '#ff9800' }}>
                      {waiver.instructor2Approved ? '✓ Approved' : '⏳ Pending'}
                    </span>
                  </div>
                  <div>
                    <strong>Advisor:</strong>{' '}
                    <span style={{ color: waiver.advisorApproved ? '#28a745' : '#ff9800' }}>
                      {waiver.advisorApproved ? '✓ Approved' : '⏳ Pending'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

