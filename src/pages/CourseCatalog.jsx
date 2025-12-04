import React, { useState, useEffect } from 'react';

export default function CourseCatalog() {
  const [courses, setCourses] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTerm, setSelectedTerm] = useState('Fall 2025');
  const [selectedDepartment, setSelectedDepartment] = useState('All');
  const [sortBy, setSortBy] = useState('id');
  const [loading, setLoading] = useState(false);
  const [scrapeStatus, setScrapeStatus] = useState('');

  // Same pattern as Dashboard: role stored in localStorage
  const role = localStorage.getItem('role') || 'student';

  // Load courses from backend
  async function loadCourses() {
    try {
      setLoading(true);

      // For now we just fetch all courses and filter by term on the frontend
      const res = await fetch('/api/catalog/courses', {
        credentials: 'include'
      });
      if (!res.ok) {
        throw new Error('Failed to load course catalog');
      }
      const data = await res.json();
      if (data.ok === false) {
        throw new Error(data.error || 'Failed to load course catalog');
      }

      // Map API shape → UI shape
      const mapped = (data.courses || []).map((c) => ({
        id: c.courseCode, // e.g. "CSE214"
        name: c.title,
        credits: c.credits,
        description: c.description || '',
        // keep original prereq string too if you want to show it
        prereqText: c.prerequisites || '',
        // we still keep an array for the existing UI, split on ";" or "," if present
        prerequisites: c.prerequisites
          ? c.prerequisites.split(/[,;]+/).map((s) => s.trim()).filter(Boolean)
          : [],
        instructor: 'TBA', // real instructor comes from sections
        schedule: 'TBA',
        location: c.department?.name || 'TBA',
        capacity: 999,
        enrolled: 0,
        term: `${c.catalogTerm.semester} ${c.catalogTerm.year}`
      }));

      setCourses(mapped);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  // Initial load + reload when selectedTerm changes (we still call same backend,
  // but filtering by term is done on the frontend).
  useEffect(() => {
    loadCourses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTerm]);

  // Registrar-only: run scraper then reload courses
  const handleScrapeClick = async () => {
  try {
    setScrapeStatus('Running SBU catalog scrape...');

    const res = await fetch('/api/catalog/scrape', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        term: 'Fall2025',
        // subjects: ['CSE', 'AMS']
      })
    });

    let data = null;
    try {
      data = await res.json();
    } catch {
      // non-JSON body (e.g., HTML error)
    }

    if (!res.ok || (data && data.ok === false)) {
      throw new Error(data?.error || `HTTP ${res.status}`);
    }

    setScrapeStatus(
      `Imported/updated ${data.upserted} courses for ${data.term} (${data.subjects.join(
        ', '
      )}).`
    );

    await loadCourses();
  } catch (err) {
    console.error(err);
    setScrapeStatus(`Error: ${err.message}`);
  }
};


  // Filter courses based on search term, term, and department
  const filteredCourses = courses.filter((course) => {
    const matchesSearch =
      course.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      course.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      course.instructor.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesTerm = course.term === selectedTerm;

    const matchesDepartment =
      selectedDepartment === 'All' ||
      course.id.startsWith(selectedDepartment);

    return matchesSearch && matchesTerm && matchesDepartment;
  });

  // Sort courses
  const sortedCourses = [...filteredCourses].sort((a, b) => {
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

  // Get unique departments from course IDs
  const departments = [
    'All',
    ...new Set(
      courses.map((course) => {
        const match = course.id.match(/^[A-Z]+/);
        return match ? match[0] : 'Other';
      })
    )
  ];

  const getAvailabilityColor = (enrolled, capacity) => {
    const e = enrolled || 0;
    const c = capacity || 1;
    const percentage = (e / c) * 100;
    if (percentage >= 90) return '#ff4444'; // Red - almost full
    if (percentage >= 75) return '#ff8800'; // Orange - getting full
    return '#44aa44'; // Green - plenty of space
  };

  return (
    <div style={{ padding: 20 }}>
      <h1>Course Catalog</h1>

      {/* Registrar-only scrape button */}
      {role === 'registrar' && (
        <div
          style={{
            marginBottom: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 12
          }}
        >
          <button
            onClick={handleScrapeClick}
            style={{
              padding: '8px 16px',
              borderRadius: 6,
              border: 'none',
              background: '#1976d2',
              color: '#fff',
              fontWeight: 'bold',
              cursor: 'pointer'
            }}
          >
            Import/Refresh from SBU Catalog
          </button>
          {scrapeStatus && (
            <span style={{ fontSize: 13, color: '#555' }}>{scrapeStatus}</span>
          )}
        </div>
      )}

      {/* Filters and Search */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 200px 150px 150px',
          gap: 16,
          marginBottom: 24,
          alignItems: 'end'
        }}
      >
        <div>
          <label
            style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}
          >
            Search Courses
          </label>
          <input
            type="text"
            placeholder="Search by course name, ID, or instructor..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px',
              border: '1px solid #ddd',
              borderRadius: 6,
              fontSize: 14
            }}
          />
        </div>

        <div>
          <label
            style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}
          >
            Term
          </label>
          <select
            value={selectedTerm}
            onChange={(e) => setSelectedTerm(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px',
              border: '1px solid #ddd',
              borderRadius: 6,
              fontSize: 14
            }}
          >
            <option value="Fall 2025">Fall 2025</option>
            <option value="Spring 2025">Spring 2025</option>
            <option value="Summer 2025">Summer 2025</option>
          </select>
        </div>

        <div>
          <label
            style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}
          >
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
              fontSize: 14
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
          <label
            style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}
          >
            Sort By
          </label>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px',
              border: '1px solid #ddd',
              borderRadius: 6,
              fontSize: 14
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

      {/* Results count */}
      <p style={{ marginBottom: 16, color: '#666' }}>
        Showing {sortedCourses.length} of {courses.length} courses
      </p>

      {/* Course List */}
      <div style={{ display: 'grid', gap: 16 }}>
        {sortedCourses.map((course) => (
          <div
            key={course.id}
            style={{
              border: '1px solid #e0e0e0',
              borderRadius: 8,
              padding: 20,
              background: '#fff',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
            }}
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr auto',
                alignItems: 'start'
              }}
            >
              <div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    marginBottom: 8
                  }}
                >
                  <h3
                    style={{
                      margin: 0,
                      fontSize: 18,
                      color: '#333'
                    }}
                  >
                     {course.name}
                  </h3>
                  <span
                    style={{
                      padding: '2px 8px',
                      borderRadius: 12,
                      fontSize: 12,
                      fontWeight: 'bold',
                      background: '#e3f2fd',
                      color: '#1976d2'
                    }}
                  >
                    {course.credits} credits
                  </span>
                </div>

                <p
                  style={{
                    margin: '0 0 12px 0',
                    color: '#666',
                    lineHeight: 1.5
                  }}
                >
                  {course.description}
                </p>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns:
                      'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: 12,
                    fontSize: 14
                  }}
                >
                  <div>
                    <strong>Instructor:</strong> {course.instructor}
                  </div>
                  <div>
                    <strong>Schedule:</strong> {course.schedule}
                  </div>
                  <div>
                    <strong>Location:</strong> {course.location}
                  </div>
                  <div>
                    <strong>Prerequisites:</strong>{' '}
                    {course.prerequisites.length > 0
                      ? course.prerequisites.join(', ')
                      : 'None'}
                  </div>
                </div>
              </div>

              <div style={{ textAlign: 'right' }}>
                <div
                  style={{
                    padding: '8px 12px',
                    borderRadius: 6,
                    background: getAvailabilityColor(
                      course.enrolled,
                      course.capacity
                    ),
                    color: 'white',
                    fontWeight: 'bold',
                    fontSize: 14,
                    marginBottom: 8
                  }}
                >
                  {course.enrolled}/{course.capacity} enrolled
                </div>
                <div style={{ fontSize: 12, color: '#666' }}>
                  {Math.round(
                    ((course.enrolled || 0) / (course.capacity || 1)) * 100
                  )}
                  % full
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {sortedCourses.length === 0 && !loading && (
        <div
          style={{
            textAlign: 'center',
            padding: 40,
            color: '#666',
            background: '#f9f9f9',
            borderRadius: 8,
            border: '1px solid #e0e0e0'
          }}
        >
          <p>No courses found matching your criteria.</p>
          <p>Try adjusting your search terms or filters.</p>
        </div>
      )}
    </div>
  );
}
