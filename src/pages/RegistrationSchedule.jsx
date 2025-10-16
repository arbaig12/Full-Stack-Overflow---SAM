import React, { useState, useEffect } from 'react';

// Sample data - in a real app this would come from an API
const availableCourses = [
  {
    id: 'CSE101',
    name: 'Introduction to Computer Science',
    credits: 3,
    instructor: 'Dr. Smith',
    schedule: 'Mon/Wed/Fri 10:00-10:50 AM',
    location: 'Engineering Building 101',
    capacity: 30,
    enrolled: 25,
    term: 'Fall 2025',
    prerequisites: []
  },
  {
    id: 'CSE114',
    name: 'Introduction to Object-Oriented Programming',
    credits: 3,
    instructor: 'Prof. Johnson',
    schedule: 'Tue/Thu 2:00-3:20 PM',
    location: 'Engineering Building 203',
    capacity: 25,
    enrolled: 20,
    term: 'Fall 2025',
    prerequisites: ['CSE101']
  },
  {
    id: 'CSE214',
    name: 'Data Structures',
    credits: 3,
    instructor: 'Dr. Brown',
    schedule: 'Mon/Wed/Fri 1:00-1:50 PM',
    location: 'Engineering Building 105',
    capacity: 35,
    enrolled: 32,
    term: 'Fall 2025',
    prerequisites: ['CSE114']
  },
  {
    id: 'MAT131',
    name: 'Calculus I',
    credits: 4,
    instructor: 'Dr. Wilson',
    schedule: 'Mon/Wed/Fri 9:00-9:50 AM',
    location: 'Math Building 301',
    capacity: 40,
    enrolled: 35,
    term: 'Fall 2025',
    prerequisites: []
  }
];

// Sample enrolled courses for the current student
const enrolledCourses = [
  {
    id: 'CSE101',
    name: 'Introduction to Computer Science',
    credits: 3,
    instructor: 'Dr. Smith',
    schedule: 'Mon/Wed/Fri 10:00-10:50 AM',
    location: 'Engineering Building 101',
    grade: null, // null means currently enrolled
    term: 'Fall 2025'
  },
  {
    id: 'MAT131',
    name: 'Calculus I',
    credits: 4,
    instructor: 'Dr. Wilson',
    schedule: 'Mon/Wed/Fri 9:00-9:50 AM',
    location: 'Math Building 301',
    grade: null,
    term: 'Fall 2025'
  }
];

