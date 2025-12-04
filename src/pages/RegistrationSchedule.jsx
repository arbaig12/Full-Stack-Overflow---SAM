// src/pages/RegistrationSchedule.jsx
import React, { useEffect, useState } from 'react';

export default function RegistrationSchedule() {
  const [activeTab, setActiveTab] = useState('register');

  const [terms, setTerms] = useState([]);
  const [currentTermId, setCurrentTermId] = useState('');
  const [selectedTermId, setSelectedTermId] = useState('');

  const [sections, setSections] = useState([]);       // all sections from backend
  const [enrollments, setEnrollments] = useState([]); // my enrollments

  const [searchTerm, setSearchTerm] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');

  // ---------- Helper functions for schedule conflict logic ----------

  /**
   * Parse meeting days from a compact code string OR from scheduleText.
   * Examples it should handle:
   *  - "MWF"
   *  - "MTuThu"
   *  - "MWF 11:30-12:50"
   *  - "TuTh 09:30-10:45"
   */
  const parseMeetingDays = (daysOrSchedule) => {
    if (!daysOrSchedule) return new Set();

    const s = String(daysOrSchedule).replace(/\s+/g, ''); // remove spaces
    const result = [];
    let i = 0;

    while (i < s.length) {
      // Check 2-letter codes first
      if (s.startsWith('Th', i)) {
        result.push('Th');
        i += 2;
      } else if (s.startsWith('Tu', i)) {
        result.push('Tu');
        i += 2;
      } else {
        const ch = s[i];

        // Single-letter day codes we care about
        if (['M', 'T', 'W', 'F', 'S'].includes(ch)) {
          result.push(ch);
        }

        i += 1;
      }
    }

    return new Set(result);
  };

  // Expect meetingTimes like "09:30-10:45" or embedded in scheduleText
  const parseTimeRange = (timeStr) => {
    if (!timeStr) return null;
    const str = String(timeStr);

    // Basic 24-hour HH:MM-HH:MM
    const m = str.match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/);
    if (!m) return null;

    const [, h1, m1, h2, m2] = m;
    const start = parseInt(h1, 10) * 60 + parseInt(m1, 10);
    const end = parseInt(h2, 10) * 60 + parseInt(m2, 10);

    if (Number.isNaN(start) || Number.isNaN(end) || end <= start) {
      return null;
    }

    return { start, end }; // minutes since midnight
  };

  const timeRangesOverlap = (a, b) => {
    // [a.start, a.end) intersects [b.start, b.end)
    return a.start < b.end && b.start < a.end;
  };

  /**
   * Check for conflict between a candidate section and current enrollments
   * in the selected term.
   *
   * Rule: if they share at least one day AND the time ranges overlap,
   * then it's a conflict.
   */
  const findScheduleConflict = (candidate) => {
    // Use meetingDays first, but fall back to scheduleText for both days & times.
    const candDaySource = candidate.meetingDays || candidate.scheduleText;
    const candDays = parseMeetingDays(candDaySource);
    const candRange =
      parseTimeRange(candidate.meetingTimes) ||
      parseTimeRange(candidate.scheduleText);

    if (!candDays.size || !candRange) {
      // If we can't interpret candidate's schedule, don't block.
      return null;
    }

    for (const enr of enrollments) {
      if (String(enr.termId) !== String(selectedTermId)) continue;

      const enrDaySource = enr.meetingDays || enr.scheduleText;
      const enrDays = parseMeetingDays(enrDaySource);
      const enrRange =
        parseTimeRange(enr.meetingTimes) ||
        parseTimeRange(enr.scheduleText);

      if (!enrDays.size || !enrRange) continue;

      // 🔴 Any overlapping day at all?
      const hasDayOverlap = [...candDays].some((d) => enrDays.has(d));
      if (!hasDayOverlap) continue;

      // 🔴 Time overlap on at least one shared day?
      if (timeRangesOverlap(candRange, enrRange)) {
        return enr; // First conflicting enrollment
      }
    }

    return null;
  };

  // ---------- Initial load ----------

  useEffect(() => {
    async function loadRegistrationData() {
      try {
        setLoading(true);
        setError('');
        setMessage('');

        const res = await fetch('/api/registration/init', {
          credentials: 'include',
        });

        if (!res.ok) {
          throw new Error(`Failed to load registration data (HTTP ${res.status})`);
        }

        const data = await res.json();
        if (data.ok === false) {
          throw new Error(data.error || 'Failed to load registration data.');
        }

        const {
          systemState,
          terms = [],
          sections = [],
          enrollments = [],
        } = data;

        setTerms(terms);
        setSections(sections);
        setEnrollments(enrollments);

        const current = systemState?.currentTerm;
        if (current?.termId) {
          setCurrentTermId(String(current.termId));
          setSelectedTermId(String(current.termId));
        } else if (terms.length > 0) {
          setCurrentTermId(String(terms[0].termId));
          setSelectedTermId(String(terms[0].termId));
        }

      } catch (e) {
        console.error(e);
        setError(e.message || 'Failed to load registration data.');
      } finally {
        setLoading(false);
      }
    }

    loadRegistrationData();
  }, []);

  // ---------- Helpers ----------

  const getTermLabel = (termId) => {
    const t = terms.find((term) => String(term.termId) === String(termId));
    return t ? `${t.semester} ${t.year}` : '';
  };

  const getAvailabilityColor = (enrolledCount, capacity) => {
    const e = enrolledCount || 0;
    const c = capacity || 1;
    const percentage = (e / c) * 100;
    if (percentage >= 90) return '#ff4444';
    if (percentage >= 75) return '#ff8800';
    return '#44aa44';
  };

  const getTotalCredits = (termId) => {
    return enrollments
      .filter((e) => String(e.termId) === String(termId))
      .reduce((sum, e) => sum + (e.credits || 0), 0);
  };

  // ---------- Derived lists ----------

  const enrollmentsForSelectedTerm = enrollments.filter(
    (e) => String(e.termId) === String(selectedTermId)
  );

  const enrolledClassIds = new Set(
    enrollmentsForSelectedTerm.map((e) => String(e.classId))
  );

  const filteredSections = sections.filter((sec) => {
    const sameTerm = String(sec.termId) === String(selectedTermId);

    const matchesSearch =
      sec.courseTitle.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sec.courseCode.toLowerCase().includes(searchTerm.toLowerCase());

    const notAlreadyEnrolled = !enrolledClassIds.has(String(sec.classId));

    return sameTerm && matchesSearch && notAlreadyEnrolled;
  });

  // ---------- Actions ----------

  const handleRegister = async (section) => {
    try {
      setActionLoading(true);
      setMessage('');
      setError('');

      // 1) Local schedule conflict check BEFORE hitting backend
      const conflict = findScheduleConflict(section);
      if (conflict) {
        setError(
          `Schedule conflict: ${section.courseCode} (${section.scheduleText || 'time TBA'}) ` +
          `overlaps with ${conflict.courseCode} (${conflict.scheduleText || 'time TBA'}).`
        );
        return; // Don’t call backend
      }

      // 2) Proceed to backend if no conflict
      const res = await fetch('/api/registration/enroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ classId: section.classId }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || data.ok === false) {
        throw new Error(data.error || `Failed to register for ${section.courseCode}.`);
      }

      // Backend should return:
      // { ok: true, enrollment: { ... }, updatedSection: { ... } }
      const { enrollment, updatedSection } = data;

      if (enrollment) {
        setEnrollments((prev) => [...prev, enrollment]);
      }

      if (updatedSection) {
        setSections((prev) =>
          prev.map((s) =>
            String(s.classId) === String(updatedSection.classId) ? updatedSection : s
          )
        );
      }

      setMessage(`Successfully registered for ${section.courseCode}.`);
    } catch (e) {
      console.error(e);
      setError(e.message || 'Failed to register.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleWithdraw = async (enrollment) => {
    try {
      setActionLoading(true);
      setMessage('');
      setError('');

      const res = await fetch('/api/registration/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ enrollmentId: enrollment.enrollmentId }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || data.ok === false) {
        throw new Error(data.error || `Failed to withdraw from ${enrollment.courseCode}.`);
      }

      // Backend should return:
      // { ok: true, updatedSection: { ... } }
      const { updatedSection } = data;

      setEnrollments((prev) =>
        prev.filter((e) => e.enrollmentId !== enrollment.enrollmentId)
      );

      if (updatedSection) {
        setSections((prev) =>
          prev.map((s) =>
            String(s.classId) === String(updatedSection.classId) ? updatedSection : s
          )
        );
      }

      setMessage(`Successfully withdrew from ${enrollment.courseCode}.`);
    } catch (e) {
      console.error(e);
      setError(e.message || 'Failed to withdraw.');
    } finally {
      setActionLoading(false);
    }
  };

  // ---------- UI ----------

  const termLabel = getTermLabel(selectedTermId);
  const totalCredits = getTotalCredits(selectedTermId);

  return (
    <div style={{ padding: 20 }}>
      <h1>Course Registration &amp; Schedule</h1>

      {loading && (
        <p style={{ color: '#666', marginBottom: 16 }}>
          Loading registration data...
        </p>
      )}

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

      {/* Term selector always visible */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 16,
          marginBottom: 16,
          alignItems: 'center',
        }}
      >
        <div>
          <label
            style={{
              display: 'block',
              marginBottom: 4,
              fontWeight: 'bold',
              fontSize: 14,
            }}
          >
            Term
          </label>
          <select
            value={selectedTermId}
            onChange={(e) => setSelectedTermId(e.target.value)}
            style={{
              padding: '8px 12px',
              border: '1px solid #ddd',
              borderRadius: 6,
              fontSize: 14,
            }}
          >
            {terms.map((t) => (
              <option key={t.termId} value={t.termId}>
                {t.semester} {t.year}
                {String(t.termId) === String(currentTermId) ? ' (current)' : ''}
              </option>
            ))}
          </select>
        </div>

        <div style={{ fontSize: 13, color: '#555' }}>
          Total enrolled in {termLabel || 'selected term'}:{' '}
          <strong>
            {enrollmentsForSelectedTerm.length} course
            {enrollmentsForSelectedTerm.length !== 1 ? 's' : ''}, {totalCredits} credits
          </strong>
        </div>
      </div>

      {/* Tab Navigation */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        <button
          onClick={() => setActiveTab('register')}
          style={{
            padding: '12px 24px',
            border: 'none',
            borderRadius: 6,
            background: activeTab === 'register' ? '#1976d2' : '#f5f5f5',
            color: activeTab === 'register' ? 'white' : '#333',
            cursor: 'pointer',
            fontWeight: 'bold',
          }}
        >
          Register for Courses
        </button>
        <button
          onClick={() => setActiveTab('schedule')}
          style={{
            padding: '12px 24px',
            border: 'none',
            borderRadius: 6,
            background: activeTab === 'schedule' ? '#1976d2' : '#f5f5f5',
            color: activeTab === 'schedule' ? 'white' : '#333',
            cursor: 'pointer',
            fontWeight: 'bold',
          }}
        >
          My Schedule ({enrollmentsForSelectedTerm.length} course
          {enrollmentsForSelectedTerm.length !== 1 ? 's' : ''}, {totalCredits} credits)
        </button>
      </div>

      {/* REGISTER TAB */}
      {activeTab === 'register' && (
        <div>
          <h2>Available Sections for {termLabel || 'selected term'}</h2>

          {/* Search box */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr',
              gap: 16,
              marginBottom: 24,
            }}
          >
            <input
              type="text"
              placeholder="Search by course code or title..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                padding: '8px 12px',
                border: '1px solid #ddd',
                borderRadius: 6,
                fontSize: 14,
              }}
            />
          </div>

          <div style={{ display: 'grid', gap: 16 }}>
            {filteredSections.map((sec) => {
              const isFull = (sec.enrolledCount || 0) >= (sec.capacity || 0);
              return (
                <div
                  key={sec.classId}
                  style={{
                    border: '1px solid #e0e0e0',
                    borderRadius: 8,
                    padding: 20,
                    background: '#fff',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                  }}
                >
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr auto',
                      alignItems: 'start',
                    }}
                  >
                    <div>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          marginBottom: 8,
                        }}
                      >
                        <h3
                          style={{
                            margin: 0,
                            fontSize: 18,
                            color: '#333',
                          }}
                        >
                          {sec.courseCode} – {sec.courseTitle} (Sec {sec.sectionNum})
                        </h3>
                        <span
                          style={{
                            padding: '2px 8px',
                            borderRadius: 12,
                            fontSize: 12,
                            fontWeight: 'bold',
                            background: '#e3f2fd',
                            color: '#1976d2',
                          }}
                        >
                          {sec.credits} credits
                        </span>
                      </div>

                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns:
                            'repeat(auto-fit, minmax(200px, 1fr))',
                          gap: 12,
                          fontSize: 14,
                          marginBottom: 12,
                        }}
                      >
                        <div>
                          <strong>Instructor:</strong>{' '}
                          {sec.instructorName || 'TBA'}
                        </div>
                        <div>
                          <strong>Schedule:</strong>{' '}
                          {sec.scheduleText || 'TBA'}
                        </div>
                        <div>
                          <strong>Room:</strong> {sec.roomLabel || 'TBA'}
                        </div>
                      </div>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <div
                        style={{
                          padding: '8px 12px',
                          borderRadius: 6,
                          background: getAvailabilityColor(
                            sec.enrolledCount,
                            sec.capacity
                          ),
                          color: 'white',
                          fontWeight: 'bold',
                          fontSize: 14,
                          marginBottom: 8,
                        }}
                      >
                        {sec.enrolledCount}/{sec.capacity} enrolled
                      </div>
                      <button
                        onClick={() => handleRegister(sec)}
                        disabled={isFull || actionLoading}
                        style={{
                          padding: '8px 16px',
                          border: 'none',
                          borderRadius: 6,
                          background: isFull ? '#ccc' : '#28a745',
                          color: 'white',
                          cursor: isFull || actionLoading ? 'not-allowed' : 'pointer',
                          fontWeight: 'bold',
                          opacity: actionLoading ? 0.8 : 1,
                        }}
                      >
                        {isFull ? 'Full' : 'Register'}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {filteredSections.length === 0 && !loading && (
            <div
              style={{
                textAlign: 'center',
                padding: 40,
                color: '#666',
                background: '#f9f9f9',
                borderRadius: 8,
                border: '1px solid #e0e0e0',
                marginTop: 16,
              }}
            >
              <p>No available sections found for this term / search.</p>
            </div>
          )}
        </div>
      )}

      {/* SCHEDULE TAB */}
      {activeTab === 'schedule' && (
        <div>
          <h2>My Schedule – {termLabel || 'selected term'}</h2>

          {enrollmentsForSelectedTerm.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: 40,
                color: '#666',
                background: '#f9f9f9',
                borderRadius: 8,
                border: '1px solid #e0e0e0',
              }}
            >
              <p>You are not enrolled in any courses for this term.</p>
              <p>
                Use the &quot;Register for Courses&quot; tab to add courses to your
                schedule.
              </p>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 16 }}>
              {enrollmentsForSelectedTerm.map((enr) => (
                <div
                  key={enr.enrollmentId}
                  style={{
                    border: '1px solid #e0e0e0',
                    borderRadius: 8,
                    padding: 20,
                    background: '#fff',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                  }}
                >
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr auto',
                      alignItems: 'start',
                    }}
                  >
                    <div>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          marginBottom: 8,
                        }}
                      >
                        <h3
                          style={{
                            margin: 0,
                            fontSize: 18,
                            color: '#333',
                          }}
                        >
                          {enr.courseCode} – {enr.courseTitle}
                        </h3>
                        <span
                          style={{
                            padding: '2px 8px',
                            borderRadius: 12,
                            fontSize: 12,
                            fontWeight: 'bold',
                            background: '#e8f5e8',
                            color: '#2e7d32',
                          }}
                        >
                          {enr.credits} credits
                        </span>
                      </div>

                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns:
                            'repeat(auto-fit, minmax(200px, 1fr))',
                          gap: 12,
                          fontSize: 14,
                        }}
                      >
                        <div>
                          <strong>Instructor:</strong>{' '}
                          {enr.instructorName || 'TBA'}
                        </div>
                        <div>
                          <strong>Schedule:</strong> {enr.scheduleText || 'TBA'}
                        </div>
                        <div>
                          <strong>Room:</strong> {enr.roomLabel || 'TBA'}
                        </div>
                        <div>
                          <strong>Status:</strong>{' '}
                          <span
                            style={{
                              color: '#28a745',
                              fontWeight: 'bold',
                            }}
                          >
                            Enrolled
                          </span>
                        </div>
                      </div>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <button
                        onClick={() => handleWithdraw(enr)}
                        disabled={actionLoading}
                        style={{
                          padding: '8px 16px',
                          border: 'none',
                          borderRadius: 6,
                          background: '#dc3545',
                          color: 'white',
                          cursor: actionLoading ? 'not-allowed' : 'pointer',
                          fontWeight: 'bold',
                          opacity: actionLoading ? 0.8 : 1,
                        }}
                      >
                        Withdraw
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
