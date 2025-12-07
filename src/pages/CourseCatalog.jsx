import React, { useState, useEffect, useMemo } from 'react';

export default function CourseCatalog() {
  const [courses, setCourses] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTerm, setSelectedTerm] = useState('Fall 2025');
  const [selectedDepartment, setSelectedDepartment] = useState('All');
  const [sortBy, setSortBy] = useState('id');
  const [loading, setLoading] = useState(false);
  const [scrapeStatus, setScrapeStatus] = useState('');
  const [page, setPage] = useState(1);

  const PAGE_SIZE = 100;

  const role = localStorage.getItem('role') || 'student';

  async function loadCourses() {
    try {
      setLoading(true);

      const res = await fetch('/api/catalog/courses', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load course catalog');

      const data = await res.json();
      if (data.ok === false) throw new Error(data.error || 'Failed to load course catalog');

      const mapped = (data.courses || []).map((c) => ({
        id: c.courseCode,
        name: c.title,
        credits: c.credits,
        description: c.description || '',
        prereqText: c.prerequisites || '',
        prerequisites: c.prerequisites
          ? c.prerequisites.split(/[,;]+/).map((s) => s.trim()).filter(Boolean)
          : [],
        sbcText: c.sbc || '',
        sbcs: c.sbc
          ? String(c.sbc).split(/[,;]+/).map((s) => s.trim()).filter(Boolean)
          : [],
        coreqText: c.corequisites || '',
        corequisites: c.corequisites
          ? String(c.corequisites).split(/[,;]+/).map((s) => s.trim()).filter(Boolean)
          : [],
        location: c.department?.name || 'TBA',
        capacity: 999,
        enrolled: 0,
        term: `${c.catalogTerm.semester} ${c.catalogTerm.year}`,
      }));

      setCourses(mapped);
      setPage(1);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCourses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTerm]);

  const handleScrapeClick = async () => {
    try {
      setScrapeStatus('Running SBU catalog scrape...');

      const res = await fetch('/api/catalog/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          term: 'Fall2025',
        }),
      });

      let data = null;
      try {
        data = await res.json();
      } catch {}

      if (!res.ok || (data && data.ok === false)) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }

      setScrapeStatus(
        `Imported/updated ${data.upserted} courses for ${data.term} (${data.subjects.join(', ')}).`
      );

      await loadCourses();
    } catch (err) {
      console.error(err);
      setScrapeStatus(`Error: ${err.message}`);
    }
  };

  const filteredCourses = useMemo(() => {
    const q = searchTerm.toLowerCase();

    return courses.filter((course) => {
      const matchesSearch =
        course.name.toLowerCase().includes(q) ||
        course.id.toLowerCase().includes(q) ||
        course.prereqText.toLowerCase().includes(q) ||
        course.coreqText.toLowerCase().includes(q) ||
        course.sbcText.toLowerCase().includes(q);

      const matchesTerm = course.term === selectedTerm;

      const matchesDepartment =
        selectedDepartment === 'All' || course.id.startsWith(selectedDepartment);

      return matchesSearch && matchesTerm && matchesDepartment;
    });
  }, [courses, searchTerm, selectedTerm, selectedDepartment]);

  const sortedCourses = useMemo(() => {
    const arr = [...filteredCourses];
    arr.sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'credits':
          return b.credits - a.credits;
        case 'enrolled':
          return b.enrolled - a.enrolled;
        case 'id':
        default:
          return a.id.localeCompare(b.id);
      }
    });
    return arr;
  }, [filteredCourses, sortBy]);

  useEffect(() => {
    setPage(1);
  }, [searchTerm, selectedTerm, selectedDepartment, sortBy]);

  const totalPages = Math.max(1, Math.ceil(sortedCourses.length / PAGE_SIZE));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const startIdx = (safePage - 1) * PAGE_SIZE;
  const endIdx = Math.min(startIdx + PAGE_SIZE, sortedCourses.length);
  const pagedCourses = sortedCourses.slice(startIdx, endIdx);

  const departments = useMemo(
    () => [
      'All',
      ...new Set(
        courses.map((course) => {
          const match = course.id.match(/^[A-Z]+/);
          return match ? match[0] : 'Other';
        })
      ),
    ],
    [courses]
  );

  const getAvailabilityColor = (enrolled, capacity) => {
    const e = enrolled || 0;
    const c = capacity || 1;
    const percentage = (e / c) * 100;
    if (percentage >= 90) return '#ff4444';
    if (percentage >= 75) return '#ff8800';
    return '#44aa44';
  };

  const renderPager = () => {
    if (sortedCourses.length <= PAGE_SIZE) return null;

    const goTo = (p) => setPage(Math.min(Math.max(1, p), totalPages));
    const windowSize = 7;
    let start = Math.max(1, safePage - Math.floor(windowSize / 2));
    let end = Math.min(totalPages, start + windowSize - 1);
    start = Math.max(1, end - windowSize + 1);

    const pages = [];
    for (let p = start; p <= end; p++) pages.push(p);

    return (
      <div
        style={{
          marginTop: 20,
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

  return (
    <div style={{ padding: 20 }}>
      <h1>Course Catalog</h1>

      {role === 'registrar' && (
        <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={handleScrapeClick}
            style={{
              padding: '8px 16px',
              borderRadius: 6,
              border: 'none',
              background: '#1976d2',
              color: '#fff',
              fontWeight: 'bold',
              cursor: 'pointer',
            }}
          >
            Import/Refresh from SBU Catalog
          </button>
          {scrapeStatus && <span style={{ fontSize: 13, color: '#555' }}>{scrapeStatus}</span>}
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 200px 150px 150px',
          gap: 16,
          marginBottom: 24,
          alignItems: 'end',
        }}
      >
        <div>
          <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>
            Search Courses
          </label>
          <input
            type="text"
            placeholder="Search by course name, ID, prereqs, coreqs, or SBC..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px',
              border: '1px solid #ddd',
              borderRadius: 6,
              fontSize: 14,
            }}
          />
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>Term</label>
          <select
            value={selectedTerm}
            onChange={(e) => setSelectedTerm(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px',
              border: '1px solid #ddd',
              borderRadius: 6,
              fontSize: 14,
            }}
          >
            <option value="Fall 2025">Fall 2025</option>
            <option value="Spring 2025">Spring 2025</option>
            <option value="Summer 2025">Summer 2025</option>
          </select>
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>
            Department
          </label>
          <select
            value={selectedDepartment}
            onChange={(e) => setSelectedDepartment(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px',
              border: '1px solid #ddd',
              borderRadius: 6,
              fontSize: 14,
            }}
          >
            {departments.map((dept) => (
              <option key={dept} value={dept}>
                {dept}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>Sort By</label>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px',
              border: '1px solid #ddd',
              borderRadius: 6,
              fontSize: 14,
            }}
          >
            <option value="id">Course ID</option>
            <option value="name">Course Name</option>
            <option value="credits">Credits</option>
            <option value="enrolled">Enrollment</option>
          </select>
        </div>
      </div>

      {loading && <p style={{ color: '#666' }}>Loading catalog...</p>}

      <p style={{ marginBottom: 16, color: '#666' }}>
        Showing {sortedCourses.length === 0 ? 0 : startIdx + 1}-{endIdx} of{' '}
        {sortedCourses.length} (filtered) — {courses.length} total
      </p>

      <div style={{ display: 'grid', gap: 16 }}>
        {pagedCourses.map((course) => (
          <div
            key={course.id}
            style={{
              border: '1px solid #e0e0e0',
              borderRadius: 8,
              padding: 20,
              background: '#fff',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
            }}
          >
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'start' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                  <h3 style={{ margin: 0, fontSize: 18, color: '#333' }}>{course.name}</h3>
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
                    {course.credits} credits
                  </span>
                  <span style={{ fontSize: 13, color: '#555' }}>
                    <strong>{course.id}</strong>
                  </span>
                </div>

                <p style={{ margin: '0 0 12px 0', color: '#666', lineHeight: 1.5 }}>
                  {course.description}
                </p>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: 12,
                    fontSize: 14,
                  }}
                >
                  <div>
                    <strong>Department:</strong> {course.location}
                  </div>
                  <div>
                    <strong>SBCs:</strong>{' '}
                    {course.sbcs.length > 0 ? course.sbcs.join(', ') : 'None'}
                  </div>
                  <div>
                    <strong>Corequisites:</strong>{' '}
                    {course.corequisites.length > 0 ? course.corequisites.join(', ') : 'None'}
                  </div>
                  <div>
                    <strong>Prerequisites:</strong>{' '}
                    {course.prerequisites.length > 0 ? course.prerequisites.join(', ') : 'None'}
                  </div>
                </div>
              </div>

              <div style={{ textAlign: 'right' }}>
                <div
                  style={{
                    padding: '8px 12px',
                    borderRadius: 6,
                    background: getAvailabilityColor(course.enrolled, course.capacity),
                    color: 'white',
                    fontWeight: 'bold',
                    fontSize: 14,
                    marginBottom: 8,
                  }}
                >
                  {course.enrolled}/{course.capacity} enrolled
                </div>
                <div style={{ fontSize: 12, color: '#666' }}>
                  {Math.round(((course.enrolled || 0) / (course.capacity || 1)) * 100)}% full
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {renderPager()}

      {sortedCourses.length === 0 && !loading && (
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
          <p>No courses found matching your criteria.</p>
          <p>Try adjusting your search terms or filters.</p>
        </div>
      )}
    </div>
  );
}
