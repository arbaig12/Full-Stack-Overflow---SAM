// src/pages/ClassManage.jsx
import React, { useEffect, useMemo, useState } from 'react';

export default function ClassManage() {
  const role = (localStorage.getItem('role') || 'student').toLowerCase();

  const [terms, setTerms] = useState([]);
  const [courses, setCourses] = useState([]);
  const [instructors, setInstructors] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [sections, setSections] = useState([]);

  // Create form (LEFT)
  const [selectedTermId, setSelectedTermId] = useState('');
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [sectionNum, setSectionNum] = useState('');
  const [capacity, setCapacity] = useState(30);

  const [meetingDaysSelection, setMeetingDaysSelection] = useState({
    M: false,
    T: false,
    W: false,
    R: false,
    F: false,
  });
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');

  const [roomId, setRoomId] = useState('');
  const [instructorId, setInstructorId] = useState('');
  const [requiresPermission, setRequiresPermission] = useState(false);
  const [notes, setNotes] = useState('');

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // RIGHT: filters + search + pagination
  const [filterTermId, setFilterTermId] = useState('ALL');
  const [sectionsSearch, setSectionsSearch] = useState('');
  const [sectionsPage, setSectionsPage] = useState(1);
  const SECTIONS_PAGE_SIZE = 100;

  // EDIT MODAL state
  const [editOpen, setEditOpen] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');
  const [editSection, setEditSection] = useState(null);

  // Edit draft fields
  const [editSectionNum, setEditSectionNum] = useState('');
  const [editCapacity, setEditCapacity] = useState(30);
  const [editMeetingDaysSelection, setEditMeetingDaysSelection] = useState({
    M: false,
    T: false,
    W: false,
    R: false,
    F: false,
  });
  const [editStartTime, setEditStartTime] = useState('');
  const [editEndTime, setEditEndTime] = useState('');
  const [editRoomId, setEditRoomId] = useState('');
  const [editInstructorId, setEditInstructorId] = useState('');
  const [editRequiresPermission, setEditRequiresPermission] = useState(false);
  const [editNotes, setEditNotes] = useState('');

  // ✅ Confirm modal for room capacity bump
  const [capConfirmOpen, setCapConfirmOpen] = useState(false);
  const [capConfirmMessage, setCapConfirmMessage] = useState('');
  const [capConfirmPending, setCapConfirmPending] = useState(null);
  // capConfirmPending = {
  //   mode: 'create' | 'edit',
  //   url: string,
  //   method: 'POST'|'PUT',
  //   payload: object,
  //   roomId: number,
  //   requestedCapacity: number
  // }

  function ConfirmModal({ open, title, message, confirmText = 'Yes', cancelText = 'No', onConfirm, onCancel, busy }) {
    if (!open) return null;
    return (
      <div
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onCancel?.();
        }}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.35)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 16,
          zIndex: 10000,
        }}
      >
        <div
          style={{
            width: 'min(560px, 100%)',
            background: '#fff',
            borderRadius: 10,
            border: '1px solid #e0e0e0',
            boxShadow: '0 10px 24px rgba(0,0,0,0.25)',
            overflow: 'hidden',
          }}
        >
          <div style={{ padding: '14px 16px', borderBottom: '1px solid #eee' }}>
            <div style={{ fontSize: 16, fontWeight: 900, color: '#222' }}>{title}</div>
          </div>

          <div style={{ padding: 16, fontSize: 14, color: '#333', lineHeight: 1.5 }}>
            {message}
          </div>

          <div
            style={{
              padding: 16,
              borderTop: '1px solid #eee',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 10,
              background: '#fafafa',
            }}
          >
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              style={{
                padding: '8px 14px',
                borderRadius: 6,
                border: '1px solid #ccc',
                background: '#fff',
                cursor: 'pointer',
                fontWeight: 800,
              }}
            >
              {cancelText}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={busy}
              style={{
                padding: '8px 14px',
                borderRadius: 6,
                border: 'none',
                background: '#1976d2',
                color: '#fff',
                cursor: 'pointer',
                fontWeight: 900,
                opacity: busy ? 0.7 : 1,
              }}
            >
              {busy ? 'Working...' : confirmText}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Helpers
  const parseMeetingDaysToSelection = (meetingDaysStr) => {
    const s = (meetingDaysStr || '').toUpperCase();
    return {
      M: s.includes('M'),
      T: s.includes('T'),
      W: s.includes('W'),
      R: s.includes('R'),
      F: s.includes('F'),
    };
  };

  const parseMeetingTimes = (meetingTimesStr) => {
    const val = (meetingTimesStr || '').trim();
    const parts = val.split('-');
    if (parts.length === 2) return { start: parts[0], end: parts[1] };
    return { start: '', end: '' };
  };

  const buildMeetingDaysFromSelection = (sel) => {
    const dayOrder = ['M', 'T', 'W', 'R', 'F'];
    return dayOrder.filter((d) => !!sel[d]).join('');
  };

  const patchRoomCapacityInState = (roomIdNum, newCap) => {
    setRooms((prev) =>
      prev.map((r) => (String(r.roomId) === String(roomIdNum) ? { ...r, capacity: Number(newCap) || 0 } : r))
    );
  };

  // Load init data
  useEffect(() => {
    async function loadInitialData() {
      try {
        setLoading(true);
        setError('');

        const res = await fetch('/api/class-manage/init', { credentials: 'include' });
        if (!res.ok) throw new Error('Failed to load registrar data.');

        const data = await res.json();
        if (data.ok === false) throw new Error(data.error || 'Failed to load registrar data.');

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
          setFilterTermId('ALL');
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
    setMeetingDaysSelection({ M: false, T: false, W: false, R: false, F: false });
    setStartTime('');
    setEndTime('');
    setRoomId('');
    setInstructorId('');
    setRequiresPermission(false);
    setNotes('');
    setSuccessMsg('');
    setError('');
  }

  // ✅ One place to submit (create/edit) with room-capacity confirm support
  async function submitSection({ mode, url, method, payload }) {
    const isEdit = mode === 'edit';

    try {
      if (isEdit) setEditSaving(true);
      else setSaving(true);

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));

      // ✅ If capacity > room capacity, server returns structured 409
      if (!res.ok && data?.code === 'ROOM_CAPACITY_EXCEEDED') {
        const requestedCapacity = Number(data.requestedCapacity);
        const roomCapacity = Number(data.roomCapacity);
        const roomIdNum = Number(data.roomId);

        const msg =
          `Class capacity (${requestedCapacity}) is greater than the current room capacity (${roomCapacity}).\n\n` +
          `Do you want to update the room capacity to ${requestedCapacity} and proceed?`;

        setCapConfirmMessage(msg);
        setCapConfirmPending({
          mode,
          url,
          method,
          payload, // original payload
          roomId: roomIdNum,
          requestedCapacity,
        });
        setCapConfirmOpen(true);
        return;
      }

      if (!res.ok || data.ok === false) {
        throw new Error(data.error || 'Request failed.');
      }

      // success
      if (data.section) {
        if (mode === 'create') {
          setSections((prev) => [...prev, data.section]);
          setSuccessMsg(data.message || 'Class section created successfully.');
        } else {
          setSections((prev) =>
            prev.map((x) => (String(x.classId) === String(data.section.classId) ? data.section : x))
          );
          setSuccessMsg(data.message || 'Class section updated successfully.');
          setEditOpen(false);
          setEditSection(null);
        }
      } else {
        // fallback if server didn't return section
        setSuccessMsg(data.message || 'Saved successfully.');
      }
    } catch (e) {
      console.error(e);
      if (isEdit) setEditError(e.message || 'Failed to update class section.');
      else setError(e.message || 'Failed to save class section.');
    } finally {
      if (isEdit) setEditSaving(false);
      else setSaving(false);
    }
  }

  async function handleConfirmRoomCapacityYes() {
    if (!capConfirmPending) return;

    const { mode, url, method, payload, roomId: pendingRoomId, requestedCapacity } = capConfirmPending;

    // close modal first (optional)
    setCapConfirmOpen(false);

    // optimistic update local rooms list so dropdown reflects new capacity immediately
    if (pendingRoomId && Number.isFinite(Number(requestedCapacity))) {
      patchRoomCapacityInState(pendingRoomId, requestedCapacity);
    }

    // resubmit with override flag
    const nextPayload = { ...payload, allowRoomCapacityIncrease: true };

    // clear pending
    setCapConfirmPending(null);
    setCapConfirmMessage('');

    await submitSection({ mode, url, method, payload: nextPayload });
  }

  function handleConfirmRoomCapacityNo() {
    setCapConfirmOpen(false);
    setCapConfirmPending(null);
    setCapConfirmMessage('');
    // keep existing "no" behavior = do nothing, user can adjust capacity/room
  }

  async function handleSaveSection(e) {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    if (!selectedTermId || !selectedCourseId || !sectionNum) {
      setError('Term, course, and section number are required.');
      return;
    }

    const meetingDays = buildMeetingDaysFromSelection(meetingDaysSelection);
    if (!meetingDays) {
      setError('Please select at least one meeting day.');
      return;
    }

    if (!startTime || !endTime) {
      setError('Please enter a valid start and end time.');
      return;
    }
    if (startTime >= endTime) {
      setError('End time must be after start time.');
      return;
    }

    const meetingTimes = `${startTime}-${endTime}`;

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

    await submitSection({
      mode: 'create',
      url: '/api/class-manage/sections',
      method: 'POST',
      payload,
    });
  }

  // RIGHT list computed (term filter + search)
  const filteredSections = useMemo(() => {
    const termFiltered =
      String(filterTermId) === 'ALL'
        ? sections
        : sections.filter((s) => String(s.termId) === String(filterTermId));

    const q = sectionsSearch.trim().toLowerCase();
    if (!q) return termFiltered;

    const normalize = (v) => String(v ?? '').toLowerCase();
    const normalizeNoSpace = (v) => normalize(v).replace(/\s+/g, '');

    return termFiltered.filter((s) => {
      const haystack = [
        s.term,
        s.courseCode,
        s.courseTitle,
        s.sectionNum,
        s.meetingDays,
        s.meetingTimes,
        s.room,
        s.instructorName,
        String(s.classId),
      ]
        .map(normalize)
        .join(' | ');

      const compactHaystack = [
        s.courseCode,
        s.courseTitle,
        s.term,
        s.room,
        s.instructorName,
        s.sectionNum,
      ]
        .map(normalizeNoSpace)
        .join('|');

      const compactQ = q.replace(/\s+/g, '');
      return haystack.includes(q) || compactHaystack.includes(compactQ);
    });
  }, [sections, filterTermId, sectionsSearch]);

  // reset to page 1 when filtering/searching changes
  useEffect(() => {
    setSectionsPage(1);
  }, [filterTermId, sectionsSearch, sections.length]);

  const totalPages = Math.max(1, Math.ceil(filteredSections.length / SECTIONS_PAGE_SIZE));
  const safePage = Math.min(Math.max(1, sectionsPage), totalPages);
  const startIdx = (safePage - 1) * SECTIONS_PAGE_SIZE;
  const endIdx = Math.min(startIdx + SECTIONS_PAGE_SIZE, filteredSections.length);
  const pagedSections = filteredSections.slice(startIdx, endIdx);

  const renderPager = () => {
    if (filteredSections.length <= SECTIONS_PAGE_SIZE) return null;

    const goTo = (p) => setSectionsPage(Math.min(Math.max(1, p), totalPages));
    const windowSize = 7;

    let start = Math.max(1, safePage - Math.floor(windowSize / 2));
    let end = Math.min(totalPages, start + windowSize - 1);
    start = Math.max(1, end - windowSize + 1);

    const pages = [];
    for (let p = start; p <= end; p++) pages.push(p);

    return (
      <div
        style={{
          marginTop: 12,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap',
        }}
      >
        <button
          onClick={() => goTo(safePage - 1)}
          disabled={safePage === 1}
          style={{
            padding: '6px 10px',
            borderRadius: 6,
            border: '1px solid #ddd',
            background: safePage === 1 ? '#f2f2f2' : '#fff',
            cursor: safePage === 1 ? 'not-allowed' : 'pointer',
          }}
        >
          Prev
        </button>

        {start > 1 && (
          <>
            <button
              onClick={() => goTo(1)}
              style={{
                padding: '6px 10px',
                borderRadius: 6,
                border: '1px solid #ddd',
                background: '#fff',
                cursor: 'pointer',
              }}
            >
              1
            </button>
            {start > 2 && <span style={{ color: '#888' }}>…</span>}
          </>
        )}

        {pages.map((p) => (
          <button
            key={p}
            onClick={() => goTo(p)}
            style={{
              padding: '6px 10px',
              borderRadius: 6,
              border: '1px solid #ddd',
              background: p === safePage ? '#1976d2' : '#fff',
              color: p === safePage ? '#fff' : '#333',
              cursor: 'pointer',
              fontWeight: p === safePage ? 'bold' : 'normal',
            }}
          >
            {p}
          </button>
        ))}

        {end < totalPages && (
          <>
            {end < totalPages - 1 && <span style={{ color: '#888' }}>…</span>}
            <button
              onClick={() => goTo(totalPages)}
              style={{
                padding: '6px 10px',
                borderRadius: 6,
                border: '1px solid #ddd',
                background: '#fff',
                cursor: 'pointer',
              }}
            >
              {totalPages}
            </button>
          </>
        )}

        <button
          onClick={() => goTo(safePage + 1)}
          disabled={safePage === totalPages}
          style={{
            padding: '6px 10px',
            borderRadius: 6,
            border: '1px solid #ddd',
            background: safePage === totalPages ? '#f2f2f2' : '#fff',
            cursor: safePage === totalPages ? 'not-allowed' : 'pointer',
          }}
        >
          Next
        </button>

        <span style={{ fontSize: 13, color: '#555', marginLeft: 8 }}>
          Page {safePage} / {totalPages}
        </span>
      </div>
    );
  };

  // Open edit modal + prefill draft
  const openEdit = (s) => {
    setEditError('');
    setSuccessMsg('');
    setError('');

    setEditSection(s);

    setEditSectionNum(String(s.sectionNum ?? ''));
    setEditCapacity(Number(s.capacity ?? 0));

    setEditMeetingDaysSelection(parseMeetingDaysToSelection(s.meetingDays));
    const { start, end } = parseMeetingTimes(s.meetingTimes);
    setEditStartTime(start);
    setEditEndTime(end);

    setEditRoomId(s.roomId ? String(s.roomId) : '');
    setEditInstructorId(s.instructorId ? String(s.instructorId) : '');
    setEditRequiresPermission(!!s.requiresPermission);
    setEditNotes(String(s.notes ?? ''));

    setEditOpen(true);
  };

  const closeEdit = () => {
    if (editSaving) return;
    setEditOpen(false);
    setEditSection(null);
    setEditError('');
  };

  // Save edit (PUT)
  const handleSaveEdit = async () => {
    setEditError('');

    if (!editSection?.classId) {
      setEditError('Missing classId for edit.');
      return;
    }

    if (!editSectionNum.trim()) {
      setEditError('Section number is required.');
      return;
    }

    const meetingDays = buildMeetingDaysFromSelection(editMeetingDaysSelection);
    if (!meetingDays) {
      setEditError('Please select at least one meeting day.');
      return;
    }

    if (!editStartTime || !editEndTime) {
      setEditError('Please enter a valid start and end time.');
      return;
    }
    if (editStartTime >= editEndTime) {
      setEditError('End time must be after start time.');
      return;
    }

    const meetingTimes = `${editStartTime}-${editEndTime}`;

    const payload = {
      sectionNum: editSectionNum,
      capacity: Number(editCapacity) || 0,
      meetingDays,
      meetingTimes,
      roomId: editRoomId || null,
      instructorId: editInstructorId || null,
      requiresDeptPermission: !!editRequiresPermission,
      notes: editNotes,
    };

    await submitSection({
      mode: 'edit',
      url: `/api/class-manage/sections/${editSection.classId}`,
      method: 'PUT',
      payload,
    });
  };

  if (role !== 'registrar') {
    return (
      <div style={{ padding: 20 }}>
        <h1>Manage Class Sections</h1>
        <p style={{ color: '#666' }}>Only registrar users can manage class sections.</p>
      </div>
    );
  }

  return (
    <div style={{ padding: 20 }}>
      <h1>Manage Class Sections</h1>

      <p style={{ color: '#555', maxWidth: 800, marginBottom: 20 }}>
        Use this page to create and maintain <strong>class sections</strong> that students can enroll in.
        Each section is linked to a course in the catalog and a specific term, with an instructor, room,
        capacity, and meeting pattern.
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

      {loading && <p style={{ color: '#666', marginBottom: 16 }}>Loading registrar data...</p>}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 420px) minmax(0, 1fr)',
          gap: 24,
          alignItems: 'flex-start',
        }}
      >
        {/* LEFT: Create Form */}
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
          <h2 style={{ marginTop: 0, marginBottom: 12, fontSize: 18, color: '#333' }}>
            Create Class Section
          </h2>

          {/* Term */}
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold', fontSize: 14 }}>
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
            <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold', fontSize: 14 }}>
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
            <small style={{ color: '#777', fontSize: 12 }}>These come from the course catalog.</small>
          </div>

          {/* Section number + Capacity */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold', fontSize: 14 }}>
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
              <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold', fontSize: 14 }}>
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
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold', fontSize: 14 }}>
                Meeting Days
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {[
                  { key: 'M', label: 'Mon' },
                  { key: 'T', label: 'Tue' },
                  { key: 'W', label: 'Wed' },
                  { key: 'R', label: 'Thu' },
                  { key: 'F', label: 'Fri' },
                ].map((day) => (
                  <label key={day.key} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
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
              <small style={{ color: '#777', fontSize: 12 }}>Stored as codes like &quot;MTWRF&quot;.</small>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold', fontSize: 14 }}>
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
              <small style={{ color: '#777', fontSize: 12 }}>Stored as &quot;HH:MM-HH:MM&quot;.</small>
            </div>
          </div>

          {/* Room */}
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold', fontSize: 14 }}>
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
                  {r.building} {r.room} {r.capacity ? `(${r.capacity})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Instructor */}
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold', fontSize: 14 }}>
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
                  {u.firstName} {u.lastName} {u.email ? `(${u.email})` : ''}
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
            <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold', fontSize: 14 }}>
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
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h2 style={{ margin: 0, fontSize: 18, color: '#333' }}>Existing Sections</h2>
            <span style={{ fontSize: 13, color: '#777' }}>
              {filteredSections.length} section{filteredSections.length !== 1 ? 's' : ''}
            </span>
          </div>

          {/* Term filter + Search */}
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
            <label style={{ fontSize: 13, color: '#555', fontWeight: 600 }}>Filter Term:</label>
            <select
              value={filterTermId}
              onChange={(e) => setFilterTermId(e.target.value)}
              style={{ padding: '6px 10px', border: '1px solid #ddd', borderRadius: 6, fontSize: 13, minWidth: 220 }}
            >
              <option value="ALL">All terms</option>
              {terms.map((t) => (
                <option key={t.termId} value={t.termId}>
                  {t.semester} {t.year}
                </option>
              ))}
            </select>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                type="text"
                value={sectionsSearch}
                onChange={(e) => setSectionsSearch(e.target.value)}
                placeholder="Search (course, title, sec, instructor, room...)"
                style={{
                  padding: '6px 10px',
                  border: '1px solid #ddd',
                  borderRadius: 6,
                  fontSize: 13,
                  minWidth: 280,
                }}
              />
              {sectionsSearch.trim() && (
                <button
                  type="button"
                  onClick={() => setSectionsSearch('')}
                  style={{
                    padding: '6px 10px',
                    borderRadius: 6,
                    border: '1px solid #ddd',
                    background: '#fff',
                    cursor: 'pointer',
                    fontSize: 12,
                  }}
                  title="Clear search"
                >
                  Clear
                </button>
              )}
            </div>

            <span style={{ fontSize: 12, color: '#777' }}>
              Showing {filteredSections.length === 0 ? 0 : startIdx + 1}-{endIdx} of {filteredSections.length}
            </span>
          </div>

          {filteredSections.length === 0 ? (
            <p style={{ color: '#666', fontSize: 14 }}>
              No sections match the current filter/search. Change filters or create a section on the left.
            </p>
          ) : (
            <>
              <div style={{ maxHeight: 760, overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', padding: '6px 4px', borderBottom: '1px solid #ddd' }}>Term</th>
                      <th style={{ textAlign: 'left', padding: '6px 4px', borderBottom: '1px solid #ddd' }}>Course</th>
                      <th style={{ textAlign: 'left', padding: '6px 4px', borderBottom: '1px solid #ddd' }}>Sec</th>
                      <th style={{ textAlign: 'left', padding: '6px 4px', borderBottom: '1px solid #ddd' }}>Meeting</th>
                      <th style={{ textAlign: 'left', padding: '6px 4px', borderBottom: '1px solid #ddd' }}>Room</th>
                      <th style={{ textAlign: 'left', padding: '6px 4px', borderBottom: '1px solid #ddd' }}>Instructor</th>
                      <th style={{ textAlign: 'left', padding: '6px 4px', borderBottom: '1px solid #ddd' }}>Enrolled</th>
                      <th style={{ textAlign: 'left', padding: '6px 4px', borderBottom: '1px solid #ddd' }}>Perm</th>
                      <th style={{ textAlign: 'left', padding: '6px 4px', borderBottom: '1px solid #ddd' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedSections.map((s) => (
                      <tr key={s.classId}>
                        <td style={{ padding: '4px 4px', borderBottom: '1px solid #f0f0f0' }}>{s.term}</td>
                        <td style={{ padding: '4px 4px', borderBottom: '1px solid #f0f0f0' }}>
                          <div style={{ fontWeight: 600 }}>{s.courseCode}</div>
                          <div style={{ color: '#777' }}>{s.courseTitle}</div>
                        </td>
                        <td style={{ padding: '4px 4px', borderBottom: '1px solid #f0f0f0' }}>{s.sectionNum}</td>
                        <td style={{ padding: '4px 4px', borderBottom: '1px solid #f0f0f0' }}>
                          {s.meetingDays} {s.meetingTimes}
                        </td>
                        <td style={{ padding: '4px 4px', borderBottom: '1px solid #f0f0f0' }}>{s.room || 'TBA'}</td>
                        <td style={{ padding: '4px 4px', borderBottom: '1px solid #f0f0f0' }}>
                          {s.instructorName || 'TBA'}
                        </td>
                        <td style={{ padding: '4px 4px', borderBottom: '1px solid #f0f0f0' }}>
                          {s.enrolled ?? 0}/{s.capacity ?? 0}
                        </td>
                        <td style={{ padding: '4px 4px', borderBottom: '1px solid #f0f0f0' }}>
                          {s.requiresPermission ? 'Yes' : 'No'}
                        </td>
                        <td style={{ padding: '4px 4px', borderBottom: '1px solid #f0f0f0' }}>
                          <button
                            type="button"
                            onClick={() => openEdit(s)}
                            style={{
                              padding: '6px 10px',
                              borderRadius: 6,
                              border: '1px solid #ddd',
                              background: '#fff',
                              cursor: 'pointer',
                              fontSize: 12,
                            }}
                          >
                            Edit
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {renderPager()}
            </>
          )}
        </div>
      </div>

      {/* EDIT MODAL */}
      {editOpen && (
        <div
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeEdit();
          }}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            zIndex: 9999,
          }}
        >
          <div
            style={{
              width: 'min(860px, 100%)',
              background: '#fff',
              borderRadius: 10,
              border: '1px solid #e0e0e0',
              boxShadow: '0 10px 24px rgba(0,0,0,0.25)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: '14px 16px',
                borderBottom: '1px solid #eee',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
              }}
            >
              <div>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#222' }}>Edit Class Section</div>
                <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>
                  {editSection?.courseCode} • {editSection?.term} • Class ID {editSection?.classId}
                </div>
              </div>

              <button
                type="button"
                onClick={closeEdit}
                disabled={editSaving}
                style={{
                  padding: '6px 10px',
                  borderRadius: 6,
                  border: '1px solid #ddd',
                  background: '#fff',
                  cursor: 'pointer',
                }}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: 16 }}>
              {editError && (
                <div
                  style={{
                    marginBottom: 12,
                    padding: 10,
                    borderRadius: 6,
                    border: '1px solid #e57373',
                    background: '#ffebee',
                    color: '#c62828',
                    fontSize: 13,
                  }}
                >
                  {editError}
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {/* Locked */}
                <div style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: 12, background: '#fafafa' }}>
                  <div style={{ fontSize: 12, color: '#777', marginBottom: 6, fontWeight: 700 }}>Locked</div>
                  <div style={{ fontSize: 13, color: '#333' }}>
                    <div>
                      <b>Term:</b> {editSection?.term}
                    </div>
                    <div>
                      <b>Course:</b> {editSection?.courseCode} — {editSection?.courseTitle}
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: '#777', marginTop: 8 }}>
                    (Keeping term/course locked prevents accidental moving sections between terms/courses.)
                  </div>
                </div>

                {/* Section core */}
                <div style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: 12 }}>
                  <div style={{ fontSize: 12, color: '#777', marginBottom: 6, fontWeight: 700 }}>Section</div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div>
                      <label style={{ display: 'block', marginBottom: 4, fontWeight: 700, fontSize: 13 }}>
                        Section Number
                      </label>
                      <input
                        type="text"
                        value={editSectionNum}
                        onChange={(e) => setEditSectionNum(e.target.value)}
                        style={{ width: '100%', padding: '8px 10px', border: '1px solid #ddd', borderRadius: 6, fontSize: 14 }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', marginBottom: 4, fontWeight: 700, fontSize: 13 }}>
                        Capacity
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={editCapacity}
                        onChange={(e) => setEditCapacity(e.target.value)}
                        style={{ width: '100%', padding: '8px 10px', border: '1px solid #ddd', borderRadius: 6, fontSize: 14 }}
                      />
                    </div>
                  </div>
                </div>

                {/* Meeting */}
                <div style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: 12 }}>
                  <div style={{ fontSize: 12, color: '#777', marginBottom: 6, fontWeight: 700 }}>Meeting</div>

                  <label style={{ display: 'block', marginBottom: 4, fontWeight: 700, fontSize: 13 }}>
                    Meeting Days
                  </label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 10 }}>
                    {[
                      { key: 'M', label: 'Mon' },
                      { key: 'T', label: 'Tue' },
                      { key: 'W', label: 'Wed' },
                      { key: 'R', label: 'Thu' },
                      { key: 'F', label: 'Fri' },
                    ].map((day) => (
                      <label key={day.key} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13 }}>
                        <input
                          type="checkbox"
                          checked={editMeetingDaysSelection[day.key]}
                          onChange={(e) =>
                            setEditMeetingDaysSelection((prev) => ({
                              ...prev,
                              [day.key]: e.target.checked,
                            }))
                          }
                        />
                        {day.label}
                      </label>
                    ))}
                  </div>

                  <label style={{ display: 'block', marginBottom: 4, fontWeight: 700, fontSize: 13 }}>
                    Meeting Time
                  </label>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input
                      type="time"
                      value={editStartTime}
                      onChange={(e) => setEditStartTime(e.target.value)}
                      style={{ padding: '6px 8px', border: '1px solid #ddd', borderRadius: 6, fontSize: 14 }}
                    />
                    <span>to</span>
                    <input
                      type="time"
                      value={editEndTime}
                      onChange={(e) => setEditEndTime(e.target.value)}
                      style={{ padding: '6px 8px', border: '1px solid #ddd', borderRadius: 6, fontSize: 14 }}
                    />
                  </div>
                </div>

                {/* Assignments */}
                <div style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: 12 }}>
                  <div style={{ fontSize: 12, color: '#777', marginBottom: 6, fontWeight: 700 }}>Assignments</div>

                  <div style={{ marginBottom: 10 }}>
                    <label style={{ display: 'block', marginBottom: 4, fontWeight: 700, fontSize: 13 }}>Room</label>
                    <select
                      value={editRoomId}
                      onChange={(e) => setEditRoomId(e.target.value)}
                      style={{ width: '100%', padding: '8px 10px', border: '1px solid #ddd', borderRadius: 6, fontSize: 14 }}
                    >
                      <option value="">TBA / No room</option>
                      {rooms.map((r) => (
                        <option key={r.roomId} value={r.roomId}>
                          {r.building} {r.room} {r.capacity ? `(${r.capacity})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', marginBottom: 4, fontWeight: 700, fontSize: 13 }}>
                      Instructor
                    </label>
                    <select
                      value={editInstructorId}
                      onChange={(e) => setEditInstructorId(e.target.value)}
                      style={{ width: '100%', padding: '8px 10px', border: '1px solid #ddd', borderRadius: 6, fontSize: 14 }}
                    >
                      <option value="">TBA / Unassigned</option>
                      {instructors.map((u) => (
                        <option key={u.userId} value={u.userId}>
                          {u.firstName} {u.lastName} {u.email ? `(${u.email})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Permission + Notes */}
                <div style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: 12, gridColumn: '1 / -1' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                    <label style={{ fontSize: 14 }}>
                      <input
                        type="checkbox"
                        checked={editRequiresPermission}
                        onChange={(e) => setEditRequiresPermission(e.target.checked)}
                        style={{ marginRight: 8 }}
                      />
                      Requires department permission
                    </label>

                    <div style={{ fontSize: 12, color: '#777' }}>
                      Enrolled: <b>{editSection?.enrolled ?? 0}</b>
                    </div>
                  </div>

                  <div style={{ marginTop: 10 }}>
                    <label style={{ display: 'block', marginBottom: 4, fontWeight: 700, fontSize: 13 }}>Notes</label>
                    <textarea
                      value={editNotes}
                      onChange={(e) => setEditNotes(e.target.value)}
                      rows={3}
                      style={{ width: '100%', padding: '8px 10px', border: '1px solid #ddd', borderRadius: 6, fontSize: 14, resize: 'vertical' }}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div
              style={{
                padding: 16,
                borderTop: '1px solid #eee',
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 10,
                background: '#fafafa',
              }}
            >
              <button
                type="button"
                onClick={closeEdit}
                disabled={editSaving}
                style={{
                  padding: '8px 14px',
                  borderRadius: 6,
                  border: '1px solid #ccc',
                  background: '#fff',
                  cursor: 'pointer',
                  fontWeight: 700,
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                disabled={editSaving}
                style={{
                  padding: '8px 14px',
                  borderRadius: 6,
                  border: 'none',
                  background: '#1976d2',
                  color: '#fff',
                  cursor: 'pointer',
                  fontWeight: 800,
                  opacity: editSaving ? 0.7 : 1,
                }}
              >
                {editSaving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ✅ Capacity confirm modal */}
      <ConfirmModal
        open={capConfirmOpen}
        title="Room Capacity Confirmation"
        message={capConfirmMessage}
        confirmText="Yes, update room capacity"
        cancelText="No"
        busy={saving || editSaving}
        onCancel={handleConfirmRoomCapacityNo}
        onConfirm={handleConfirmRoomCapacityYes}
      />
    </div>
  );
}
