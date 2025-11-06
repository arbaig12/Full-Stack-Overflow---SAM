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
      },
      {
        studentId: '234567',
        name: 'Jane Smith',
        email: 'jane.smith@example.edu',
        grade: 'B+',
      },
      {
        studentId: '345678',
        name: 'Bob Johnson',
        email: 'bob.johnson@example.edu',
        grade: 'I',
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
      },
      {
        studentId: '567890',
        name: 'Charlie Wilson',
        email: 'charlie.wilson@example.edu',
        grade: 'I',
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
    if (currentGrade && currentGrade.toUpperCase() !== 'I') {
      setMessage('Grade changes are only allowed for Incompletes (I).');
      return;
    }
    setEditingGrade(studentId);
    setGradeInput(currentGrade || '');
  };

  const handleGradeSave = (studentId) => {
    const validGrades = ['A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'F', 'P', 'NP'];
    
    if (!validGrades.includes(gradeInput.toUpperCase())) {
      setMessage('Invalid grade. Please enter a valid grade (A, A-, B+, B, B-, C+, C, C-, D+, D, F, P, NP).');
      return;
    }

    const student = selectedCourse.students.find(s => s.studentId === studentId);
    if (!student) return;

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
                        disabled={student.grade && student.grade.toUpperCase() !== 'I'}
                        style={{
                          padding: '4px 8px',
                          border: 'none',
                          borderRadius: 4,
                          background: student.grade && student.grade.toUpperCase() !== 'I' ? '#ccc' : '#007bff',
                          color: 'white',
                          cursor: student.grade && student.grade.toUpperCase() !== 'I' ? 'not-allowed' : 'pointer',
                          fontSize: 12
                        }}
                      >
                        {student.grade && student.grade.toUpperCase() !== 'I' ? 'Locked' : 'Edit Grade'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
