import React, { useState } from 'react';

// Sample degree requirements data
const degreeRequirements = {
  major: {
    name: 'Computer Science',
    totalCredits: 120,
    requiredCourses: [
      { id: 'CSE101', name: 'Introduction to Computer Science', credits: 3, completed: true, grade: 'A' },
      { id: 'CSE114', name: 'Introduction to Object-Oriented Programming', credits: 3, completed: true, grade: 'B+' },
      { id: 'CSE214', name: 'Data Structures', credits: 3, completed: false, grade: null },
      { id: 'CSE219', name: 'Computer Science III', credits: 3, completed: false, grade: null },
      { id: 'CSE220', name: 'Systems Programming', credits: 3, completed: false, grade: null },
      { id: 'CSE300', name: 'Technical Communications', credits: 3, completed: false, grade: null },
      { id: 'CSE316', name: 'Database Systems', credits: 3, completed: false, grade: null },
      { id: 'CSE320', name: 'Programming Languages', credits: 3, completed: false, grade: null },
      { id: 'CSE373', name: 'Analysis of Algorithms', credits: 3, completed: false, grade: null },
      { id: 'CSE416', name: 'Software Engineering', credits: 3, completed: false, grade: null }
    ],
    electiveCredits: 12,
    completedElectiveCredits: 0
  },
  minor: {
    name: 'Mathematics',
    totalCredits: 18,
    requiredCourses: [
      { id: 'MAT131', name: 'Calculus I', credits: 4, completed: true, grade: 'A-' },
      { id: 'MAT132', name: 'Calculus II', credits: 4, completed: false, grade: null },
      { id: 'MAT203', name: 'Linear Algebra', credits: 3, completed: false, grade: null },
      { id: 'MAT303', name: 'Discrete Mathematics', credits: 3, completed: false, grade: null },
      { id: 'MAT304', name: 'Probability and Statistics', credits: 4, completed: false, grade: null }
    ]
  },
  generalEducation: {
    totalCredits: 30,
    categories: [
      {
        name: 'Natural Sciences',
        requiredCredits: 6,
        completedCredits: 3,
        courses: [
          { id: 'PHY131', name: 'Physics I', credits: 3, completed: true, grade: 'B' },
          { id: 'PHY132', name: 'Physics II', credits: 3, completed: false, grade: null }
        ]
      },
      {
        name: 'Social Sciences',
        requiredCredits: 6,
        completedCredits: 6,
        courses: [
          { id: 'PSY103', name: 'Introduction to Psychology', credits: 3, completed: true, grade: 'A' },
          { id: 'SOC105', name: 'Introduction to Sociology', credits: 3, completed: true, grade: 'B+' }
        ]
      },
      {
        name: 'Humanities',
        requiredCredits: 6,
        completedCredits: 3,
        courses: [
          { id: 'ENG101', name: 'Composition', credits: 3, completed: true, grade: 'A-' },
          { id: 'HIS101', name: 'World History', credits: 3, completed: false, grade: null }
        ]
      },
      {
        name: 'Arts',
        requiredCredits: 3,
        completedCredits: 0,
        courses: [
          { id: 'ART101', name: 'Art Appreciation', credits: 3, completed: false, grade: null }
        ]
      },
      {
        name: 'Diversity',
        requiredCredits: 3,
        completedCredits: 0,
        courses: [
          { id: 'ANT101', name: 'Cultural Anthropology', credits: 3, completed: false, grade: null }
        ]
      },
      {
        name: 'Free Electives',
        requiredCredits: 6,
        completedCredits: 3,
        courses: [
          { id: 'MUS101', name: 'Music Theory', credits: 3, completed: true, grade: 'A' }
        ]
      }
    ]
  }
};

// Sample student progress
const studentProgress = {
  totalCreditsCompleted: 30,
  totalCreditsRequired: 120,
  gpa: 3.65,
};

