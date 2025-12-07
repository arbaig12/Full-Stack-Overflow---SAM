import React, { useState, useEffect } from 'react';
import { useAuth } from '../auth/AuthContext';

export default function WaiversHolds() {
  const { user } = useAuth();
  const [role, setRole] = useState(() => localStorage.getItem('role') || 'student');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('holds');
  
  // For student view
  const [studentData, setStudentData] = useState({ holds: [], waivers: [] });
  
  // For advisor/registrar view
  const [studentsList, setStudentsList] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [selectedStudentData, setSelectedStudentData] = useState({ holds: [], waivers: [] });
  
  // Form states
  const [showHoldForm, setShowHoldForm] = useState(false);
  const [showWaiverForm, setShowWaiverForm] = useState(false);
  const [holdForm, setHoldForm] = useState({ student_id: '', hold_type: '', reason: '' });
  const [waiverForm, setWaiverForm] = useState({ student_id: '', waiver_type: '', course_id: '', class_id: '', reason: '' });

  useEffect(() => {
    loadData();
  }, [role, selectedStudent]);

  async function loadData() {
    try {
      setLoading(true);
      setError('');

      if (role === 'student') {
        // Get current user's student ID
        const studentId = user?.user_id || user?.userId;
        if (!studentId) {
          setError('Student ID not found');
          return;
        }

        const res = await fetch(`/api/waivers-holds/students/${studentId}`, {
          credentials: 'include'
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Failed to load data');
        }

        const data = await res.json();
        setStudentData({ holds: data.holds || [], waivers: data.waivers || [] });
      } else if (role === 'advisor' || role === 'registrar') {
        // Load list of students with holds/waivers
        const studentsRes = await fetch('/api/waivers-holds/students', {
          credentials: 'include'
        });

        if (studentsRes.ok) {
          const studentsData = await studentsRes.json();
          setStudentsList(studentsData.students || []);
        }

        // If a student is selected, load their details
        if (selectedStudent) {
          const detailRes = await fetch(`/api/waivers-holds/students/${selectedStudent}`, {
            credentials: 'include'
          });

          if (detailRes.ok) {
            const detailData = await detailRes.json();
            setSelectedStudentData({ holds: detailData.holds || [], waivers: detailData.waivers || [] });
          }
        }
      }
    } catch (err) {
      setError(err.message);
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateHold(e) {
    e.preventDefault();
    try {
      const res = await fetch('/api/waivers-holds/holds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(holdForm)
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create hold');
      }

      setShowHoldForm(false);
      setHoldForm({ student_id: '', hold_type: '', reason: '' });
      await loadData();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleResolveHold(holdId) {
    if (!window.confirm('Are you sure you want to resolve this hold?')) return;

    try {
      const res = await fetch(`/api/waivers-holds/holds/${holdId}/resolve`, {
        method: 'PUT',
        credentials: 'include'
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to resolve hold');
      }

      await loadData();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleCreateWaiver(e) {
    e.preventDefault();
    try {
      const res = await fetch('/api/waivers-holds/waivers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(waiverForm)
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create waiver');
      }

      setShowWaiverForm(false);
      setWaiverForm({ student_id: '', waiver_type: '', course_id: '', class_id: '', reason: '' });
      await loadData();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleApproveWaiver(waiverId) {
    try {
      const res = await fetch(`/api/waivers-holds/waivers/${waiverId}/approve`, {
        method: 'PUT',
        credentials: 'include'
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to approve waiver');
      }

      await loadData();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleRejectWaiver(waiverId) {
    if (!window.confirm('Are you sure you want to reject this waiver?')) return;

    try {
      const res = await fetch(`/api/waivers-holds/waivers/${waiverId}/reject`, {
        method: 'PUT',
        credentials: 'include'
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to reject waiver');
      }

      await loadData();
    } catch (err) {
      setError(err.message);
    }
  }

  const currentHolds = role === 'student' ? studentData.holds : selectedStudentData.holds;
  const currentWaivers = role === 'student' ? studentData.waivers : selectedStudentData.waivers;

  if (loading) {
    return <div style={{ padding: 20 }}>Loading...</div>;
  }

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ margin: 0 }}>Waivers & Holds</h1>
        {(role === 'advisor' || role === 'registrar') && (
          <div style={{ display: 'flex', gap: 12 }}>
            <button
              onClick={() => {
                setShowHoldForm(true);
                setHoldForm({ student_id: selectedStudent || '', hold_type: '', reason: '' });
              }}
              style={{
                padding: '10px 20px',
                borderRadius: 6,
                border: 'none',
                background: '#f44336',
                color: 'white',
                cursor: 'pointer',
                fontWeight: 'bold'
              }}
            >
              Create Hold
            </button>
            <button
              onClick={() => {
                setShowWaiverForm(true);
                setWaiverForm({ student_id: selectedStudent || '', waiver_type: '', course_id: '', class_id: '', reason: '' });
              }}
              style={{
                padding: '10px 20px',
                borderRadius: 6,
                border: 'none',
                background: '#2196f3',
                color: 'white',
                cursor: 'pointer',
                fontWeight: 'bold'
              }}
            >
              Create Waiver
            </button>
          </div>
        )}
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

      {(role === 'advisor' || role === 'registrar') && (
        <div style={{ marginBottom: 24 }}>
          <label style={{ display: 'block', marginBottom: 8, fontWeight: 'bold' }}>
            Select Student:
          </label>
          <select
            value={selectedStudent || ''}
            onChange={(e) => {
              setSelectedStudent(e.target.value || null);
              setSelectedStudentData({ holds: [], waivers: [] });
            }}
            style={{
              width: '100%',
              maxWidth: 400,
              padding: '8px 12px',
              border: '1px solid #ddd',
              borderRadius: 6,
              fontSize: 14
            }}
          >
            <option value="">-- Select a student --</option>
            {studentsList.map(s => (
              <option key={s.studentId} value={s.studentId}>
                {s.studentName} ({s.studentEmail}) - {s.activeHoldsCount} holds, {s.pendingWaiversCount} pending waivers
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        <button
          onClick={() => setActiveTab('holds')}
          style={{
            padding: '10px 20px',
            borderRadius: 6,
            border: 'none',
            background: activeTab === 'holds' ? '#1976d2' : '#f5f5f5',
            color: activeTab === 'holds' ? 'white' : '#333',
            fontWeight: 'bold',
            cursor: 'pointer'
          }}
        >
          Registration Holds
        </button>
        <button
          onClick={() => setActiveTab('waivers')}
          style={{
            padding: '10px 20px',
            borderRadius: 6,
            border: 'none',
            background: activeTab === 'waivers' ? '#1976d2' : '#f5f5f5',
            color: activeTab === 'waivers' ? 'white' : '#333',
            fontWeight: 'bold',
            cursor: 'pointer'
          }}
        >
          Waivers
        </button>
      </div>

      {/* Holds Tab */}
      {activeTab === 'holds' && (
        <div>
          <h2>Registration Holds</h2>
          {currentHolds.length === 0 ? (
            <p style={{ color: '#666' }}>No holds found.</p>
          ) : (
            <div style={{ display: 'grid', gap: 12 }}>
              {currentHolds.map(hold => (
                <div
                  key={hold.holdId}
                  style={{
                    padding: 16,
                    borderRadius: 8,
                    background: hold.isActive ? '#fff3cd' : '#d4edda',
                    border: `1px solid ${hold.isActive ? '#ffc107' : '#28a745'}`
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 'bold', marginBottom: 8 }}>
                        {hold.holdType} {hold.isActive ? '(Active)' : '(Resolved)'}
                      </div>
                      <div style={{ color: '#666', marginBottom: 4 }}>
                        <strong>Reason:</strong> {hold.reason}
                      </div>
                      <div style={{ color: '#666', marginBottom: 4, fontSize: 14 }}>
                        <strong>Issued by:</strong> {hold.issuedByName || 'Unknown'} on {new Date(hold.issuedAt).toLocaleString()}
                      </div>
                      {hold.resolvedAt && (
                        <div style={{ color: '#666', fontSize: 14 }}>
                          <strong>Resolved:</strong> {new Date(hold.resolvedAt).toLocaleString()}
                        </div>
                      )}
                    </div>
                    {hold.isActive && (role === 'advisor' || role === 'registrar') && (
                      <button
                        onClick={() => handleResolveHold(hold.holdId)}
                        style={{
                          padding: '6px 12px',
                          borderRadius: 4,
                          border: 'none',
                          background: '#28a745',
                          color: 'white',
                          cursor: 'pointer',
                          fontSize: 12
                        }}
                      >
                        Resolve
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Waivers Tab */}
      {activeTab === 'waivers' && (
        <div>
          <h2>Waivers</h2>
          {currentWaivers.length === 0 ? (
            <p style={{ color: '#666' }}>No waivers found.</p>
          ) : (
            <div style={{ display: 'grid', gap: 12 }}>
              {currentWaivers.map(waiver => (
                <div
                  key={waiver.waiverId}
                  style={{
                    padding: 16,
                    borderRadius: 8,
                    background: waiver.status === 'approved' ? '#d4edda' : waiver.status === 'rejected' ? '#f8d7da' : '#fff3cd',
                    border: `1px solid ${waiver.status === 'approved' ? '#28a745' : waiver.status === 'rejected' ? '#dc3545' : '#ffc107'}`
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 'bold', marginBottom: 8 }}>
                        {waiver.waiverType} - {waiver.courseCode || 'N/A'} ({waiver.status})
                      </div>
                      {waiver.courseTitle && (
                        <div style={{ color: '#666', marginBottom: 4 }}>
                          <strong>Course:</strong> {waiver.courseTitle}
                        </div>
                      )}
                      <div style={{ color: '#666', marginBottom: 4 }}>
                        <strong>Reason:</strong> {waiver.reason}
                      </div>
                      <div style={{ color: '#666', marginBottom: 4, fontSize: 14 }}>
                        <strong>Requested by:</strong> {waiver.requestedByName || 'Unknown'} on {new Date(waiver.requestedAt).toLocaleString()}
                      </div>
                      {waiver.approvedAt && (
                        <div style={{ color: '#666', fontSize: 14 }}>
                          <strong>Approved by:</strong> {waiver.approvedByName || 'Unknown'} on {new Date(waiver.approvedAt).toLocaleString()}
                        </div>
                      )}
                    </div>
                    {waiver.status === 'pending' && (role === 'instructor' || role === 'advisor' || role === 'registrar') && (
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          onClick={() => handleApproveWaiver(waiver.waiverId)}
                          style={{
                            padding: '6px 12px',
                            borderRadius: 4,
                            border: 'none',
                            background: '#28a745',
                            color: 'white',
                            cursor: 'pointer',
                            fontSize: 12
                          }}
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => handleRejectWaiver(waiver.waiverId)}
                          style={{
                            padding: '6px 12px',
                            borderRadius: 4,
                            border: 'none',
                            background: '#dc3545',
                            color: 'white',
                            cursor: 'pointer',
                            fontSize: 12
                          }}
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Create Hold Modal */}
      {showHoldForm && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: 'white',
            padding: 24,
            borderRadius: 12,
            maxWidth: 500,
            width: '90%'
          }}>
            <h2 style={{ marginTop: 0 }}>Create Registration Hold</h2>
            <form onSubmit={handleCreateHold}>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>
                  Student ID:
                </label>
                <input
                  type="text"
                  value={holdForm.student_id}
                  onChange={(e) => setHoldForm({ ...holdForm, student_id: e.target.value })}
                  required
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #ddd',
                    borderRadius: 6
                  }}
                />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>
                  Hold Type:
                </label>
                <select
                  value={holdForm.hold_type}
                  onChange={(e) => setHoldForm({ ...holdForm, hold_type: e.target.value })}
                  required
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #ddd',
                    borderRadius: 6
                  }}
                >
                  <option value="">-- Select hold type --</option>
                  <option value="academic_advising">Academic Advising</option>
                  <option value="financial">Financial</option>
                  <option value="disciplinary">Disciplinary</option>
                  <option value="health">Health</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>
                  Reason:
                </label>
                <textarea
                  value={holdForm.reason}
                  onChange={(e) => setHoldForm({ ...holdForm, reason: e.target.value })}
                  required
                  rows={4}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #ddd',
                    borderRadius: 6
                  }}
                />
              </div>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => setShowHoldForm(false)}
                  style={{
                    padding: '10px 20px',
                    borderRadius: 6,
                    border: '1px solid #ddd',
                    background: 'white',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{
                    padding: '10px 20px',
                    borderRadius: 6,
                    border: 'none',
                    background: '#f44336',
                    color: 'white',
                    cursor: 'pointer',
                    fontWeight: 'bold'
                  }}
                >
                  Create Hold
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Waiver Modal */}
      {showWaiverForm && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: 'white',
            padding: 24,
            borderRadius: 12,
            maxWidth: 500,
            width: '90%'
          }}>
            <h2 style={{ marginTop: 0 }}>Create Waiver</h2>
            <form onSubmit={handleCreateWaiver}>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>
                  Student ID:
                </label>
                <input
                  type="text"
                  value={waiverForm.student_id}
                  onChange={(e) => setWaiverForm({ ...waiverForm, student_id: e.target.value })}
                  required
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #ddd',
                    borderRadius: 6
                  }}
                />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>
                  Waiver Type:
                </label>
                <select
                  value={waiverForm.waiver_type}
                  onChange={(e) => setWaiverForm({ ...waiverForm, waiver_type: e.target.value })}
                  required
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #ddd',
                    borderRadius: 6
                  }}
                >
                  <option value="">-- Select waiver type --</option>
                  <option value="prerequisite">Prerequisite</option>
                  <option value="time_conflict">Time Conflict</option>
                  <option value="corequisite">Corequisite</option>
                  <option value="degree_requirement">Degree Requirement</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>
                  Course ID (optional):
                </label>
                <input
                  type="text"
                  value={waiverForm.course_id}
                  onChange={(e) => setWaiverForm({ ...waiverForm, course_id: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #ddd',
                    borderRadius: 6
                  }}
                />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>
                  Class ID (optional):
                </label>
                <input
                  type="text"
                  value={waiverForm.class_id}
                  onChange={(e) => setWaiverForm({ ...waiverForm, class_id: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #ddd',
                    borderRadius: 6
                  }}
                />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>
                  Reason:
                </label>
                <textarea
                  value={waiverForm.reason}
                  onChange={(e) => setWaiverForm({ ...waiverForm, reason: e.target.value })}
                  required
                  rows={4}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #ddd',
                    borderRadius: 6
                  }}
                />
              </div>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => setShowWaiverForm(false)}
                  style={{
                    padding: '10px 20px',
                    borderRadius: 6,
                    border: '1px solid #ddd',
                    background: 'white',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{
                    padding: '10px 20px',
                    borderRadius: 6,
                    border: 'none',
                    background: '#2196f3',
                    color: 'white',
                    cursor: 'pointer',
                    fontWeight: 'bold'
                  }}
                >
                  Create Waiver
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

