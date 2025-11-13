import React, { useState, useEffect } from 'react';
import axios from 'axios';

const samplePlan = [
  {
    term: 'Fall 2025',
    workloadLimit: 15,
    courses: [
      { name: 'CSE 114', workload: 3 },
      { name: 'MAT 101', workload: 4 },
      { name: 'AMS 101', workload: 4 },
    ],
  },
  {
    term: 'Spring 2026',
    workloadLimit: 16,
    courses: [
      { name: 'CSE 214', workload: 3 },
      { name: 'MAT 102', workload: 4 },
      { name: 'ENG 101', workload: 3 },
    ],
  },
  {
    term: 'Summer 2026',
    workloadLimit: 0,
    courses: [],
  },
];

export default function PlanPage() {
  const [plan, setPlan] = useState([]);
  const [graduationTerm, setGraduationTerm] = useState('');
  const [message, setMessage] = useState('');
  const ENDYEAR = 2030

  useEffect(() => {
    const fetchPlan = async () => {
      try {
        // Replace with backend call if available
        setPlan(samplePlan);
        setGraduationTerm('Spring 2027');
      } catch (err) {
        console.error('Failed to fetch plan:', err);
      }
    };
    fetchPlan();
  }, []);

  //Generate rolling terms from current year up to 2030
  const generateTerms = () => {
    const terms = [];
    const currentYear = new Date().getFullYear();
    const semesters = ['Spring', 'Summer', 'Fall'];

    for (let year = currentYear; year <= ENDYEAR; year++) {
      for (const sem of semesters) {
        terms.push(`${sem} ${year}`);
      }
    }
    return terms;
  };

  const handleCourseChange = (termIndex, courseIndex, key, value) => {
    const updatedPlan = [...plan];
    updatedPlan[termIndex].courses[courseIndex][key] = value;
    setPlan(updatedPlan);
  };

  const handleAddCourse = (termIndex) => {
    const updatedPlan = [...plan];
    updatedPlan[termIndex].courses.push({ name: '', workload: 3 });
    setPlan(updatedPlan);
  };

  const handleRemoveCourse = (termIndex, courseIndex) => {
    const updatedPlan = [...plan];
    updatedPlan[termIndex].courses.splice(courseIndex, 1);
    setPlan(updatedPlan);
  };

  const handleWorkloadLimitChange = (termIndex, value) => {
    const updatedPlan = [...plan];
    updatedPlan[termIndex].workloadLimit = Number(value);
    setPlan(updatedPlan);
  };

  const handleSave = async () => {
    try {
        //TODO
      // await axios.post('http://localhost:4000/api/users/update-plan', { plan, graduationTerm });
      setMessage('Plan saved successfully! (Simulated)');
    } catch (err) {
      console.error(err);
      setMessage('Failed to save plan.');
    }
  };

  const totalWorkload = (term) =>
    term.courses.reduce((sum, c) => sum + Number(c.workload || 0), 0);

  const graduationOptions = generateTerms();

  return (
    <div style={{ padding: 20, maxWidth: 700, margin: '0 auto' }}>
      <h1>Future Schedule Planning</h1>

      {/* Graduation term dropdown */}
      <div
        style={{
          marginBottom: 20,
          padding: 10,
          backgroundColor: '#f5f5f5',
          borderRadius: 6,
        }}
      >
        <label style={{ fontWeight: 'bold' }}>Planned Graduation Term:</label>
        <select
          value={graduationTerm}
          onChange={(e) => setGraduationTerm(e.target.value)}
          style={{
            display: 'block',
            width: '100%',
            padding: 8,
            marginTop: 8,
            borderRadius: 6,
            border: '1px solid #ccc',
          }}
        >
          <option value="">-- Select Graduation Term --</option>
          {graduationOptions.map((term) => (
            <option key={term} value={term}>
              {term}
            </option>
          ))}
        </select>
      </div>

      {plan.map((term, termIndex) => (
        <div
          key={term.term}
          style={{
            marginBottom: 20,
            padding: 10,
            backgroundColor: '#f5f5f5',
            borderRadius: 6,
          }}
        >
          <h3>{term.term}</h3>

          {/* Workload limit input */}
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontWeight: 'bold' }}>
              Workload Limit:
            </label>
            <input
              type="number"
              value={term.workloadLimit}
              onChange={(e) =>
                handleWorkloadLimitChange(termIndex, e.target.value)
              }
              min="0"
              style={{
                display: 'block',
                width: '100%',
                padding: 8,
                marginTop: 8,
                borderRadius: 6,
                border: '1px solid #ccc',
              }}
            />
            <p style={{ fontStyle: 'italic', marginTop: 4 }}>
              Current total workload: {totalWorkload(term)} / {term.workloadLimit}
            </p>
          </div>

          {/* Course list */}
          {term.courses.map((course, courseIndex) => (
            <div
              key={courseIndex}
              style={{
                display: 'flex',
                alignItems: 'center',
                marginBottom: 8,
                gap: '8px',
              }}
            >
              <input
                type="text"
                value={course.name}
                onChange={(e) =>
                  handleCourseChange(termIndex, courseIndex, 'name', e.target.value)
                }
                placeholder="Course Name"
                style={{
                  flex: 1,
                  padding: 8,
                  borderRadius: 6,
                  border: '1px solid #ccc',
                }}
              />
              <input
                type="number"
                step="0.1"
                min="0"
                value={course.workload}
                onChange={(e) =>
                  handleCourseChange(termIndex, courseIndex, 'workload', e.target.value)
                }
                placeholder="Workload"
                style={{
                  width: 80,
                  padding: 8,
                  borderRadius: 6,
                  border: '1px solid #ccc',
                }}
              />
              <button
                onClick={() => handleRemoveCourse(termIndex, courseIndex)}
                style={{
                  backgroundColor: '#d32f2f',
                  color: 'white',
                  border: 'none',
                  borderRadius: 6,
                  padding: '0 12px',
                  cursor: 'pointer',
                }}
              >
                X
              </button>
            </div>
          ))}

          <button
            onClick={() => handleAddCourse(termIndex)}
            style={{
              padding: '6px 12px',
              backgroundColor: '#1976d2',
              color: 'white',
              fontWeight: 'bold',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
            }}
          >
            Add Course
          </button>
        </div>
      ))}

      <button
        onClick={handleSave}
        style={{
          padding: '12px 24px',
          backgroundColor: '#388e3c',
          color: 'white',
          fontWeight: 'bold',
          border: 'none',
          borderRadius: 6,
          cursor: 'pointer',
        }}
      >
        Save Plan
      </button>

      {message && (
        <p style={{ marginTop: 16, fontWeight: 'bold', color: '#333' }}>{message}</p>
      )}
    </div>
  );
}

