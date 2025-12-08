import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../auth/AuthContext';

// StudentSearchSelector Component
function StudentSearchSelector({ value, onChange, placeholder = "Search for student by name, email, or ID..." }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const searchTimeoutRef = useRef(null);
  const containerRef = useRef(null);

  // Load selected student info if value is provided
  useEffect(() => {
    if (value && !selectedStudent) {
      // Try to find student in results or fetch it
      fetchStudentInfo(value);
    } else if (!value && selectedStudent) {
      // Clear selection if value is cleared
      setSelectedStudent(null);
      setSearchTerm('');
    }
  }, [value]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setShowResults(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  async function fetchStudentInfo(studentId) {
    try {
      const res = await fetch(`/api/user-management/search?role=student`, {
        credentials: 'include'
      });
      if (res.ok) {
        const data = await res.json();
        const student = data.users?.find(u => 
          u.id === studentId || 
          u.id === String(studentId) || 
          u.userId === parseInt(studentId) ||
          String(u.userId) === String(studentId)
        );
        if (student) {
          setSelectedStudent(student);
          setSearchTerm(`${student.name} (${student.email})`);
        }
      }
    } catch (err) {
      console.error('Failed to fetch student info:', err);
    }
  }

  async function searchStudents(term) {
    if (!term || term.trim().length < 2) {
      setResults([]);
      setShowResults(false);
      return;
    }

    setLoading(true);
    try {
      const params = new URLSearchParams({ name: term, role: 'student' });
      const res = await fetch(`/api/user-management/search?${params.toString()}`, {
        credentials: 'include'
      });

      if (res.ok) {
        const data = await res.json();
        setResults(data.users || []);
        setShowResults(true);
      } else {
        setResults([]);
        setShowResults(false);
      }
    } catch (err) {
      console.error('Search failed:', err);
      setResults([]);
      setShowResults(false);
    } finally {
      setLoading(false);
    }
  }

  function handleSearchChange(e) {
    const term = e.target.value;
    setSearchTerm(term);
    setSelectedStudent(null);

    // Clear previous timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    // Debounce search
    searchTimeoutRef.current = setTimeout(() => {
      searchStudents(term);
    }, 300);
  }

  function handleSelectStudent(student) {
    setSelectedStudent(student);
    setSearchTerm(`${student.name} (${student.email})`);
    setShowResults(false);
    // Use userId if available, otherwise fall back to id
    onChange(student.userId || student.id); // Pass user_id to parent
  }

  function handleClear() {
    setSearchTerm('');
    setSelectedStudent(null);
    setResults([]);
    setShowResults(false);
    onChange('');
  }

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      <div style={{ position: 'relative' }}>
        <input
          type="text"
          value={searchTerm}
          onChange={handleSearchChange}
          onFocus={() => {
            if (results.length > 0) setShowResults(true);
            else if (searchTerm.length >= 2) searchStudents(searchTerm);
          }}
          placeholder={placeholder}
          style={{
            width: '100%',
            padding: '8px 12px',
            paddingRight: selectedStudent ? '60px' : '12px',
            border: '1px solid #ddd',
            borderRadius: 6,
            fontSize: 14
          }}
        />
        {selectedStudent && (
          <button
            type="button"
            onClick={handleClear}
            style={{
              position: 'absolute',
              right: 8,
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'none',
              border: 'none',
              color: '#666',
              cursor: 'pointer',
              fontSize: 18,
              padding: '0 4px'
            }}
            title="Clear selection"
          >
            ×
          </button>
        )}
      </div>
      {showResults && results.length > 0 && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          background: 'white',
          border: '1px solid #ddd',
          borderRadius: 6,
          marginTop: 4,
          maxHeight: 300,
          overflowY: 'auto',
          zIndex: 1000,
          boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
        }}>
          {results.map(student => (
            <div
              key={student.id}
              onClick={() => handleSelectStudent(student)}
              style={{
                padding: '12px',
                cursor: 'pointer',
                borderBottom: '1px solid #eee',
                ':hover': { background: '#f5f5f5' }
              }}
              onMouseEnter={(e) => e.target.style.background = '#f5f5f5'}
              onMouseLeave={(e) => e.target.style.background = 'white'}
            >
              <div style={{ fontWeight: 'bold', marginBottom: 4 }}>
                {student.name}
              </div>
              <div style={{ fontSize: 12, color: '#666' }}>
                {student.email} • ID: {student.id}
              </div>
            </div>
          ))}
        </div>
      )}
      {loading && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          background: 'white',
          border: '1px solid #ddd',
          borderRadius: 6,
          marginTop: 4,
          padding: 12,
          zIndex: 1000
        }}>
          Searching...
        </div>
      )}
      {showResults && !loading && results.length === 0 && searchTerm.length >= 2 && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          background: 'white',
          border: '1px solid #ddd',
          borderRadius: 6,
          marginTop: 4,
          padding: 12,
          zIndex: 1000
        }}>
          No students found
        </div>
      )}
    </div>
  );
}

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
  const [allStudents, setAllStudents] = useState([]);
  const [studentSearchFilter, setStudentSearchFilter] = useState('');
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [selectedStudentData, setSelectedStudentData] = useState({ holds: [], waivers: [] });
  
  // Form states
  const [showHoldForm, setShowHoldForm] = useState(false);
  const [showWaiverForm, setShowWaiverForm] = useState(false);
  const [holdForm, setHoldForm] = useState({ studentId: '', holdType: '', note: '' });
  const [waiverForm, setWaiverForm] = useState({ student_id: '', waiver_type: '', course_id: '', class_id: '', reason: '' });

  useEffect(() => {
    loadData();
  }, [role, selectedStudent]);

  async function loadData() {
    try {
      setLoading(true);
      setError('');

      // Add cache-busting timestamp to all requests
      const cacheBuster = `_t=${Date.now()}`;

      if (role === 'student') {
        // Get current user's student ID
        const studentId = user?.user_id || user?.userId;
        if (!studentId) {
          setError('Student ID not found');
          return;
        }

        const res = await fetch(`/api/waivers-holds/students/${studentId}?${cacheBuster}`, {
          credentials: 'include',
          cache: 'no-cache'
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Failed to load data');
        }

        const data = await res.json();
        console.log('[WaiversHolds] Loaded student data:', { holdsCount: data.holds?.length || 0, waiversCount: data.waivers?.length || 0 });
        setStudentData({ holds: data.holds || [], waivers: data.waivers || [] });
      } else if (role === 'advisor' || role === 'registrar') {
        // Load ALL students (not just those with holds/waivers)
        const allStudentsRes = await fetch(`/api/user-management/students?${cacheBuster}`, {
          credentials: 'include',
          cache: 'no-cache'
        });

        if (allStudentsRes.ok) {
          const allStudentsData = await allStudentsRes.json();
          setAllStudents(allStudentsData.users || []);
        }

        // Also load list of students with holds/waivers for reference
        const studentsRes = await fetch(`/api/waivers-holds/students?${cacheBuster}`, {
          credentials: 'include',
          cache: 'no-cache'
        });

        if (studentsRes.ok) {
          const studentsData = await studentsRes.json();
          console.log('[WaiversHolds] Loaded students list:', { count: studentsData.students?.length || 0 });
          setStudentsList(studentsData.students || []);
        }

        // If a student is selected, load their details
        if (selectedStudent) {
          // Ensure we're using the numeric userId, not the SBU ID string
          const studentIdToFetch = String(selectedStudent).trim();
          console.log('[WaiversHolds] Fetching holds for selected student:', studentIdToFetch);
          
          const detailRes = await fetch(`/api/waivers-holds/students/${studentIdToFetch}?${cacheBuster}`, {
            credentials: 'include',
            cache: 'no-cache'
          });

          if (detailRes.ok) {
            const detailData = await detailRes.json();
            console.log('[WaiversHolds] Loaded selected student details:', { 
              requestedStudentId: studentIdToFetch,
              returnedStudentId: detailData.studentId,
              holdsCount: detailData.holds?.length || 0, 
              waiversCount: detailData.waivers?.length || 0,
              holds: detailData.holds
            });
            setSelectedStudentData({ holds: detailData.holds || [], waivers: detailData.waivers || [] });
          } else {
            const errorData = await detailRes.json().catch(() => ({ error: 'Unknown error' }));
            console.error('[WaiversHolds] Failed to load selected student details:', {
              status: detailRes.status,
              studentId: studentIdToFetch,
              error: errorData.error
            });
            setSelectedStudentData({ holds: [], waivers: [] });
            setError(`Failed to load holds for selected student: ${errorData.error || 'Unknown error'}`);
          }
        } else {
          // Clear selected student data if no student is selected
          setSelectedStudentData({ holds: [], waivers: [] });
        }
      }
    } catch (err) {
      setError(err.message);
      console.error('[WaiversHolds] Error loading data:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateHold(e) {
    e.preventDefault();
    try {
      const res = await fetch('/api/registration/holds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          studentId: holdForm.studentId,
          holdType: holdForm.holdType,
          note: holdForm.note
        })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create hold');
      }

      const data = await res.json();
      console.log('[WaiversHolds] Hold created successfully:', data);

      // Ensure selectedStudent is set to the student the hold was created for
      const targetStudentId = holdForm.studentId;
      if (targetStudentId) {
        // Always set selectedStudent to ensure the hold appears for the correct student
        if (!selectedStudent || String(selectedStudent) !== String(targetStudentId)) {
          console.log('[WaiversHolds] Setting selectedStudent to:', targetStudentId);
          setSelectedStudent(targetStudentId);
        }
        // Clear selected student data to force a fresh fetch
        setSelectedStudentData({ holds: [], waivers: [] });
      }

      setShowHoldForm(false);
      setHoldForm({ studentId: '', holdType: '', note: '' });
      
      // Small delay to ensure database commit, then force refresh with cache-busting
      await new Promise(resolve => setTimeout(resolve, 100));
      await loadData();
      
      // Clear any previous errors
      setError('');
    } catch (err) {
      console.error('[WaiversHolds] Error creating hold:', err);
      setError(err.message);
    }
  }

  async function handleResolveHold(holdId) {
    if (!window.confirm('Are you sure you want to remove this hold?')) return;

    try {
      const res = await fetch(`/api/registration/holds/${holdId}`, {
        method: 'DELETE',
        credentials: 'include'
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to remove hold');
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
                setHoldForm({ studentId: selectedStudent || '', holdType: '', note: '' });
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
          <div style={{ marginBottom: 8 }}>
            <input
              type="text"
              placeholder="Search students by name, email, or ID..."
              value={studentSearchFilter}
              onChange={(e) => setStudentSearchFilter(e.target.value)}
              style={{
                width: '100%',
                maxWidth: 400,
                padding: '8px 12px',
                border: '1px solid #ddd',
                borderRadius: 6,
                fontSize: 14
              }}
            />
          </div>
          <select
            value={selectedStudent || ''}
            onChange={(e) => {
              const newSelectedStudent = e.target.value || null;
              console.log('[WaiversHolds] Student selected:', newSelectedStudent);
              setSelectedStudent(newSelectedStudent);
              setSelectedStudentData({ holds: [], waivers: [] });
              // Clear any previous errors
              setError('');
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
            {allStudents
              .filter(s => {
                if (!studentSearchFilter) return true;
                const filter = studentSearchFilter.toLowerCase();
                return (
                  s.name.toLowerCase().includes(filter) ||
                  s.email.toLowerCase().includes(filter) ||
                  s.id.includes(filter) ||
                  String(s.userId || '').includes(filter)
                );
              })
              .map(s => {
                // Match student from studentsList (has holds/waivers) using user_id
                // studentsList.studentId is the database user_id, so we compare with s.userId
                const hasHolds = studentsList.find(sl => {
                  const match = (
                    sl.studentId === s.userId ||
                    sl.studentId === parseInt(s.userId) ||
                    parseInt(sl.studentId) === s.userId ||
                    String(sl.studentId) === String(s.userId)
                  );
                  return match;
                });
                // Always use userId (database user_id) for the value, not SBU ID
                const optionValue = s.userId ? String(s.userId) : String(s.id);
                return (
                  <option key={s.id} value={optionValue}>
                    {s.name} ({s.email}) - ID: {s.id}
                    {hasHolds && ` - ${hasHolds.activeHoldsCount} holds, ${hasHolds.pendingWaiversCount} pending waivers`}
                  </option>
                );
              })}
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
                  Student:
                </label>
                <StudentSearchSelector
                  value={holdForm.studentId}
                  onChange={(studentId) => setHoldForm({ ...holdForm, studentId })}
                  placeholder="Search for student by name, email, or ID..."
                />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>
                  Hold Type:
                </label>
                <select
                  value={holdForm.holdType}
                  onChange={(e) => setHoldForm({ ...holdForm, holdType: e.target.value })}
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
                  <option value="other">Other</option>
                </select>
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>
                  Note (optional):
                </label>
                <textarea
                  value={holdForm.note}
                  onChange={(e) => setHoldForm({ ...holdForm, note: e.target.value })}
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
                  Student:
                </label>
                <StudentSearchSelector
                  value={waiverForm.student_id}
                  onChange={(studentId) => setWaiverForm({ ...waiverForm, student_id: studentId })}
                  placeholder="Search for student by name, email, or ID..."
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

