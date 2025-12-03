import React, { useState, useEffect } from 'react';

const sampleCatalog = [
  { id: 'CSE114', name: 'Intro to Programming', credits: 3, prereqs: [], requiredForDegree: true },
  { id: 'CSE214', name: 'Data Structures', credits: 3, prereqs: ['CSE114'], requiredForDegree: true },
  { id: 'CSE314', name: 'Algorithms', credits: 3, prereqs: ['CSE214'], requiredForDegree: true },
  { id: 'MAT101', name: 'Calculus I', credits: 4, prereqs: [], requiredForDegree: true },
  { id: 'MAT102', name: 'Calculus II', credits: 4, prereqs: ['MAT101'], requiredForDegree: true },
  { id: 'AMS101', name: 'Applied Math for CS', credits: 4, prereqs: ['MAT101'], requiredForDegree: false },
  { id: 'ENG101', name: 'English Composition', credits: 3, prereqs: [], requiredForDegree: true },
  { id: 'HIS101', name: 'World History', credits: 3, prereqs: [], requiredForDegree: false },
  { id: 'PHY101', name: 'Physics I', credits: 4, prereqs: ['MAT101'], requiredForDegree: false },
  { id: 'CSE410', name: 'Software Engineering', credits: 3, prereqs: ['CSE314'], requiredForDegree: true },
  { id: 'CSL200', name: 'Intro to Systems', credits: 3, prereqs: ['CSE214'], requiredForDegree: false },
];


const degreeRequirements = {
  requiredCourses: sampleCatalog.filter((c) => c.requiredForDegree).map((c) => c.id),
  minCredits: 120, 
};

//sample plan
const samplePlan = [
  {
    term: 'Fall 2025',
    workloadLimit: 15,
    courses: [
      { id: 'CSE114', name: 'CSE114', workload: 3 },
      { id: 'MAT101', name: 'MAT101', workload: 4 },
      { id: 'AMS101', name: 'AMS101', workload: 4 },
    ],
  },
  {
    term: 'Spring 2026',
    workloadLimit: 16,
    courses: [
      { id: 'CSE214', name: 'CSE214', workload: 3 },
      { id: 'MAT102', name: 'MAT102', workload: 4 },
      { id: 'ENG101', name: 'ENG101', workload: 3 },
    ],
  },
  {
    term: 'Summer 2026',
    workloadLimit: 0,
    courses: [],
  },
];

//helpers
const findCourseInCatalog = (id) => sampleCatalog.find((c) => c.id === id);

const totalWorkload = (term) =>
  term.courses.reduce((sum, c) => sum + Number(c.workload || 0), 0);

const allTakenCourseIds = (plan) =>
  plan.flatMap((t) => t.courses.map((c) => c.id)).filter(Boolean);


const prereqsSatisfied = (courseId, takenIds) => {
  const course = findCourseInCatalog(courseId);
  if (!course) return false; 
  return course.prereqs.every((p) => takenIds.includes(p));
};

const computeUnsatisfiedPrereqs = (plan) => {
  const takenBeforeTerm = new Set();
  const unsatisfied = {};
  for (const term of plan) {
    for (const course of term.courses) {
      const id = course.id;
      const courseObj = findCourseInCatalog(id);
      if (!courseObj) continue;
      const missing = courseObj.prereqs.filter((p) => !takenBeforeTerm.has(p));
      if (missing.length > 0) {
        unsatisfied[id] = missing;
      }
    }
    for (const course of term.courses) {
      if (course.id) takenBeforeTerm.add(course.id);
    }
  }
  return unsatisfied;
};

// Compute final requirement status: which required courses are still missing from plan
const computeDegreeStatus = (plan) => {
  const takenIds = new Set(allTakenCourseIds(plan));
  const missingRequired = degreeRequirements.requiredCourses.filter((rc) => !takenIds.has(rc));
  return {
    missingRequired,
    satisfiedRequired: degreeRequirements.requiredCourses.filter((rc) => takenIds.has(rc)),
  };
};

