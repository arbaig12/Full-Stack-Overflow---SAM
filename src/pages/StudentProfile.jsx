import React, { useState } from 'react';

// Example student data
const studentData = {
  personal: {
    name: 'Jane Doe',
    studentId: '123456',
    email: 'jane.doe@example.edu',
    classStanding: 'U3',
    declaredMajors: ['Computer Science'],
    declaredMinors: ['Applied Mathematical Sciences'],
  },
  academic: {
    termGPAs: [
      { term: 'Fall 2024', gpa: 3.7, credits: 15 },
      { term: 'Spring 2025', gpa: 3.8, credits: 16 },
    ],
    cumulativeGPA: 3.75,
    cumulativeCredits: 31,
    registrationHolds: ['Financial Hold'],
  },
  schedule: [
    {
      term: 'Fall 2025',
      courses: [
        { code: 'CSE101', name: 'Intro to CS', time: 'Mon/Wed 10-11:30', location: 'Room 101', waivedConflict: false },
        { code: 'MAT101', name: 'Linear Algebra', time: 'Tue/Thu 1-2:30', location: 'Room 203', waivedConflict: false },
      ],
    },
  ],
};

const getGradeColor = (grade) => {
  if (!grade) return '#666';
  if (grade.startsWith('A')) return '#4caf50';
  if (grade.startsWith('B')) return '#2196f3';
  if (grade.startsWith('C')) return '#ff9800';
  return '#f44336';
};

export default function StudentProfile() {
  const [activeTab, setActiveTab] = useState('overview');

  return (
    <div style={{ padding: 20 }}>
      <h1>Student Profile</h1>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        {['overview', 'schedule'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '10px 20px',
              borderRadius: 6,
              border: 'none',
              background: activeTab === tab ? '#1976d2' : '#f5f5f5',
              color: activeTab === tab ? 'white' : '#333',
              fontWeight: 'bold',
              cursor: 'pointer',
              textTransform: 'capitalize'
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
          {/* Personal Info */}
          <div style={{ padding: 24, borderRadius: 12, background: '#fff', border: '1px solid #e0e0e0', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
            <h2>Personal Info</h2>
            <p><strong>Name:</strong> {studentData.personal.name}</p>
            <p><strong>ID:</strong> {studentData.personal.studentId}</p>
            <p><strong>Email:</strong> {studentData.personal.email}</p>
            <p><strong>Class Standing:</strong> {studentData.personal.classStanding}</p>
            <p><strong>Declared Majors:</strong> {studentData.personal.declaredMajors.join(', ')}</p>
            <p><strong>Declared Minors:</strong> {studentData.personal.declaredMinors.join(', ')}</p>
          </div>

          {/* Academic Info */}
          <div style={{ padding: 24, borderRadius: 12, background: '#fff', border: '1px solid #e0e0e0', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
            <h2>Academic Info</h2>
            <p><strong>Cumulative GPA:</strong> {studentData.academic.cumulativeGPA}</p>
            <p><strong>Cumulative Credits:</strong> {studentData.academic.cumulativeCredits}</p>
            <p><strong>Registration Holds:</strong> {studentData.academic.registrationHolds.join(', ') || 'None'}</p>
            <h3>Term GPAs</h3>
            {studentData.academic.termGPAs.map(t => (
              <p key={t.term}>{t.term}: {t.gpa} ({t.credits} credits)</p>
            ))}
          </div>
        </div>
      )}

      {/* Schedule Tab */}
      {activeTab === 'schedule' && (
        <div>
          {studentData.schedule.map(term => (
            <div key={term.term} style={{ marginBottom: 24 }}>
              <h2>{term.term} Schedule</h2>
              <div style={{ display: 'grid', gap: 12 }}>
                {term.courses.map(c => (
                  <div key={c.code} style={{
                    padding: 16,
                    borderRadius: 8,
                    background: c.waivedConflict ? '#fff3cd' : '#e8f5e8',
                    border: `1px solid ${c.waivedConflict ? '#ffeeba' : '#4caf50'}`,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}>
                    <div>
                      <div style={{ fontWeight: 'bold', color: '#333' }}>{c.code} - {c.name}</div>
                      <div style={{ color: '#666', fontSize: 14 }}>{c.time}, {c.location}</div>
                    </div>
                    {c.waivedConflict && <span style={{ color: '#856404', fontWeight: 'bold' }}>Waived Conflict</span>}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