export default function DegreeProgress() {
  const [activeSection, setActiveSection] = useState('overview');

  const calculateProgress = (completed, total) => {
    return Math.round((completed / total) * 100);
  };

  const getGradeColor = (grade) => {
    if (!grade) return '#666';
    if (grade.startsWith('A')) return '#4caf50';
    if (grade.startsWith('B')) return '#2196f3';
    if (grade.startsWith('C')) return '#ff9800';
    return '#f44336';
  };

  const getProgressColor = (percentage) => {
    if (percentage >= 90) return '#4caf50';
    if (percentage >= 70) return '#2196f3';
    if (percentage >= 50) return '#ff9800';
    return '#f44336';
  };

  return (
    <div style={{ padding: 20 }}>
      <h1>Degree Progress</h1>
      
      {/* Navigation Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        {['overview', 'major', 'minor', 'gened'].map(section => (
          <button
            key={section}
            onClick={() => setActiveSection(section)}
            style={{
              padding: '12px 24px',
              border: 'none',
              borderRadius: 6,
              background: activeSection === section ? '#1976d2' : '#f5f5f5',
              color: activeSection === section ? 'white' : '#333',
              cursor: 'pointer',
              fontWeight: 'bold',
              textTransform: 'capitalize'
            }}
          >
            {section === 'gened' ? 'General Education' : section}
          </button>
        ))}
      </div>

      {/* Overview Section */}
      {activeSection === 'overview' && (
        <div>
          <h2>Academic Overview</h2>
          
          {/* Progress Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 20, marginBottom: 32 }}>
            <div style={{
              padding: 24,
              borderRadius: 12,
              background: '#fff',
              boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
              border: '1px solid #e0e0e0'
            }}>
              <h3 style={{ margin: '0 0 16px 0', color: '#333' }}>Overall Progress</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{
                  width: 80,
                  height: 80,
                  borderRadius: '50%',
                  background: `conic-gradient(${getProgressColor(calculateProgress(studentProgress.totalCreditsCompleted, studentProgress.totalCreditsRequired))} ${calculateProgress(studentProgress.totalCreditsCompleted, studentProgress.totalCreditsRequired) * 3.6}deg, #e0e0e0 0deg)`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  position: 'relative'
                }}>
                  <div style={{
                    width: 60,
                    height: 60,
                    borderRadius: '50%',
                    background: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 'bold',
                    fontSize: 14
                  }}>
                    {calculateProgress(studentProgress.totalCreditsCompleted, studentProgress.totalCreditsRequired)}%
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 24, fontWeight: 'bold', color: '#333' }}>
                    {studentProgress.totalCreditsCompleted}/{studentProgress.totalCreditsRequired}
                  </div>
                  <div style={{ color: '#666' }}>Credits Completed</div>
                </div>
              </div>
            </div>

            <div style={{
              padding: 24,
              borderRadius: 12,
              background: '#fff',
              boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
              border: '1px solid #e0e0e0'
            }}>
              <h3 style={{ margin: '0 0 16px 0', color: '#333' }}>GPA</h3>
              <div style={{ fontSize: 32, fontWeight: 'bold', color: '#1976d2' }}>
                {studentProgress.gpa}
              </div>
              <div style={{ color: '#666' }}>Cumulative GPA</div>
            </div>

          </div>

          {/* Quick Summary */}
          <div style={{
            padding: 24,
            borderRadius: 12,
            background: '#f8f9fa',
            border: '1px solid #e0e0e0'
          }}>
            <h3 style={{ margin: '0 0 16px 0' }}>Requirements Summary</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
              <div>
                <div style={{ fontWeight: 'bold', color: '#333' }}>Major Requirements</div>
                <div style={{ color: '#666' }}>
                  {degreeRequirements.major.requiredCourses.filter(c => c.completed).length}/
                  {degreeRequirements.major.requiredCourses.length} courses completed
                </div>
              </div>
              <div>
                <div style={{ fontWeight: 'bold', color: '#333' }}>Minor Requirements</div>
                <div style={{ color: '#666' }}>
                  {degreeRequirements.minor.requiredCourses.filter(c => c.completed).length}/
                  {degreeRequirements.minor.requiredCourses.length} courses completed
                </div>
              </div>
              <div>
                <div style={{ fontWeight: 'bold', color: '#333' }}>General Education</div>
                <div style={{ color: '#666' }}>
                  {degreeRequirements.generalEducation.categories.reduce((acc, cat) => acc + cat.completedCredits, 0)}/
                  {degreeRequirements.generalEducation.totalCredits} credits completed
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Major Requirements Section */}
      {activeSection === 'major' && (
        <div>
          <h2>{degreeRequirements.major.name} Major Requirements</h2>
          
          <div style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3>Required Courses</h3>
              <div style={{ color: '#666' }}>
                {degreeRequirements.major.requiredCourses.filter(c => c.completed).length}/
                {degreeRequirements.major.requiredCourses.length} completed
              </div>
            </div>
            
            <div style={{ display: 'grid', gap: 12 }}>
              {degreeRequirements.major.requiredCourses.map(course => (
                <div
                  key={course.id}
                  style={{
                    padding: 16,
                    borderRadius: 8,
                    background: course.completed ? '#e8f5e8' : '#fff',
                    border: `1px solid ${course.completed ? '#4caf50' : '#e0e0e0'}`,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 'bold', color: '#333' }}>
                      {course.id} - {course.name}
                    </div>
                    <div style={{ color: '#666', fontSize: 14 }}>
                      {course.credits} credits
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    {course.completed && (
                      <span style={{
                        padding: '4px 8px',
                        borderRadius: 12,
                        fontSize: 12,
                        fontWeight: 'bold',
                        background: getGradeColor(course.grade),
                        color: 'white'
                      }}>
                        {course.grade}
                      </span>
                    )}
                    <div style={{
                      width: 24,
                      height: 24,
                      borderRadius: '50%',
                      background: course.completed ? '#4caf50' : '#e0e0e0',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'white',
                      fontWeight: 'bold',
                      fontSize: 12
                    }}>
                      {course.completed ? '✓' : '○'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3>Major Electives</h3>
            <div style={{
              padding: 16,
              borderRadius: 8,
              background: '#f8f9fa',
              border: '1px solid #e0e0e0'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 'bold', color: '#333' }}>Elective Credits Required</div>
                  <div style={{ color: '#666' }}>Choose from approved CS electives</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 18, fontWeight: 'bold', color: '#333' }}>
                    {degreeRequirements.major.completedElectiveCredits}/{degreeRequirements.major.electiveCredits}
                  </div>
                  <div style={{ color: '#666' }}>credits completed</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Minor Requirements Section */}
      {activeSection === 'minor' && (
        <div>
          <h2>{degreeRequirements.minor.name} Minor Requirements</h2>
          
          <div style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3>Required Courses</h3>
              <div style={{ color: '#666' }}>
                {degreeRequirements.minor.requiredCourses.filter(c => c.completed).length}/
                {degreeRequirements.minor.requiredCourses.length} completed
              </div>
            </div>
            
            <div style={{ display: 'grid', gap: 12 }}>
              {degreeRequirements.minor.requiredCourses.map(course => (
                <div
                  key={course.id}
                  style={{
                    padding: 16,
                    borderRadius: 8,
                    background: course.completed ? '#e8f5e8' : '#fff',
                    border: `1px solid ${course.completed ? '#4caf50' : '#e0e0e0'}`,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 'bold', color: '#333' }}>
                      {course.id} - {course.name}
                    </div>
                    <div style={{ color: '#666', fontSize: 14 }}>
                      {course.credits} credits
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    {course.completed && (
                      <span style={{
                        padding: '4px 8px',
                        borderRadius: 12,
                        fontSize: 12,
                        fontWeight: 'bold',
                        background: getGradeColor(course.grade),
                        color: 'white'
                      }}>
                        {course.grade}
                      </span>
                    )}
                    <div style={{
                      width: 24,
                      height: 24,
                      borderRadius: '50%',
                      background: course.completed ? '#4caf50' : '#e0e0e0',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'white',
                      fontWeight: 'bold',
                      fontSize: 12
                    }}>
                      {course.completed ? '✓' : '○'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* General Education Section */}
      {activeSection === 'gened' && (
        <div>
          <h2>General Education Requirements</h2>
          
          <div style={{ display: 'grid', gap: 20 }}>
            {degreeRequirements.generalEducation.categories.map(category => (
              <div key={category.name} style={{
                padding: 20,
                borderRadius: 12,
                background: '#fff',
                border: '1px solid #e0e0e0',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <h3 style={{ margin: 0, color: '#333' }}>{category.name}</h3>
                  <div style={{ color: '#666' }}>
                    {category.completedCredits}/{category.requiredCredits} credits
                  </div>
                </div>
                
                <div style={{ display: 'grid', gap: 8 }}>
                  {category.courses.map(course => (
                    <div
                      key={course.id}
                      style={{
                        padding: 12,
                        borderRadius: 6,
                        background: course.completed ? '#e8f5e8' : '#f8f9fa',
                        border: `1px solid ${course.completed ? '#4caf50' : '#e0e0e0'}`,
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 'bold', color: '#333' }}>
                          {course.id} - {course.name}
                        </div>
                        <div style={{ color: '#666', fontSize: 14 }}>
                          {course.credits} credits
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {course.completed && (
                          <span style={{
                            padding: '4px 8px',
                            borderRadius: 12,
                            fontSize: 12,
                            fontWeight: 'bold',
                            background: getGradeColor(course.grade),
                            color: 'white'
                          }}>
                            {course.grade}
                          </span>
                        )}
                        <div style={{
                          width: 20,
                          height: 20,
                          borderRadius: '50%',
                          background: course.completed ? '#4caf50' : '#e0e0e0',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: 'white',
                          fontWeight: 'bold',
                          fontSize: 10
                        }}>
                          {course.completed ? '✓' : '○'}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
