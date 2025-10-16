import React, { useState } from 'react';

// Sample roster data
const sampleRosters = [
  {
    courseId: 'CSE101',
    courseName: 'Introduction to Computer Science',
    term: 'Fall 2025',
    instructor: 'Dr. Smith',
    students: [
      {
        studentId: '123456',
        name: 'John Doe',
        email: 'john.doe@example.edu',
        grade: 'A',
        attendance: 95,
        assignments: [
          { name: 'Assignment 1', score: 95, maxScore: 100 },
          { name: 'Assignment 2', score: 88, maxScore: 100 },
          { name: 'Midterm Exam', score: 92, maxScore: 100 }
        ]
      },
      {
        studentId: '234567',
        name: 'Jane Smith',
        email: 'jane.smith@example.edu',
        grade: 'B+',
        attendance: 87,
        assignments: [
          { name: 'Assignment 1', score: 85, maxScore: 100 },
          { name: 'Assignment 2', score: 90, maxScore: 100 },
          { name: 'Midterm Exam', score: 88, maxScore: 100 }
        ]
      },
      {
        studentId: '345678',
        name: 'Bob Johnson',
        email: 'bob.johnson@example.edu',
        grade: null,
        attendance: 92,
        assignments: [
          { name: 'Assignment 1', score: 78, maxScore: 100 },
          { name: 'Assignment 2', score: 82, maxScore: 100 },
          { name: 'Midterm Exam', score: 85, maxScore: 100 }
        ]
      }
    ]
  },
  {
    courseId: 'CSE114',
    courseName: 'Introduction to Object-Oriented Programming',
    term: 'Fall 2025',
    instructor: 'Prof. Johnson',
    students: [
      {
        studentId: '456789',
        name: 'Alice Brown',
        email: 'alice.brown@example.edu',
        grade: 'A-',
        attendance: 98,
        assignments: [
          { name: 'Project 1', score: 92, maxScore: 100 },
          { name: 'Project 2', score: 95, maxScore: 100 },
          { name: 'Final Exam', score: 89, maxScore: 100 }
        ]
      },
      {
        studentId: '567890',
        name: 'Charlie Wilson',
        email: 'charlie.wilson@example.edu',
        grade: 'B',
        attendance: 85,
        assignments: [
          { name: 'Project 1', score: 80, maxScore: 100 },
          { name: 'Project 2', score: 85, maxScore: 100 },
          { name: 'Final Exam', score: 82, maxScore: 100 }
        ]
      }
    ]
  }
];

