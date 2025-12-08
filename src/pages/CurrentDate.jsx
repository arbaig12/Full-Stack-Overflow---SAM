import React, { useState, useEffect } from 'react';

export default function CurrentDateConfig() {
  const [manualDate, setManualDate] = useState('');
  const [current, setCurrent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  // Fetch current date from backend on mount
  useEffect(() => {
    fetchCurrentDate();
  }, []);

  const fetchCurrentDate = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/current-date', {
        credentials: 'include'
      });
      if (!res.ok) {
        throw new Error('Failed to fetch current date');
      }
      const data = await res.json();
      if (data.ok) {
        setCurrent(new Date(data.currentDateObject));
      }
    } catch (err) {
      console.error('Error fetching current date:', err);
      setMessage('Error loading current date');
    } finally {
      setLoading(false);
    }
  };

  const handleApply = async () => {
    try {
      setMessage('');
      const res = await fetch('/api/current-date', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({ date: manualDate || null })
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to set date');
      }

      const data = await res.json();
      if (data.ok) {
        setCurrent(new Date(data.currentDateObject));
        setMessage(data.message || 'Date updated successfully');
        setManualDate(''); // Clear the input
      }
    } catch (err) {
      console.error('Error setting date:', err);
      setMessage(err.message || 'Error setting date');
    }
  };

  return (
    <div style={{ maxWidth: 500, margin: "0 auto", padding: 20 }}>
      <h3>Current Date Configuration</h3>
      {loading ? (
        <p>Loading current date...</p>
      ) : (
        <>
          <p style={{ marginBottom: 20, fontSize: 16 }}>
            <strong>Current system date:</strong> {current ? current.toDateString() : 'Unknown'}
          </p>

          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', marginBottom: 8, fontWeight: 'bold' }}>
              Set Custom Date (YYYY-MM-DD):
            </label>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <input
                type="date"
                value={manualDate}
                onChange={e => setManualDate(e.target.value)}
                style={{ padding: 8, fontSize: 14, border: '1px solid #ddd', borderRadius: 4 }}
              />
              <button 
                onClick={handleApply} 
                style={{ 
                  padding: "8px 16px", 
                  fontSize: 14,
                  backgroundColor: '#2196f3',
                  color: 'white',
                  border: 'none',
                  borderRadius: 4,
                  cursor: 'pointer'
                }}
              >
                Apply
              </button>
            </div>
          </div>

          {message && (
            <div style={{
              padding: 12,
              marginBottom: 20,
              backgroundColor: message.includes('Error') ? '#ffebee' : '#e8f5e9',
              border: `1px solid ${message.includes('Error') ? '#f44336' : '#4caf50'}`,
              borderRadius: 4,
              color: message.includes('Error') ? '#c62828' : '#2e7d32'
            }}>
              {message}
            </div>
          )}

          <p style={{ marginTop: 20, color: '#666', fontSize: 14 }}>
            Leave the date field empty and click Apply to reset to the actual current date.
          </p>
        </>
      )}
    </div>
  );
}

