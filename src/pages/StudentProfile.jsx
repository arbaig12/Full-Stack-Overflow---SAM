import React from 'react';

// Sample data for demonstration
const studentData = {
  name: "Jane Doe",
  studentId: "123456",
  email: "jane.doe@example.edu",
  classStanding: "U3",
  termGPA: 3.8,
  cumulativeGPA: 3.65,
  cumulativeCredits: 90,
  majors: ["Computer Science"],
  minors: ["Statistics"],
  registrationHolds: ["Financial Hold"],
  schedule: [
    { term: "Fall 2025", courses: [
      { code: "CSE101", name: "Intro to CS", time: "Mon/Wed 10-11:30", location: "Room 101" },
      { code: "MAT101", name: "Linear Algebra", time: "Tue/Thu 1-2:30", location: "Room 203" },
    ]},
  ]
};

const StudentProfile = () => {
  return (
    <div style={{ padding: 20 }}>
      <h1>Student Profile</h1>
      <section>
        <h2>Personal Info</h2>
        <p><strong>Name:</strong> {studentData.name}</p>
        <p><strong>Student ID:</strong> {studentData.studentId}</p>
        <p><strong>Email:</strong> {studentData.email}</p>
        <p><strong>Class Standing:</strong> {studentData.classStanding}</p>
        <p><strong>Majors:</strong> {studentData.majors.join(", ")}</p>
        <p><strong>Minors:</strong> {studentData.minors.join(", ")}</p>
      </section>

      <section>
        <h2>Academic Info</h2>
        <p><strong>Term GPA:</strong> {studentData.termGPA}</p>
        <p><strong>Cumulative GPA:</strong> {studentData.cumulativeGPA}</p>
        <p><strong>Cumulative Credits:</strong> {studentData.cumulativeCredits}</p>
        <p><strong>Registration Holds:</strong> {studentData.registrationHolds.join(", ") || "None"}</p>
      </section>

      <section>
        <h2>Class Schedule</h2>
        {studentData.schedule.map((term, idx) => (
          <div key={idx}>
            <h3>{term.term}</h3>
            <ul>
              {term.courses.map((course, i) => (
                <li key={i}>
                  {course.code} - {course.name} ({course.time}, {course.location})
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
      
    </div>
  );
};

export default StudentProfile;
