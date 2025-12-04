import React, { useState, useEffect } from 'react';

export default function DeclareMajorMinor() {
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [availableMajors, setAvailableMajors] = useState([]);
  const [availableMinors, setAvailableMinors] = useState([]);

  const [majors, setMajors] = useState([]); // current declared majors
  const [minors, setMinors] = useState([]); // current declared minors

  const [selectedMajorId, setSelectedMajorId] = useState('');
  const [selectedMinorId, setSelectedMinorId] = useState('');

  // Load initial data from backend
  useEffect(() => {
    async function loadPrograms() {
      try {
        setLoading(true);
        setError('');
        setMessage('');

        const res = await fetch('/api/student-programs/init', {
          credentials: 'include',
        });

        if (!res.ok) {
          throw new Error(`Failed to load program data (HTTP ${res.status})`);
        }

        const data = await res.json();

        if (data.ok === false) {
          throw new Error(data.error || 'Failed to load program data.');
        }

        setAvailableMajors(data.availableMajors || []);
        setAvailableMinors(data.availableMinors || []);
        setMajors(data.majors || []);
        setMinors(data.minors || []);

        setSelectedMajorId('');
        setSelectedMinorId('');
      } catch (e) {
        console.error(e);
        setError(e.message || 'Failed to load program data.');
      } finally {
        setLoading(false);
      }
    }

    loadPrograms();
  }, []);

  // Helpers: ids already declared
  const declaredMajorIds = new Set(majors.map((m) => m.programId));
  const declaredMinorIds = new Set(minors.map((m) => m.programId));

  // Options user can add (exclude those already declared)
  const majorOptions = availableMajors.filter(
    (p) => !declaredMajorIds.has(p.programId)
  );
  const minorOptions = availableMinors.filter(
    (p) => !declaredMinorIds.has(p.programId)
  );

  const maxMajors = 2;
  const maxMinors = 3;
  const canAddMajor = majors.length < maxMajors && majorOptions.length > 0;
  const canAddMinor = minors.length < maxMinors && minorOptions.length > 0;

  const handleAddMajor = async () => {
    if (!selectedMajorId) {
      alert('Please select a major to add.');
      return;
    }

    try {
      setActionLoading(true);
      setError('');
      setMessage('');

      const res = await fetch('/api/student-programs/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ programId: Number(selectedMajorId) }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || data.ok === false) {
        throw new Error(
          data.error || 'Failed to add major. You may already have the max of 2.'
        );
      }

      setMajors(data.majors || []);
      setMinors(data.minors || []);
      setSelectedMajorId('');
      setMessage('Major added successfully.');
    } catch (e) {
      console.error(e);
      setError(e.message || 'Failed to add major.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleAddMinor = async () => {
    if (!selectedMinorId) {
      alert('Please select a minor to add.');
      return;
    }

    try {
      setActionLoading(true);
      setError('');
      setMessage('');

      const res = await fetch('/api/student-programs/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ programId: Number(selectedMinorId) }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || data.ok === false) {
        throw new Error(
          data.error || 'Failed to add minor. You may already have the max of 3.'
        );
      }

      setMajors(data.majors || []);
      setMinors(data.minors || []);
      setSelectedMinorId('');
      setMessage('Minor added successfully.');
    } catch (e) {
      console.error(e);
      setError(e.message || 'Failed to add minor.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDrop = async (program) => {
    if (!window.confirm(`Drop ${program.programName}?`)) return;

    try {
      setActionLoading(true);
      setError('');
      setMessage('');

      const res = await fetch('/api/student-programs/drop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ programId: program.programId }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || data.ok === false) {
        throw new Error(data.error || 'Failed to drop program.');
      }

      setMajors(data.majors || []);
      setMinors(data.minors || []);
      setMessage('Program dropped successfully.');
    } catch (e) {
      console.error(e);
      setError(e.message || 'Failed to drop program.');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div style={{ padding: 20, maxWidth: 800, margin: '0 auto' }}>
      <h1>Declare Your Major / Minor</h1>
      <p style={{ color: '#555', marginBottom: 16 }}>
        You may declare up to <strong>2 majors</strong> and <strong>3 minors</strong>.
      </p>

      {loading && <p>Loading program information...</p>}

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

      {!loading && (
        <>
          {/* CURRENT PROGRAMS */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
              gap: 16,
              marginBottom: 24,
            }}
          >
            {/* Majors */}
            <div
              style={{
                padding: 16,
                borderRadius: 8,
                background: '#f5f5f5',
                border: '1px solid #e0e0e0',
              }}
            >
              <h2 style={{ marginTop: 0 }}>Current Majors ({majors.length}/{maxMajors})</h2>
              {majors.length === 0 ? (
                <p style={{ color: '#666' }}>No majors declared.</p>
              ) : (
                <ul style={{ listStyle: 'none', paddingLeft: 0 }}>
                  {majors.map((m) => (
                    <li
                      key={m.programId}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: 8,
                      }}
                    >
                      <span>
                        <strong>{m.programName}</strong>{' '}
                        {m.programCode ? `(${m.programCode})` : ''}
                      </span>
                      <button
                        onClick={() => handleDrop(m)}
                        disabled={actionLoading}
                        style={{
                          padding: '4px 10px',
                          borderRadius: 4,
                          border: 'none',
                          background: '#dc3545',
                          color: 'white',
                          cursor: actionLoading ? 'not-allowed' : 'pointer',
                          fontSize: 12,
                          fontWeight: 'bold',
                        }}
                      >
                        Drop
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Minors */}
            <div
              style={{
                padding: 16,
                borderRadius: 8,
                background: '#f5f5f5',
                border: '1px solid #e0e0e0',
              }}
            >
              <h2 style={{ marginTop: 0 }}>Current Minors ({minors.length}/{maxMinors})</h2>
              {minors.length === 0 ? (
                <p style={{ color: '#666' }}>No minors declared.</p>
              ) : (
                <ul style={{ listStyle: 'none', paddingLeft: 0 }}>
                  {minors.map((m) => (
                    <li
                      key={m.programId}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: 8,
                      }}
                    >
                      <span>
                        <strong>{m.programName}</strong>{' '}
                        {m.programCode ? `(${m.programCode})` : ''}
                      </span>
                      <button
                        onClick={() => handleDrop(m)}
                        disabled={actionLoading}
                        style={{
                          padding: '4px 10px',
                          borderRadius: 4,
                          border: 'none',
                          background: '#dc3545',
                          color: 'white',
                          cursor: actionLoading ? 'not-allowed' : 'pointer',
                          fontSize: 12,
                          fontWeight: 'bold',
                        }}
                      >
                        Drop
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* ADD MAJOR / MINOR */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
              gap: 16,
            }}
          >
            {/* Add Major */}
            <div
              style={{
                padding: 16,
                borderRadius: 8,
                background: '#fff',
                border: '1px solid #e0e0e0',
              }}
            >
              <h3 style={{ marginTop: 0 }}>Add Major</h3>
              {majors.length >= maxMajors ? (
                <p style={{ color: '#666' }}>
                  You already have the maximum of {maxMajors} majors.
                </p>
              ) : majorOptions.length === 0 ? (
                <p style={{ color: '#666' }}>No additional majors available to declare.</p>
              ) : (
                <>
                  <select
                    value={selectedMajorId}
                    onChange={(e) => setSelectedMajorId(e.target.value)}
                    style={{
                      width: '100%',
                      padding: 8,
                      marginBottom: 10,
                      borderRadius: 6,
                      border: '1px solid #ccc',
                    }}
                  >
                    <option value="">-- Select Major --</option>
                    {majorOptions.map((p) => (
                      <option key={p.programId} value={p.programId}>
                        {p.programName}
                        {p.programCode ? ` (${p.programCode})` : ''}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={handleAddMajor}
                    disabled={!canAddMajor || actionLoading}
                    style={{
                      padding: '10px 16px',
                      borderRadius: 6,
                      border: 'none',
                      background: canAddMajor ? '#1976d2' : '#ccc',
                      color: 'white',
                      fontWeight: 'bold',
                      cursor:
                        !canAddMajor || actionLoading ? 'not-allowed' : 'pointer',
                    }}
                  >
                    Add Major
                  </button>
                </>
              )}
            </div>

            {/* Add Minor */}
            <div
              style={{
                padding: 16,
                borderRadius: 8,
                background: '#fff',
                border: '1px solid #e0e0e0',
              }}
            >
              <h3 style={{ marginTop: 0 }}>Add Minor</h3>
              {minors.length >= maxMinors ? (
                <p style={{ color: '#666' }}>
                  You already have the maximum of {maxMinors} minors.
                </p>
              ) : minorOptions.length === 0 ? (
                <p style={{ color: '#666' }}>No additional minors available to declare.</p>
              ) : (
                <>
                  <select
                    value={selectedMinorId}
                    onChange={(e) => setSelectedMinorId(e.target.value)}
                    style={{
                      width: '100%',
                      padding: 8,
                      marginBottom: 10,
                      borderRadius: 6,
                      border: '1px solid #ccc',
                    }}
                  >
                    <option value="">-- Select Minor --</option>
                    {minorOptions.map((p) => (
                      <option key={p.programId} value={p.programId}>
                        {p.programName}
                        {p.programCode ? ` (${p.programCode})` : ''}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={handleAddMinor}
                    disabled={!canAddMinor || actionLoading}
                    style={{
                      padding: '10px 16px',
                      borderRadius: 6,
                      border: 'none',
                      background: canAddMinor ? '#1976d2' : '#ccc',
                      color: 'white',
                      fontWeight: 'bold',
                      cursor:
                        !canAddMinor || actionLoading ? 'not-allowed' : 'pointer',
                    }}
                  >
                    Add Minor
                  </button>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
