// src/pages/ClassManage.jsx
import React, { useEffect, useState } from 'react';

export default function ClassManage() {
  const role = (localStorage.getItem('role') || 'student').toLowerCase();

  const [terms, setTerms] = useState([]);
  const [courses, setCourses] = useState([]);
  const [instructors, setInstructors] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [sections, setSections] = useState([]);

  const [selectedTermId, setSelectedTermId] = useState('');
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [sectionNum, setSectionNum] = useState('');
  const [capacity, setCapacity] = useState(30);

  // NEW: structured meeting days + times
  const [meetingDaysSelection, setMeetingDaysSelection] = useState({
    M: false,
    Tu: false,
    W: false,
    Th: false,
    F: false,
  });
  const [startTime, setStartTime] = useState(''); // "09:30"
  const [endTime, setEndTime] = useState('');     // "10:45"

  const [roomId, setRoomId] = useState('');
  const [instructorId, setInstructorId] = useState('');
  const [requiresPermission, setRequiresPermission] = useState(false);
  const [notes, setNotes] = useState('');

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Load terms, courses, instructors, rooms, sections from backend
  useEffect(() => {
    async function loadInitialData() {
      try {
        setLoading(true);
        setError('');

        const res = await fetch('/api/class-manage/init', {
          credentials: 'include',
        });

        if (!res.ok) {
          throw new Error('Failed to load registrar data.');
        }

        const data = await res.json();

        if (data.ok === false) {
          throw new Error(data.error || 'Failed to load registrar data.');
        }

        const {
          terms: termsData = [],
          courses: coursesData = [],
          instructors: instructorsData = [],
          rooms: roomsData = [],
          sections: sectionsData = [],
        } = data;

        setTerms(termsData);
        setCourses(coursesData);
        setInstructors(instructorsData);
        setRooms(roomsData);
        setSections(sectionsData);

        if (termsData.length > 0) {
          setSelectedTermId(String(termsData[0].termId));
        }
      } catch (e) {
        console.error(e);
        setError(e.message || 'Failed to load registrar setup data.');
      } finally {
        setLoading(false);
      }
    }

    loadInitialData();
  }, []);

  function resetForm() {
    setSelectedCourseId('');
    setSectionNum('');
    setCapacity(30);
    setMeetingDaysSelection({
      M: false,
      Tu: false,
      W: false,
      Th: false,
      F: false,
    });
    setStartTime('');
    setEndTime('');
    setRoomId('');
    setInstructorId('');
    setRequiresPermission(false);
    setNotes('');
    setSuccessMsg('');
    setError('');
  }

  async function handleSaveSection(e) {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    if (!selectedTermId || !selectedCourseId || !sectionNum) {
      setError('Term, course, and section number are required.');
      return;
    }

    // Build meeting_days like "MTuThu" from checkboxes
    const dayOrder = ['M', 'Tu', 'W', 'Th', 'F'];
    const meetingDays = dayOrder
      .filter((d) => meetingDaysSelection[d])
      .join('');

    if (!meetingDays) {
      setError('Please select at least one meeting day.');
      return;
    }

    // Validate time inputs and build "HH:MM-HH:MM"
    if (!startTime || !endTime) {
      setError('Please enter a valid start and end time.');
      return;
    }

    if (startTime >= endTime) {
      setError('End time must be after start time.');
      return;
    }

    const meetingTimes = `${startTime}-${endTime}`; // e.g. "09:30-10:45"

    try {
      setSaving(true);

      const payload = {
        termId: selectedTermId,
        courseId: selectedCourseId,
        sectionNum,
        capacity: Number(capacity) || 0,
        meetingDays,
        meetingTimes,
        roomId: roomId || null,
        instructorId: instructorId || null,
        requiresDeptPermission: requiresPermission,
        notes,
      };

      const res = await fetch('/api/class-manage/sections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok || data.ok === false) {
        throw new Error(data.error || 'Failed to save class section');
      }

      if (data.section) {
        setSections((prev) => [...prev, data.section]);
      }

      setSuccessMsg(data.message || 'Class section created successfully.');
      // If you want to clear the form after save, uncomment:
      // resetForm();
    } catch (e) {
      console.error(e);
      setError(e.message || 'Failed to save class section.');
    } finally {
      setSaving(false);
    }
  }

  if (role !== 'registrar') {
    return (
      <div style={{ padding: 20 }}>
        <h1>Manage Class Sections</h1>
        <p style={{ color: '#666' }}>
          Only registrar users can manage class sections.
        </p>
      </div>
    );
  }

  return (
    <div style={{ padding: 20 }}>
      <h1>Manage Class Sections</h1>

      <p style={{ color: '#555', maxWidth: 800, marginBottom: 20 }}>
        Use this page to create and maintain <strong>class sections</strong> that
        students can enroll in. Each section is linked to a course in the
        catalog and a specific term, with an instructor, room, capacity, and
        meeting pattern.
      </p>

      {(error || successMsg) && (
        <div
          style={{
            marginBottom: 16,
            padding: 12,
            borderRadius: 6,
            border: `1px solid ${error ? '#e57373' : '#81c784'}`,
            background: error ? '#ffebee' : '#e8f5e9',
            color: error ? '#c62828' : '#2e7d32',
            fontSize: 14,
          }}
        >
          {error || successMsg}
        </div>
      )}

      {loading && (
        <p style={{ color: '#666', marginBottom: 16 }}>
          Loading registrar data...
        </p>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 420px) minmax(0, 1fr)',
          gap: 24,
          alignItems: 'flex-start',
        }}
      >
        {/* LEFT: Form */}
        <form
          onSubmit={handleSaveSection}
          style={{
            border: '1px solid #e0e0e0',
            borderRadius: 8,
            padding: 20,
            background: '#fff',
            boxShadow: '0 2px 4px rgba(0,0,0,0.06)',
          }}
        >
          <h2
            style={{
              marginTop: 0,
              marginBottom: 12,
              fontSize: 18,
              color: '#333',
            }}
          >
            Create / Edit Class Section
          </h2>

          {/* Term */}
          <div style={{ marginBottom: 12 }}>
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
                width: '100%',
                padding: '8px 10px',
                border: '1px solid #ddd',
                borderRadius: 6,
                fontSize: 14,
              }}
            >
              {terms.length === 0 && <option value="">No terms loaded</option>}
              {terms.map((t) => (
                <option key={t.termId} value={t.termId}>
                  {t.semester} {t.year}
                </option>
              ))}
            </select>
          </div>

          {/* Course */}
          <div style={{ marginBottom: 12 }}>
            <label
              style={{
                display: 'block',
                marginBottom: 4,
                fontWeight: 'bold',
                fontSize: 14,
              }}
            >
              Course
            </label>
            <select
              value={selectedCourseId}
              onChange={(e) => setSelectedCourseId(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 10px',
                border: '1px solid #ddd',
                borderRadius: 6,
                fontSize: 14,
              }}
            >
              <option value="">Select a course...</option>
              {courses.map((c) => (
                <option key={c.courseId} value={c.courseId}>
                  {c.title}
                </option>
              ))}
            </select>
            <small style={{ color: '#777', fontSize: 12 }}>
              These come from the course catalog.
            </small>
          </div>

          {/* Section number + Capacity */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 12,
              marginBottom: 12,
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
                Section Number
              </label>
              <input
                type="text"
                value={sectionNum}
                onChange={(e) => setSectionNum(e.target.value)}
                placeholder="e.g. 01, R01"
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  border: '1px solid #ddd',
                  borderRadius: 6,
                  fontSize: 14,
                }}
              />
            </div>

            <div>
              <label
                style={{
                  display: 'block',
                  marginBottom: 4,
                  fontWeight: 'bold',
                  fontSize: 14,
                }}
              >
                Capacity
              </label>
              <input
                type="number"
                min="0"
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  border: '1px solid #ddd',
                  borderRadius: 6,
                  fontSize: 14,
                }}
              />
            </div>
          </div>

          {/* Meeting days/times */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 12,
              marginBottom: 12,
            }}
          >
            {/* Meeting Days (checkboxes) */}
            <div>
              <label
                style={{
                  display: 'block',
                  marginBottom: 4,
                  fontWeight: 'bold',
                  fontSize: 14,
                }}
              >
                Meeting Days
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {[
                  { key: 'M', label: 'Mon' },
                  { key: 'Tu', label: 'Tue' },
                  { key: 'W', label: 'Wed' },
                  { key: 'Th', label: 'Thu' },
                  { key: 'F', label: 'Fri' },
                ].map((day) => (
                  <label
                    key={day.key}
                    style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                  >
                    <input
                      type="checkbox"
                      checked={meetingDaysSelection[day.key]}
                      onChange={(e) =>
                        setMeetingDaysSelection((prev) => ({
                          ...prev,
                          [day.key]: e.target.checked,
                        }))
                      }
                    />
                    {day.label}
                  </label>
                ))}
              </div>
              <small style={{ color: '#777', fontSize: 12 }}>
                Stored as codes like &quot;MTuThu&quot;.
              </small>
            </div>

            {/* Meeting Time (start/end) */}
            <div>
              <label
                style={{
                  display: 'block',
                  marginBottom: 4,
                  fontWeight: 'bold',
                  fontSize: 14,
                }}
              >
                Meeting Time
              </label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  required
                  style={{
                    padding: '6px 8px',
                    border: '1px solid #ddd',
                    borderRadius: 6,
                    fontSize: 14,
                  }}
                />
                <span>to</span>
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  required
                  style={{
                    padding: '6px 8px',
                    border: '1px solid #ddd',
                    borderRadius: 6,
                    fontSize: 14,
                  }}
                />
              </div>
              <small style={{ color: '#777', fontSize: 12 }}>
                Stored as &quot;HH:MM-HH:MM&quot; in the database.
              </small>
            </div>
          </div>

          {/* Room */}
          <div style={{ marginBottom: 12 }}>
            <label
              style={{
                display: 'block',
                marginBottom: 4,
                fontWeight: 'bold',
                fontSize: 14,
              }}
            >
              Room
            </label>
            <select
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 10px',
                border: '1px solid #ddd',
                borderRadius: 6,
                fontSize: 14,
              }}
            >
              <option value="">TBA / No room</option>
              {rooms.map((r) => (
                <option key={r.roomId} value={r.roomId}>
                  {r.building} {r.room}{' '}
                  {r.capacity ? `(${r.capacity})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Instructor */}
          <div style={{ marginBottom: 12 }}>
            <label
              style={{
                display: 'block',
                marginBottom: 4,
                fontWeight: 'bold',
                fontSize: 14,
              }}
            >
              Instructor
            </label>
            <select
              value={instructorId}
              onChange={(e) => setInstructorId(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 10px',
                border: '1px solid #ddd',
                borderRadius: 6,
                fontSize: 14,
              }}
            >
              <option value="">TBA / Unassigned</option>
              {instructors.map((u) => (
                <option key={u.userId} value={u.userId}>
                  {u.firstName} {u.lastName}{' '}
                  {u.email ? `(${u.email})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Requires permission */}
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 14 }}>
              <input
                type="checkbox"
                checked={requiresPermission}
                onChange={(e) => setRequiresPermission(e.target.checked)}
                style={{ marginRight: 8 }}
              />
              Requires department permission
            </label>
          </div>

          {/* Notes */}
          <div style={{ marginBottom: 16 }}>
            <label
              style={{
                display: 'block',
                marginBottom: 4,
                fontWeight: 'bold',
                fontSize: 14,
              }}
            >
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Optional notes about this section (honors, recitation, online, etc.)"
              style={{
                width: '100%',
                padding: '8px 10px',
                border: '1px solid #ddd',
                borderRadius: 6,
                fontSize: 14,
                resize: 'vertical',
              }}
            />
          </div>

          {/* Buttons */}
          <div
            style={{
              display: 'flex',
              gap: 8,
              justifyContent: 'flex-end',
              alignItems: 'center',
            }}
          >
            <button
              type="button"
              onClick={resetForm}
              disabled={saving}
              style={{
                padding: '8px 16px',
                borderRadius: 6,
                border: '1px solid #ccc',
                background: '#f5f5f5',
                color: '#555',
                fontWeight: 'bold',
                cursor: 'pointer',
              }}
            >
              Clear
            </button>
            <button
              type="submit"
              disabled={saving}
              style={{
                padding: '8px 16px',
                borderRadius: 6,
                border: 'none',
                background: '#1976d2',
                color: '#fff',
                fontWeight: 'bold',
                cursor: 'pointer',
                opacity: saving ? 0.7 : 1,
              }}
            >
              {saving ? 'Saving...' : 'Save Section'}
            </button>
          </div>
        </form>

        {/* RIGHT: Existing sections list */}
        <div
          style={{
            border: '1px solid #e0e0e0',
            borderRadius: 8,
            padding: 20,
            background: '#fff',
            boxShadow: '0 2px 4px rgba(0,0,0,0.06)',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 12,
            }}
          >
            <h2
              style={{
                margin: 0,
                fontSize: 18,
                color: '#333',
              }}
            >
              Existing Sections
            </h2>
            <span style={{ fontSize: 13, color: '#777' }}>
              {sections.length} section{sections.length !== 1 ? 's' : ''}
            </span>
          </div>

          {sections.length === 0 ? (
            <p style={{ color: '#666', fontSize: 14 }}>
              No sections found yet. Create a class section on the left to get
              started.
            </p>
          ) : (
            <div style={{ maxHeight: 500, overflowY: 'auto' }}>
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontSize: 13,
                }}
              >
                <thead>
                  <tr>
                    <th
                      style={{
                        textAlign: 'left',
                        padding: '6px 4px',
                        borderBottom: '1px solid #ddd',
                      }}
                    >
                      Term
                    </th>
                    <th
                      style={{
                        textAlign: 'left',
                        padding: '6px 4px',
                        borderBottom: '1px solid #ddd',
                      }}
                    >
                      Course
                    </th>
                    <th
                      style={{
                        textAlign: 'left',
                        padding: '6px 4px',
                        borderBottom: '1px solid #ddd',
                      }}
                    >
                      Sec
                    </th>
                    <th
                      style={{
                        textAlign: 'left',
                        padding: '6px 4px',
                        borderBottom: '1px solid #ddd',
                      }}
                    >
                      Meeting
                    </th>
                    <th
                      style={{
                        textAlign: 'left',
                        padding: '6px 4px',
                        borderBottom: '1px solid #ddd',
                      }}
                    >
                      Room
                    </th>
                    <th
                      style={{
                        textAlign: 'left',
                        padding: '6px 4px',
                        borderBottom: '1px solid #ddd',
                      }}
                    >
                      Instructor
                    </th>
                    <th
                      style={{
                        textAlign: 'left',
                        padding: '6px 4px',
                        borderBottom: '1px solid #ddd',
                      }}
                    >
                      Enrolled
                    </th>
                    <th
                      style={{
                        textAlign: 'left',
                        padding: '6px 4px',
                        borderBottom: '1px solid #ddd',
                      }}
                    >
                      Perm
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sections.map((s) => (
                    <tr key={s.classId}>
                      <td
                        style={{
                          padding: '4px 4px',
                          borderBottom: '1px solid #f0f0f0',
                        }}
                      >
                        {s.term}
                      </td>
                      <td
                        style={{
                          padding: '4px 4px',
                          borderBottom: '1px solid #f0f0f0',
                        }}
                      >
                        <div style={{ fontWeight: 600 }}>
                          {s.courseCode}
                        </div>
                        <div style={{ color: '#777' }}>
                          {s.courseTitle}
                        </div>
                      </td>
                      <td
                        style={{
                          padding: '4px 4px',
                          borderBottom: '1px solid #f0f0f0',
                        }}
                      >
                        {s.sectionNum}
                      </td>
                      <td
                        style={{
                          padding: '4px 4px',
                          borderBottom: '1px solid #f0f0f0',
                        }}
                      >
                        {s.meetingDays} {s.meetingTimes}
                      </td>
                      <td
                        style={{
                          padding: '4px 4px',
                          borderBottom: '1px solid #f0f0f0',
                        }}
                      >
                        {s.room || 'TBA'}
                      </td>
                      <td
                        style={{
                          padding: '4px 4px',
                          borderBottom: '1px solid #f0f0f0',
                        }}
                      >
                        {s.instructorName || 'TBA'}
                      </td>
                      <td
                        style={{
                          padding: '4px 4px',
                          borderBottom: '1px solid #f0f0f0',
                        }}
                      >
                        {s.enrolled ?? 0}/{s.capacity ?? 0}
                      </td>
                      <td
                        style={{
                          padding: '4px 4px',
                          borderBottom: '1px solid #f0f0f0',
                        }}
                      >
                        {s.requiresPermission ? 'Yes' : 'No'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