export default function RostersGrading() {
  const [selectedCourse, setSelectedCourse] = useState(sampleRosters[0]);
  const [editingGrade, setEditingGrade] = useState(null);
  const [gradeInput, setGradeInput] = useState('');
  const [message, setMessage] = useState('');

  const handleGradeEdit = (studentId, currentGrade) => {
    setEditingGrade(studentId);
    setGradeInput(currentGrade || '');
  };

  const handleGradeSave = (studentId) => {
    const validGrades = ['A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'F', 'P', 'NP'];
    
    if (!validGrades.includes(gradeInput.toUpperCase())) {
      setMessage('Invalid grade. Please enter a valid grade (A, A-, B+, B, B-, C+, C, C-, D+, D, F, P, NP).');
      return;
    }

    // Update the grade in the selected course
    const updatedCourse = {
      ...selectedCourse,
      students: selectedCourse.students.map(student =>
        student.studentId === studentId
          ? { ...student, grade: gradeInput.toUpperCase() }
          : student
      )
    };

    // Update the rosters array
    const updatedRosters = sampleRosters.map(roster =>
      roster.courseId === selectedCourse.courseId ? updatedCourse : roster
    );

    setSelectedCourse(updatedCourse);
    setEditingGrade(null);
    setMessage(`Grade updated successfully for student ${studentId}`);
  };

  const handleGradeCancel = () => {
    setEditingGrade(null);
    setGradeInput('');
  };

  const calculateAverage = (assignments) => {
    if (assignments.length === 0) return 0;
    const totalScore = assignments.reduce((sum, assignment) => sum + assignment.score, 0);
    const totalMaxScore = assignments.reduce((sum, assignment) => sum + assignment.maxScore, 0);
    return Math.round((totalScore / totalMaxScore) * 100);
  };

  const getGradeColor = (grade) => {
    if (!grade) return '#666';
    if (grade.startsWith('A')) return '#4caf50';
    if (grade.startsWith('B')) return '#2196f3';
    if (grade.startsWith('C')) return '#ff9800';
    if (grade.startsWith('D')) return '#ff5722';
    if (grade === 'F') return '#f44336';
    return '#666';
  };

  return (
    <div style={{ padding: 20 }}>
      <h1>Rosters & Grading</h1>
      
      {/* Course Selection */}
      <div style={{ marginBottom: 24 }}>
        <label style={{ display: 'block', marginBottom: 8, fontWeight: 'bold' }}>
          Select Course:
        </label>
        <select
          value={selectedCourse.courseId}
          onChange={(e) => {
            const course = sampleRosters.find(r => r.courseId === e.target.value);
            setSelectedCourse(course);
          }}
          style={{
            padding: '8px 12px',
            border: '1px solid #ddd',
            borderRadius: 6,
            fontSize: 14,
            minWidth: 300
          }}
        >
          {sampleRosters.map(roster => (
            <option key={roster.courseId} value={roster.courseId}>
              {roster.courseId} - {roster.courseName} ({roster.term})
            </option>
          ))}
        </select>
      </div>

      {/* Message Display */}
      {message && (
        <div style={{
          padding: 12,
          marginBottom: 16,
          borderRadius: 6,
          background: message.includes('successfully') ? '#d4edda' : '#f8d7da',
          color: message.includes('successfully') ? '#155724' : '#721c24',
          border: `1px solid ${message.includes('successfully') ? '#c3e6cb' : '#f5c6cb'}`
        }}>
          {message}
        </div>
      )}

      {/* Course Information */}
      <div style={{
        padding: 20,
        borderRadius: 12,
        background: '#f8f9fa',
        border: '1px solid #e0e0e0',
        marginBottom: 24
      }}>
        <h2 style={{ margin: '0 0 8px 0' }}>
          {selectedCourse.courseId} - {selectedCourse.courseName}
        </h2>
        <div style={{ color: '#666' }}>
          <strong>Term:</strong> {selectedCourse.term} | 
          <strong> Instructor:</strong> {selectedCourse.instructor} | 
          <strong> Students:</strong> {selectedCourse.students.length}
        </div>
      </div>

      {/* Student Roster */}
      <div style={{
        background: '#fff',
        borderRadius: 12,
        border: '1px solid #e0e0e0',
        overflow: 'hidden',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
      }}>
        <div style={{
          padding: 16,
          background: '#f8f9fa',
          borderBottom: '1px solid #e0e0e0',
          fontWeight: 'bold'
        }}>
          Student Roster ({selectedCourse.students.length} students)
        </div>
        
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8f9fa' }}>
                <th style={{ padding: 12, textAlign: 'left', borderBottom: '1px solid #e0e0e0' }}>
                  Student ID
                </th>
                <th style={{ padding: 12, textAlign: 'left', borderBottom: '1px solid #e0e0e0' }}>
                  Name
                </th>
                <th style={{ padding: 12, textAlign: 'left', borderBottom: '1px solid #e0e0e0' }}>
                  Email
                </th>
                <th style={{ padding: 12, textAlign: 'center', borderBottom: '1px solid #e0e0e0' }}>
                  Attendance
                </th>
                <th style={{ padding: 12, textAlign: 'center', borderBottom: '1px solid #e0e0e0' }}>
                  Average
                </th>
                <th style={{ padding: 12, textAlign: 'center', borderBottom: '1px solid #e0e0e0' }}>
                  Grade
                </th>
                <th style={{ padding: 12, textAlign: 'center', borderBottom: '1px solid #e0e0e0' }}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {selectedCourse.students.map((student, index) => (
                <tr key={student.studentId} style={{ 
                  background: index % 2 === 0 ? '#fff' : '#f9f9f9' 
                }}>
                  <td style={{ padding: 12, borderBottom: '1px solid #e0e0e0' }}>
                    {student.studentId}
                  </td>
                  <td style={{ padding: 12, borderBottom: '1px solid #e0e0e0' }}>
                    {student.name}
                  </td>
                  <td style={{ padding: 12, borderBottom: '1px solid #e0e0e0' }}>
                    {student.email}
                  </td>
                  <td style={{ padding: 12, textAlign: 'center', borderBottom: '1px solid #e0e0e0' }}>
                    {student.attendance}%
                  </td>
                  <td style={{ padding: 12, textAlign: 'center', borderBottom: '1px solid #e0e0e0' }}>
                    {calculateAverage(student.assignments)}%
                  </td>
                  <td style={{ padding: 12, textAlign: 'center', borderBottom: '1px solid #e0e0e0' }}>
                    {editingGrade === student.studentId ? (
                      <input
                        type="text"
                        value={gradeInput}
                        onChange={(e) => setGradeInput(e.target.value)}
                        style={{
                          width: 60,
                          padding: '4px 8px',
                          border: '1px solid #ddd',
                          borderRadius: 4,
                          textAlign: 'center'
                        }}
                        placeholder="A"
                      />
                    ) : (
                      <span style={{
                        padding: '4px 8px',
                        borderRadius: 4,
                        background: getGradeColor(student.grade),
                        color: 'white',
                        fontWeight: 'bold',
                        fontSize: 12
                      }}>
                        {student.grade || 'N/A'}
                      </span>
                    )}
                  </td>
                  <td style={{ padding: 12, textAlign: 'center', borderBottom: '1px solid #e0e0e0' }}>
                    {editingGrade === student.studentId ? (
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                        <button
                          onClick={() => handleGradeSave(student.studentId)}
                          style={{
                            padding: '4px 8px',
                            border: 'none',
                            borderRadius: 4,
                            background: '#28a745',
                            color: 'white',
                            cursor: 'pointer',
                            fontSize: 12
                          }}
                        >
                          Save
                        </button>
                        <button
                          onClick={handleGradeCancel}
                          style={{
                            padding: '4px 8px',
                            border: 'none',
                            borderRadius: 4,
                            background: '#6c757d',
                            color: 'white',
                            cursor: 'pointer',
                            fontSize: 12
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleGradeEdit(student.studentId, student.grade)}
                        style={{
                          padding: '4px 8px',
                          border: 'none',
                          borderRadius: 4,
                          background: '#007bff',
                          color: 'white',
                          cursor: 'pointer',
                          fontSize: 12
                        }}
                      >
                        Edit Grade
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Assignment Details */}
      <div style={{ marginTop: 32 }}>
        <h2>Assignment Details</h2>
        <div style={{ display: 'grid', gap: 16 }}>
          {selectedCourse.students.map(student => (
            <div
              key={student.studentId}
              style={{
                padding: 20,
                borderRadius: 12,
                background: '#fff',
                border: '1px solid #e0e0e0',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
              }}
            >
              <h3 style={{ margin: '0 0 16px 0', color: '#333' }}>
                {student.name} ({student.studentId})
              </h3>
              
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                {student.assignments.map((assignment, index) => (
                  <div
                    key={index}
                    style={{
                      padding: 12,
                      borderRadius: 8,
                      background: '#f8f9fa',
                      border: '1px solid #e0e0e0'
                    }}
                  >
                    <div style={{ fontWeight: 'bold', marginBottom: 4 }}>
                      {assignment.name}
                    </div>
                    <div style={{ color: '#666', fontSize: 14 }}>
                      {assignment.score}/{assignment.maxScore} ({Math.round((assignment.score/assignment.maxScore)*100)}%)
                    </div>
                  </div>
                ))}
              </div>
              
              <div style={{ 
                marginTop: 12, 
                padding: 8, 
                background: '#e3f2fd', 
                borderRadius: 6,
                textAlign: 'center'
              }}>
                <strong>Overall Average: {calculateAverage(student.assignments)}%</strong>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