//basic auto-planner logic
const autoPlanFill = ({ plan, graduationTerm }) => {
  const newPlan = plan.map((t) => ({ ...t, courses: t.courses.map((c) => ({ ...c })) }));

  const taken = new Set(allTakenCourseIds(newPlan));

  const missingRequired = degreeRequirements.requiredCourses.filter((id) => !taken.has(id));

  const termIndices = newPlan.map((t, i) => i);
  for (const termIndex of termIndices) {
    const term = newPlan[termIndex];
    if (!term.workloadLimit || term.workloadLimit <= 0) continue;
    let space = term.workloadLimit - totalWorkload(term);
    if (space <= 0) continue;
    let placedSomething = true;
    while (placedSomething) {
      placedSomething = false;
      for (let i = 0; i < missingRequired.length; i++) {
        const cid = missingRequired[i];
        const courseObj = findCourseInCatalog(cid);
        if (!courseObj) {
          missingRequired.splice(i, 1);
          i--;
          continue;
        }
        
        if (!prereqsSatisfied(cid, Array.from(taken))) continue;
       
        if (courseObj.credits <= space) {
          
          term.courses.push({ id: courseObj.id, name: courseObj.id, workload: courseObj.credits });
          taken.add(courseObj.id);
          space -= courseObj.credits;
          missingRequired.splice(i, 1);
          i--;
          placedSomething = true;
        }
      }
    }
  }

  if (missingRequired.length > 0) {
    for (const cid of missingRequired.slice()) {
      for (const term of newPlan) {
        let space = term.workloadLimit - totalWorkload(term);
        const courseObj = findCourseInCatalog(cid);
        if (!courseObj) continue;
        if (courseObj.credits <= space) {
          term.courses.push({ id: courseObj.id, name: courseObj.id, workload: courseObj.credits });
          taken.add(courseObj.id);
          const idx = missingRequired.indexOf(cid);
          if (idx >= 0) missingRequired.splice(idx, 1);
          break;
        }
      }
    }
  }

  return newPlan;
};

const markCourseRequired = (courseId) => {
  const c = findCourseInCatalog(courseId);
  return c ? c.requiredForDegree : false;
};


