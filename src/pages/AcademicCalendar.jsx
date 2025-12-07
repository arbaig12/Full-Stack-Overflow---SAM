import React, { useState, useEffect } from 'react';
import axios from 'axios';

export default function AcademicCalendar() {
  const [terms, setTerms] = useState([]);
  const [selectedTermId, setSelectedTermId] = useState(null);
  const [calendar, setCalendar] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch all terms on mount
  useEffect(() => {
    async function fetchTerms() {
      try {
        setLoading(true);
        setError(null);
        const response = await axios.get('/api/calendar/terms', {
          withCredentials: true,
        });
        
        if (response.data.ok && response.data.terms) {
          setTerms(response.data.terms);
          // Auto-select first term if available
          if (response.data.terms.length > 0) {
            setSelectedTermId(response.data.terms[0].termId);
          }
        }
      } catch (err) {
        console.error('Failed to fetch terms:', err);
        setError('Failed to load academic terms. Please try again.');
      } finally {
        setLoading(false);
      }
    }
    
    fetchTerms();
  }, []);

  // Fetch calendar when term is selected
  useEffect(() => {
    if (!selectedTermId) return;

    async function fetchCalendar() {
      try {
        setLoading(true);
        setError(null);
        const response = await axios.get(`/api/calendar/academic-calendar/${selectedTermId}?_t=${Date.now()}`, {
          withCredentials: true,
          headers: {
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
          }
        });
        
        console.log('[AcademicCalendar] API response:', response.data);
        if (response.data.ok) {
          setCalendar(response.data.calendar);
          console.log('[AcademicCalendar] Calendar data:', response.data.calendar);
          if (!response.data.calendar) {
            setError(response.data.message || `No academic calendar found for ${response.data.term?.semester} ${response.data.term?.year}. Please import the calendar using the Import page.`);
          } else {
            setError(null); // Clear error if calendar is found
          }
        } else {
          setError(response.data.error || 'Failed to load calendar');
        }
      } catch (err) {
        console.error('Failed to fetch calendar:', err);
        setError('Failed to load academic calendar. Please try again.');
        setCalendar(null);
      } finally {
        setLoading(false);
      }
    }
    
    fetchCalendar();
  }, [selectedTermId]);

  const formatDate = (dateString) => {
    if (!dateString) return 'Not set';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    } catch {
      return dateString;
    }
  };

  const selectedTerm = terms.find(t => t.termId === selectedTermId);

  return (
    <div style={{ padding: 20, maxWidth: 1000, margin: '0 auto' }}>
      <h1>Academic Calendar</h1>

      {loading && terms.length === 0 && (
        <p style={{ color: '#666' }}>Loading academic terms...</p>
      )}

      {error && (
        <div
          style={{
            padding: 12,
            marginBottom: 16,
            borderRadius: 6,
            background: '#f8d7da',
            color: '#721c24',
            border: '1px solid #f5c6cb',
          }}
        >
          {error}
        </div>
      )}

      {terms.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <label
            style={{
              display: 'block',
              marginBottom: 8,
              fontWeight: 'bold',
              fontSize: 16,
            }}
          >
            Select Term:
          </label>
          <select
            value={selectedTermId || ''}
            onChange={(e) => setSelectedTermId(Number(e.target.value))}
            style={{
              padding: '10px 16px',
              border: '1px solid #ddd',
              borderRadius: 6,
              fontSize: 16,
              minWidth: 200,
              cursor: 'pointer',
            }}
          >
            {terms.map((term) => (
              <option key={term.termId} value={term.termId}>
                {term.semester} {term.year}
              </option>
            ))}
          </select>
        </div>
      )}

      {loading && calendar === null && selectedTermId && (
        <p style={{ color: '#666' }}>Loading calendar data...</p>
      )}

      {calendar && selectedTerm && (
        <div
          style={{
            background: '#fff',
            border: '1px solid #e0e0e0',
            borderRadius: 8,
            padding: 24,
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          }}
        >
          <h2 style={{ marginTop: 0, marginBottom: 24, color: '#333' }}>
            {selectedTerm.semester} {selectedTerm.year} Academic Calendar
          </h2>

          <div style={{ display: 'grid', gap: 20 }}>
            {/* Registration Dates */}
            <div>
              <h3 style={{ color: '#1976d2', marginBottom: 12, fontSize: 18 }}>
                Registration & Enrollment
              </h3>
              <div style={{ display: 'grid', gap: 12 }}>
                {calendar.advancedRegistrationBegins && (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '250px 1fr',
                      gap: 16,
                      padding: 12,
                      background: '#f5f5f5',
                      borderRadius: 6,
                    }}
                  >
                    <strong>Advanced Registration Begins:</strong>
                    <span>{formatDate(calendar.advancedRegistrationBegins)}</span>
                  </div>
                )}
                {calendar.waitlist && (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '250px 1fr',
                      gap: 16,
                      padding: 12,
                      background: '#f5f5f5',
                      borderRadius: 6,
                    }}
                  >
                    <strong>Last Day to Waitlist:</strong>
                    <span>{formatDate(calendar.waitlist)}</span>
                  </div>
                )}
                {calendar.waitlistProcessEnds && (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '250px 1fr',
                      gap: 16,
                      padding: 12,
                      background: '#f5f5f5',
                      borderRadius: 6,
                    }}
                  >
                    <strong>Waitlist Processing Ends:</strong>
                    <span>{formatDate(calendar.waitlistProcessEnds)}</span>
                  </div>
                )}
                {calendar.lateRegistrationEnds && (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '250px 1fr',
                      gap: 16,
                      padding: 12,
                      background: '#fff3cd',
                      borderRadius: 6,
                      border: '1px solid #ffc107',
                    }}
                  >
                    <strong>Late Registration Ends:</strong>
                    <span style={{ fontWeight: 'bold', color: '#856404' }}>
                      {formatDate(calendar.lateRegistrationEnds)}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Major/Minor Changes */}
            <div>
              <h3 style={{ color: '#1976d2', marginBottom: 12, fontSize: 18 }}>
                Major & Minor Changes
              </h3>
              <div style={{ display: 'grid', gap: 12 }}>
                {calendar.majorAndMinorChangesBegin && (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '250px 1fr',
                      gap: 16,
                      padding: 12,
                      background: '#f5f5f5',
                      borderRadius: 6,
                    }}
                  >
                    <strong>Major/Minor Changes Begin:</strong>
                    <span>{formatDate(calendar.majorAndMinorChangesBegin)}</span>
                  </div>
                )}
                {calendar.majorAndMinorChangesEnd && (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '250px 1fr',
                      gap: 16,
                      padding: 12,
                      background: '#fff3cd',
                      borderRadius: 6,
                      border: '1px solid #ffc107',
                    }}
                  >
                    <strong>Major/Minor Changes End:</strong>
                    <span style={{ fontWeight: 'bold', color: '#856404' }}>
                      {formatDate(calendar.majorAndMinorChangesEnd)}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Academic Deadlines */}
            <div>
              <h3 style={{ color: '#1976d2', marginBottom: 12, fontSize: 18 }}>
                Academic Deadlines
              </h3>
              <div style={{ display: 'grid', gap: 12 }}>
                {calendar.GPNCSelectionEnds && (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '250px 1fr',
                      gap: 16,
                      padding: 12,
                      background: '#fff3cd',
                      borderRadius: 6,
                      border: '1px solid #ffc107',
                    }}
                  >
                    <strong>GPNC Selection Ends:</strong>
                    <span style={{ fontWeight: 'bold', color: '#856404' }}>
                      {formatDate(calendar.GPNCSelectionEnds)}
                    </span>
                  </div>
                )}
                {calendar.courseWithdrawalEnds && (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '250px 1fr',
                      gap: 16,
                      padding: 12,
                      background: '#f8d7da',
                      borderRadius: 6,
                      border: '1px solid #dc3545',
                    }}
                  >
                    <strong>Course Withdrawal Ends:</strong>
                    <span style={{ fontWeight: 'bold', color: '#721c24' }}>
                      {formatDate(calendar.courseWithdrawalEnds)}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Semester End */}
            <div>
              <h3 style={{ color: '#1976d2', marginBottom: 12, fontSize: 18 }}>
                Semester Information
              </h3>
              {calendar.semesterEnd && (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '250px 1fr',
                    gap: 16,
                    padding: 12,
                    background: '#d1ecf1',
                    borderRadius: 6,
                    border: '1px solid #0c5460',
                  }}
                >
                  <strong>Semester Ends:</strong>
                  <span style={{ fontWeight: 'bold', color: '#0c5460' }}>
                    {formatDate(calendar.semesterEnd)}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {!loading && !calendar && selectedTermId && !error && (
        <div
          style={{
            padding: 24,
            background: '#fff',
            border: '1px solid #e0e0e0',
            borderRadius: 8,
            textAlign: 'center',
            color: '#666',
          }}
        >
          <p>No academic calendar data available for the selected term.</p>
          <p style={{ fontSize: 14, marginTop: 8 }}>
            Please import the academic calendar using the Import page.
          </p>
        </div>
      )}

      {terms.length === 0 && !loading && (
        <div
          style={{
            padding: 24,
            background: '#fff',
            border: '1px solid #e0e0e0',
            borderRadius: 8,
            textAlign: 'center',
            color: '#666',
          }}
        >
          <p>No academic terms found.</p>
        </div>
      )}
    </div>
  );
}

