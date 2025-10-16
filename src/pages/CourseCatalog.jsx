import React, { useState, useEffect } from 'react';

// Sample course data - in a real app this would come from an API
const sampleCourses = [
  {
    id: 'CSE101',
    name: 'Introduction to Computer Science',
    credits: 3,
    description: 'Fundamental concepts of computer science including algorithms, data structures, and programming.',
    prerequisites: [],
    instructor: 'Dr. Smith',
    schedule: 'Mon/Wed/Fri 10:00-10:50 AM',
    location: 'Engineering Building 101',
    capacity: 30,
    enrolled: 25,
    term: 'Fall 2025'
  },
  {
    id: 'CSE114',
    name: 'Introduction to Object-Oriented Programming',
    credits: 3,
    description: 'Object-oriented programming concepts using Java. Classes, inheritance, polymorphism, and design patterns.',
    prerequisites: ['CSE101'],
    instructor: 'Prof. Johnson',
    schedule: 'Tue/Thu 2:00-3:20 PM',
    location: 'Engineering Building 203',
    capacity: 25,
    enrolled: 20,
    term: 'Fall 2025'
  },
  {
    id: 'CSE214',
    name: 'Data Structures',
    credits: 3,
    description: 'Advanced data structures including trees, graphs, hash tables, and their applications.',
    prerequisites: ['CSE114'],
    instructor: 'Dr. Brown',
    schedule: 'Mon/Wed/Fri 1:00-1:50 PM',
    location: 'Engineering Building 105',
    capacity: 35,
    enrolled: 32,
    term: 'Fall 2025'
  },
  {
    id: 'CSE316',
    name: 'Database Systems',
    credits: 3,
    description: 'Database design, SQL, normalization, and database management systems.',
    prerequisites: ['CSE214'],
    instructor: 'Prof. Davis',
    schedule: 'Tue/Thu 11:00-12:20 PM',
    location: 'Engineering Building 207',
    capacity: 28,
    enrolled: 28,
    term: 'Fall 2025'
  },
  {
    id: 'MAT131',
    name: 'Calculus I',
    credits: 4,
    description: 'Limits, continuity, derivatives, and applications of differentiation.',
    prerequisites: [],
    instructor: 'Dr. Wilson',
    schedule: 'Mon/Wed/Fri 9:00-9:50 AM',
    location: 'Math Building 301',
    capacity: 40,
    enrolled: 35,
    term: 'Fall 2025'
  },
  {
    id: 'MAT132',
    name: 'Calculus II',
    credits: 4,
    description: 'Integration techniques, applications of integration, and infinite series.',
    prerequisites: ['MAT131'],
    instructor: 'Prof. Taylor',
    schedule: 'Mon/Wed/Fri 11:00-11:50 AM',
    location: 'Math Building 302',
    capacity: 35,
    enrolled: 30,
    term: 'Fall 2025'
  }
];

export default function CourseCatalog() {
  const [courses, setCourses] = useState(sampleCourses);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTerm, setSelectedTerm] = useState('Fall 2025');
  const [selectedDepartment, setSelectedDepartment] = useState('All');
  const [sortBy, setSortBy] = useState('id');

  // Filter courses based on search term, term, and department
  const filteredCourses = courses.filter(course => {
    const matchesSearch = course.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         course.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         course.instructor.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesTerm = course.term === selectedTerm;
    const matchesDepartment = selectedDepartment === 'All' || 
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
  const departments = ['All', ...new Set(courses.map(course => {
    const match = course.id.match(/^[A-Z]+/);
    return match ? match[0] : 'Other';
  }))];

  const getAvailabilityColor = (enrolled, capacity) => {
    const percentage = (enrolled / capacity) * 100;
    if (percentage >= 90) return '#ff4444'; // Red - almost full
    if (percentage >= 75) return '#ff8800'; // Orange - getting full
    return '#44aa44'; // Green - plenty of space
  };

  return (
    <div style={{ padding: 20 }}>
      <h1>Course Catalog</h1>
      
      {/* Filters and Search */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: '1fr 200px 150px 150px', 
        gap: 16, 
        marginBottom: 24,
        alignItems: 'end'
      }}>
        <div>
          <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>
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
          <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>
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
              fontSize: 14
            }}
          >
            {departments.map(dept => (
              <option key={dept} value={dept}>{dept}</option>
            ))}
          </select>
        </div>
        
        <div>
          <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>
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

      {/* Results count */}
      <p style={{ marginBottom: 16, color: '#666' }}>
        Showing {sortedCourses.length} of {courses.length} courses
      </p>

      {/* Course List */}
      <div style={{ display: 'grid', gap: 16 }}>
        {sortedCourses.map(course => (
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
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'start' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                  <h3 style={{ margin: 0, fontSize: 18, color: '#333' }}>
                    {course.id} - {course.name}
                  </h3>
                  <span style={{
                    padding: '2px 8px',
                    borderRadius: 12,
                    fontSize: 12,
                    fontWeight: 'bold',
                    background: '#e3f2fd',
                    color: '#1976d2'
                  }}>
                    {course.credits} credits
                  </span>
                </div>
                
                <p style={{ margin: '0 0 12px 0', color: '#666', lineHeight: 1.5 }}>
                  {course.description}
                </p>
                
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, fontSize: 14 }}>
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
                    <strong>Prerequisites:</strong> {course.prerequisites.length > 0 ? course.prerequisites.join(', ') : 'None'}
                  </div>
                </div>
              </div>
              
              <div style={{ textAlign: 'right' }}>
                <div style={{
                  padding: '8px 12px',
                  borderRadius: 6,
                  background: getAvailabilityColor(course.enrolled, course.capacity),
                  color: 'white',
                  fontWeight: 'bold',
                  fontSize: 14,
                  marginBottom: 8
                }}>
                  {course.enrolled}/{course.capacity} enrolled
                </div>
                <div style={{ fontSize: 12, color: '#666' }}>
                  {Math.round((course.enrolled / course.capacity) * 100)}% full
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {sortedCourses.length === 0 && (
        <div style={{ 
          textAlign: 'center', 
          padding: 40, 
          color: '#666',
          background: '#f9f9f9',
          borderRadius: 8,
          border: '1px solid #e0e0e0'
        }}>
          <p>No courses found matching your criteria.</p>
          <p>Try adjusting your search terms or filters.</p>
        </div>
      )}
    </div>
  );
}