export default function RegistrationSchedule() {
  const [activeTab, setActiveTab] = useState('register');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTerm, setSelectedTerm] = useState('Fall 2025');
  const [enrolled, setEnrolled] = useState(enrolledCourses);
  const [available, setAvailable] = useState(availableCourses);
  const [message, setMessage] = useState('');

  // Filter available courses
  const filteredCourses = available.filter(course => {
    const matchesSearch = course.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         course.id.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesTerm = course.term === selectedTerm;
    const notAlreadyEnrolled = !enrolled.some(enrolledCourse => enrolledCourse.id === course.id);
    
    return matchesSearch && matchesTerm && notAlreadyEnrolled;
  });

  const handleRegister = (course) => {
    // Check if student meets prerequisites
    const studentCompletedCourses = ['CSE101']; // This would come from student's transcript
    const missingPrereqs = course.prerequisites.filter(prereq => 
      !studentCompletedCourses.includes(prereq)
    );

    if (missingPrereqs.length > 0) {
      setMessage(`Cannot register for ${course.id}: Missing prerequisites: ${missingPrereqs.join(', ')}`);
      return;
    }

    // Check if course is full
    if (course.enrolled >= course.capacity) {
      setMessage(`Cannot register for ${course.id}: Course is full`);
      return;
    }

    // Check for time conflicts
    const hasTimeConflict = enrolled.some(enrolledCourse => {
      // Simple time conflict check - in real app this would be more sophisticated
      return enrolledCourse.schedule === course.schedule;
    });

    if (hasTimeConflict) {
      setMessage(`Cannot register for ${course.id}: Time conflict with enrolled course`);
      return;
    }

    // Register for course
    const newEnrollment = {
      ...course,
      grade: null
    };
    
    setEnrolled([...enrolled, newEnrollment]);
    setAvailable(available.map(c => 
      c.id === course.id ? { ...c, enrolled: c.enrolled + 1 } : c
    ));
    setMessage(`Successfully registered for ${course.id}`);
  };

  const handleWithdraw = (course) => {
    setEnrolled(enrolled.filter(c => c.id !== course.id));
    setAvailable(available.map(c => 
      c.id === course.id ? { ...c, enrolled: c.enrolled - 1 } : c
    ));
    setMessage(`Successfully withdrew from ${course.id}`);
  };

  const getTotalCredits = () => {
    return enrolled.reduce((total, course) => total + course.credits, 0);
  };

  const getAvailabilityColor = (enrolled, capacity) => {
    const percentage = (enrolled / capacity) * 100;
    if (percentage >= 90) return '#ff4444';
    if (percentage >= 75) return '#ff8800';
    return '#44aa44';
  };

  return (
    <div style={{ padding: 20 }}>
      <h1>Course Registration & Schedule</h1>
      
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
            fontWeight: 'bold'
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
            fontWeight: 'bold'
          }}
        >
          My Schedule ({enrolled.length} courses, {getTotalCredits()} credits)
        </button>
      </div>

      {/* Message Display */}
      {message && (
        <div style={{
          padding: 12,
          marginBottom: 16,
          borderRadius: 6,
          background: message.includes('Successfully') ? '#d4edda' : '#f8d7da',
          color: message.includes('Successfully') ? '#155724' : '#721c24',
          border: `1px solid ${message.includes('Successfully') ? '#c3e6cb' : '#f5c6cb'}`
        }}>
          {message}
        </div>
      )}

      {activeTab === 'register' && (
        <div>
          <h2>Available Courses</h2>
          
          {/* Search and Filter */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 200px', gap: 16, marginBottom: 24 }}>
            <input
              type="text"
              placeholder="Search courses..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                padding: '8px 12px',
                border: '1px solid #ddd',
                borderRadius: 6,
                fontSize: 14
              }}
            />
            <select
              value={selectedTerm}
              onChange={(e) => setSelectedTerm(e.target.value)}
              style={{
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

          {/* Available Courses List */}
          <div style={{ display: 'grid', gap: 16 }}>
            {filteredCourses.map(course => (
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
                    
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, fontSize: 14, marginBottom: 12 }}>
                      <div><strong>Instructor:</strong> {course.instructor}</div>
                      <div><strong>Schedule:</strong> {course.schedule}</div>
                      <div><strong>Location:</strong> {course.location}</div>
                      <div><strong>Prerequisites:</strong> {course.prerequisites.length > 0 ? course.prerequisites.join(', ') : 'None'}</div>
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
                    <button
                      onClick={() => handleRegister(course)}
                      disabled={course.enrolled >= course.capacity}
                      style={{
                        padding: '8px 16px',
                        border: 'none',
                        borderRadius: 6,
                        background: course.enrolled >= course.capacity ? '#ccc' : '#28a745',
                        color: 'white',
                        cursor: course.enrolled >= course.capacity ? 'not-allowed' : 'pointer',
                        fontWeight: 'bold'
                      }}
                    >
                      {course.enrolled >= course.capacity ? 'Full' : 'Register'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {filteredCourses.length === 0 && (
            <div style={{ 
              textAlign: 'center', 
              padding: 40, 
              color: '#666',
              background: '#f9f9f9',
              borderRadius: 8,
              border: '1px solid #e0e0e0'
            }}>
              <p>No available courses found matching your criteria.</p>
            </div>
          )}
        </div>
      )}

      {activeTab === 'schedule' && (
        <div>
          <h2>My Current Schedule</h2>
          
          {enrolled.length === 0 ? (
            <div style={{ 
              textAlign: 'center', 
              padding: 40, 
              color: '#666',
              background: '#f9f9f9',
              borderRadius: 8,
              border: '1px solid #e0e0e0'
            }}>
              <p>You are not enrolled in any courses for {selectedTerm}.</p>
              <p>Use the "Register for Courses" tab to add courses to your schedule.</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 16 }}>
              {enrolled.map(course => (
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
                          background: '#e8f5e8',
                          color: '#2e7d32'
                        }}>
                          {course.credits} credits
                        </span>
                      </div>
                      
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, fontSize: 14 }}>
                        <div><strong>Instructor:</strong> {course.instructor}</div>
                        <div><strong>Schedule:</strong> {course.schedule}</div>
                        <div><strong>Location:</strong> {course.location}</div>
                        <div><strong>Status:</strong> <span style={{ color: '#28a745', fontWeight: 'bold' }}>Enrolled</span></div>
                      </div>
                    </div>
                    
                    <div style={{ textAlign: 'right' }}>
                      <button
                        onClick={() => handleWithdraw(course)}
                        style={{
                          padding: '8px 16px',
                          border: 'none',
                          borderRadius: 6,
                          background: '#dc3545',
                          color: 'white',
                          cursor: 'pointer',
                          fontWeight: 'bold'
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
