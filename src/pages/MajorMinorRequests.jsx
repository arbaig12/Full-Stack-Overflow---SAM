import React, { useState, useEffect } from 'react';

export default function MajorMinorRequests() {
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [requests, setRequests] = useState([]);
  const [denialReason, setDenialReason] = useState({}); // requestId -> reason
  const [userRole, setUserRole] = useState(null); // Actual role from backend

  // Fetch user role from backend on mount
  useEffect(() => {
    async function fetchUserRole() {
      try {
        const res = await fetch('/api/dashboard', {
          credentials: 'include'
        });
        if (res.ok) {
          const data = await res.json();
          if (data.role) {
            setUserRole(data.role.toLowerCase());
          }
        }
      } catch (err) {
        console.error('Error fetching user role:', err);
      }
    }
    fetchUserRole();
  }, []);

  useEffect(() => {
    if (userRole !== null) {
      loadRequests();
    }
  }, [userRole]);

  async function loadRequests() {
    try {
      setLoading(true);
      setError('');
      setMessage('');

      // Check if user has advisor role (from backend)
      if (!userRole || userRole !== 'advisor') {
        setError(`Only advisors can view pending requests. Your role: ${userRole || 'unknown'}`);
        setLoading(false);
        return;
      }

      const res = await fetch('/api/major-minor-requests/pending', {
        credentials: 'include',
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || data.ok === false) {
        throw new Error(data.error || `Failed to load requests (HTTP ${res.status})`);
      }

      setRequests(data.requests || []);
      
      // If no requests, log for debugging
      if (!data.requests || data.requests.length === 0) {
        console.log('[MajorMinorRequests] No pending requests found in response');
      }
    } catch (e) {
      console.error('[MajorMinorRequests] Error loading requests:', e);
      setError(e.message || 'Failed to load requests.');
    } finally {
      setLoading(false);
    }
  }

  const handleApprove = async (requestId) => {
    if (!window.confirm('Approve this request?')) return;

    try {
      setActionLoading(true);
      setError('');
      setMessage('');

      const res = await fetch(`/api/major-minor-requests/${requestId}/approve`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || data.ok === false) {
        throw new Error(data.error || 'Failed to approve request.');
      }

      setMessage(data.message || 'Request approved successfully.');
      await loadRequests(); // Reload list
    } catch (e) {
      console.error(e);
      setError(e.message || 'Failed to approve request.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeny = async (requestId) => {
    const reason = denialReason[requestId] || '';
    if (!window.confirm('Deny this request?')) return;

    try {
      setActionLoading(true);
      setError('');
      setMessage('');

      const res = await fetch(`/api/major-minor-requests/${requestId}/deny`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ denialReason: reason || undefined }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || data.ok === false) {
        throw new Error(data.error || 'Failed to deny request.');
      }

      setMessage(data.message || 'Request denied successfully.');
      setDenialReason({ ...denialReason, [requestId]: '' });
      await loadRequests(); // Reload list
    } catch (e) {
      console.error(e);
      setError(e.message || 'Failed to deny request.');
    } finally {
      setActionLoading(false);
    }
  };

  // Show loading state while fetching role
  if (userRole === null) {
    return (
      <div style={{ padding: 20, maxWidth: 1000, margin: '0 auto' }}>
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div style={{ padding: 20, maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h1 style={{ margin: 0 }}>Major/Minor Declaration Requests</h1>
          <p style={{ color: '#555', margin: '8px 0 0 0' }}>
            Review and approve or deny student requests to declare or drop majors/minors.
          </p>
        </div>
        <button
          onClick={loadRequests}
          disabled={loading}
          style={{
            padding: '8px 16px',
            borderRadius: 6,
            border: '1px solid #ccc',
            background: '#fff',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontSize: 14,
          }}
        >
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {(error || message) && (
        <div
          style={{
            padding: 12,
            marginBottom: 16,
            borderRadius: 6,
            background: error ? '#f8d7da' : '#d4edda',
            color: error ? '#721c24' : '#155724',
            border: `1px solid ${error ? '#f5c6cb' : '#c3e6cb'}`,
            fontSize: 14,
          }}
        >
          {error || message}
        </div>
      )}

      {loading ? (
        <p>Loading requests...</p>
      ) : requests.length === 0 ? (
        <div
          style={{
            padding: 24,
            borderRadius: 8,
            background: '#f5f5f5',
            border: '1px solid #e0e0e0',
            textAlign: 'center',
          }}
        >
          <p style={{ color: '#666', margin: 0 }}>
            No pending requests at this time.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {requests.map((req) => (
            <div
              key={req.requestId}
              style={{
                padding: 16,
                borderRadius: 8,
                background: '#fff',
                border: '1px solid #e0e0e0',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 12 }}>
                <div style={{ flex: 1 }}>
                  <h3 style={{ margin: '0 0 8px 0' }}>
                    {req.requestType === 'DECLARE' ? 'Declare' : 'Drop'}: {req.programName}
                    {req.programCode && <span style={{ color: '#666', fontWeight: 'normal' }}> ({req.programCode})</span>}
                  </h3>
                  <p style={{ margin: '4px 0', color: '#666' }}>
                    <strong>Student:</strong> {req.studentName} (ID: {req.studentId})
                  </p>
                  <p style={{ margin: '4px 0', color: '#666' }}>
                    <strong>Type:</strong> {req.programType}
                  </p>
                  {req.effectiveTerm && (
                    <p style={{ margin: '4px 0', color: '#666' }}>
                      <strong>Effective Term:</strong> {req.effectiveTerm.semester} {req.effectiveTerm.year}
                    </p>
                  )}
                  <p style={{ margin: '4px 0', color: '#666', fontSize: 12 }}>
                    <strong>Requested:</strong> {new Date(req.requestedAt).toLocaleString()}
                  </p>
                </div>
              </div>

              <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #e0e0e0' }}>
                <div style={{ marginBottom: 8 }}>
                  <label style={{ display: 'block', marginBottom: 4, fontSize: 14, fontWeight: 'bold' }}>
                    Denial Reason (optional):
                  </label>
                  <textarea
                    value={denialReason[req.requestId] || ''}
                    onChange={(e) =>
                      setDenialReason({ ...denialReason, [req.requestId]: e.target.value })
                    }
                    placeholder="Enter reason for denial (optional)"
                    style={{
                      width: '100%',
                      padding: 8,
                      borderRadius: 4,
                      border: '1px solid #ccc',
                      fontSize: 14,
                      minHeight: 60,
                      fontFamily: 'inherit',
                    }}
                  />
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => handleApprove(req.requestId)}
                    disabled={actionLoading}
                    style={{
                      padding: '8px 16px',
                      borderRadius: 6,
                      border: 'none',
                      background: '#28a745',
                      color: 'white',
                      fontWeight: 'bold',
                      cursor: actionLoading ? 'not-allowed' : 'pointer',
                    }}
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => handleDeny(req.requestId)}
                    disabled={actionLoading}
                    style={{
                      padding: '8px 16px',
                      borderRadius: 6,
                      border: 'none',
                      background: '#dc3545',
                      color: 'white',
                      fontWeight: 'bold',
                      cursor: actionLoading ? 'not-allowed' : 'pointer',
                    }}
                  >
                    Deny
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