export default function PlanPage() {
  const [plan, setPlan] = useState([]);
  const [graduationTerm, setGraduationTerm] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    setPlan(samplePlan.map((t) => ({ ...t, courses: t.courses.map((c) => ({ ...c })) })));
    setGraduationTerm('Spring 2027');
  }, []);

  const ENDYEAR = 2030;

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
    updatedPlan[termIndex].courses.push({ id: '', name: '', workload: 3 });
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
      // Simulated save
      setMessage('Plan saved successfully! (Simulated)');
    } catch (err) {
      console.error(err);
      setMessage('Failed to save plan.');
    }
  };

  const graduationOptions = generateTerms();

  const runAutoPlanner = () => {
    const newPlan = autoPlanFill({ plan, graduationTerm });
    setPlan(newPlan);
    setMessage('Auto-planner ran — it tried to place missing required courses respecting prereqs and workload limits.');
  };

  const unsatisfied = computeUnsatisfiedPrereqs(plan);
  const degreeStatus = computeDegreeStatus(plan);

  const courseDisplayLabel = (course) => {
    if (!course) return '';
    const id = course.id || course.name || '';
    return id;
  };

  return (
    <div style={{ padding: 20, maxWidth: 900, margin: '0 auto' }}>
      <h1>SAM — Auto Planner (Base)</h1>

      <div style={{ marginBottom: 20, padding: 12, background: '#f0f2f5', borderRadius: 8 }}>
        <label style={{ fontWeight: 'bold' }}>Planned Graduation Term:</label>
        <select value={graduationTerm} onChange={(e) => setGraduationTerm(e.target.value)} style={{ display: 'block', width: '100%', padding: 8, marginTop: 8 }}>
          <option value="">-- Select Graduation Term --</option>
          {graduationOptions.map((term) => (
            <option key={term} value={term}>{term}</option>
          ))}
        </select>

        <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
          <button onClick={runAutoPlanner} style={{ padding: '8px 12px', background: '#1976d2', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer' }}>Run Auto-Planner</button>
          <button onClick={() => { setPlan(samplePlan.map((t) => ({ ...t, courses: t.courses.map((c) => ({ ...c })) }))); setMessage('Reset to sample plan'); }} style={{ padding: '8px 12px', background: '#666', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer' }}>Reset</button>
        </div>
      </div>

      <div style={{ marginBottom: 20, padding: 12, borderRadius: 8, background: '#fffbe6', border: '1px solid #ffd54f' }}>
        <h3>Degree Requirement Summary</h3>
        <p>Required courses satisfied: {degreeStatus.satisfiedRequired.length} / {degreeRequirements.requiredCourses.length}</p>
        <p style={{ marginTop: 8 }}><strong>Missing required courses:</strong> {degreeStatus.missingRequired.length === 0 ? 'None' : degreeStatus.missingRequired.join(', ')}</p>
      </div>

      {/*Unsatisfied prereqs display */}
      <div style={{ marginBottom: 20, padding: 12, borderRadius: 8, background: '#fff', border: '1px solid #eee' }}>
        <h3>Unsatisfied Prerequisites in Plan</h3>
        {Object.keys(unsatisfied).length === 0 ? (
          <p>None — prerequisites appear satisfied in the current order.</p>
        ) : (
          <ul>
            {Object.entries(unsatisfied).map(([cid, missing]) => (
              <li key={cid}>{cid} is missing prerequisites: {missing.join(', ')}</li>
            ))}
          </ul>
        )}
      </div>

      {/*the plan*/}
      {plan.map((term, termIndex) => (
        <div key={term.term} style={{ marginBottom: 20, padding: 12, backgroundColor: '#f5f5f5', borderRadius: 6 }}>
          <h3>{term.term}</h3>

          <div style={{ marginBottom: 10 }}>
            <label style={{ fontWeight: 'bold' }}>Workload Limit:</label>
            <input type="number" value={term.workloadLimit} onChange={(e) => handleWorkloadLimitChange(termIndex, e.target.value)} min="0" style={{ display: 'block', width: '100%', padding: 8, marginTop: 8 }} />
            <p style={{ fontStyle: 'italic', marginTop: 4 }}>Current total workload: {totalWorkload(term)} / {term.workloadLimit}</p>
          </div>

          {term.courses.map((course, courseIndex) => {
            const id = course.id || course.name || '';
            const isRequired = markCourseRequired(id);
            const unsat = unsatisfied[id];
            return (
              <div key={courseIndex} style={{ display: 'flex', alignItems: 'center', marginBottom: 8, gap: '8px' }}>
                <input type="text" value={courseDisplayLabel(course)} onChange={(e) => handleCourseChange(termIndex, courseIndex, 'name', e.target.value)} placeholder="Course ID" style={{ flex: 1, padding: 8, borderRadius: 6 }} />
                <input type="number" step="0.1" min="0" value={course.workload} onChange={(e) => handleCourseChange(termIndex, courseIndex, 'workload', e.target.value)} placeholder="Workload" style={{ width: 100, padding: 8, borderRadius: 6 }} />

                {/*highlight non-required classes */}
                <div style={{ padding: '6px 10px', borderRadius: 6, background: isRequired ? '#e8f5e9' : '#fff3e0', border: isRequired ? '1px solid #c8e6c9' : '1px solid #ffd89b' }}>
                  {isRequired ? 'Required' : 'Non-required'}
                </div>

                {/*show unsatisfied prereq*/}
                {unsat && (
                  <div title={`Missing: ${unsat.join(', ')}`} style={{ color: '#d32f2f', fontWeight: 'bold' }}>!</div>
                )}

                <button onClick={() => handleRemoveCourse(termIndex, courseIndex)} style={{ backgroundColor: '#d32f2f', color: 'white', border: 'none', borderRadius: 6, padding: '6px 10px', cursor: 'pointer' }}>X</button>
              </div>
            );
          })}

          <div style={{ marginTop: 10 }}>
            <button onClick={() => handleAddCourse(termIndex)} style={{ padding: '6px 12px', backgroundColor: '#1976d2', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer' }}>Add Course</button>
          </div>
        </div>
      ))}

      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={handleSave} style={{ padding: '12px 24px', backgroundColor: '#388e3c', color: 'white', fontWeight: 'bold', border: 'none', borderRadius: 6, cursor: 'pointer' }}>Save Plan</button>
        <button onClick={() => { setMessage('Sample catalog provided for reference.'); }} style={{ padding: '12px 24px', backgroundColor: '#555', color: 'white', fontWeight: 'bold', border: 'none', borderRadius: 6, cursor: 'pointer' }}>Catalog Info</button>
      </div>
    </div>
  );
}
