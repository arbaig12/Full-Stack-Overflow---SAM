import React, { useState, useEffect } from "react";

export default function StudentProfile() {
  const [activeTab, setActiveTab] = useState("overview");
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadData() {
      try {
        const res = await fetch("/api/student/profile", {
          credentials: "include",
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load profile");
        setProfile(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  if (loading) return <div style={{ padding: 20 }}>Loading...</div>;
  if (error) return <div style={{ padding: 20, color: "red" }}>{error}</div>;

  const { personal, academic, schedule, schedulesByTerm } = profile;

  return (
    <div style={{ padding: 20 }}>
      <h1>Student Profile</h1>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        {["overview", "academic", "schedule"].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: "10px 20px",
              borderRadius: 6,
              border: "none",
              background: activeTab === tab ? "#1976d2" : "#f5f5f5",
              color: activeTab === tab ? "white" : "#333",
              fontWeight: "bold",
              cursor: "pointer",
              textTransform: "capitalize",
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* OVERVIEW TAB */}
      {activeTab === "overview" && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 16,
          }}
        >
          {/* Personal Info */}
          <div
            style={{
              padding: 24,
              borderRadius: 12,
              background: "#fff",
              border: "1px solid #e0e0e0",
              boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
            }}
          >
            <h2>Personal Info</h2>
            <p><strong>Name:</strong> {personal.name}</p>
            <p><strong>ID:</strong> {personal.studentId}</p>
            <p><strong>Email:</strong> {personal.email}</p>
            {personal.universityEntry && (
              <p><strong>University Entry:</strong> {personal.universityEntry}</p>
            )}
            <p><strong>Class Standing:</strong> {personal.classStanding}</p>
            <div>
              <strong>Majors:</strong>
              <ul style={{ margin: "4px 0", paddingLeft: "20px" }}>
                {personal.declaredMajors.map((m, i) => (
                  <li key={i}>
                    {m.program}
                    {m.requirementVersion && (
                      <span style={{ color: "#666", fontSize: "0.9em" }}>
                        {" "}({m.requirementVersion})
                      </span>
                    )}
                  </li>
                ))}
                {personal.declaredMajors.length === 0 && <li>None</li>}
              </ul>
            </div>
            <div>
              <strong>Minors:</strong>
              <ul style={{ margin: "4px 0", paddingLeft: "20px" }}>
                {personal.declaredMinors.map((m, i) => (
                  <li key={i}>
                    {m.program}
                    {m.requirementVersion && (
                      <span style={{ color: "#666", fontSize: "0.9em" }}>
                        {" "}({m.requirementVersion})
                      </span>
                    )}
                  </li>
                ))}
                {personal.declaredMinors.length === 0 && <li>None</li>}
              </ul>
            </div>
          </div>

          {/* Academic Info */}
          <div
            style={{
              padding: 24,
              borderRadius: 12,
              background: "#fff",
              border: "1px solid #e0e0e0",
              boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
            }}
          >
            <h2>Academic Info</h2>
            <p><strong>Cumulative GPA:</strong> {academic.cumulativeGPA ? academic.cumulativeGPA.toFixed(2) : "N/A"}</p>
            <p><strong>Cumulative Credits:</strong> {academic.cumulativeCredits}</p>
            <p><strong>Registration Holds:</strong> {academic.registrationHolds.join(", ")}</p>

            <h3>Current Term GPA</h3>
            <p>
              {academic.termGPA
                ? `${academic.termGPA.toFixed(2)} (${academic.termCredits} credits)`
                : "No grades yet"}
            </p>
          </div>

          {/* Transfer Courses */}
          {academic.transferCourses && academic.transferCourses.length > 0 && (
            <div
              style={{
                padding: 24,
                borderRadius: 12,
                background: "#fff",
                border: "1px solid #e0e0e0",
                boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
              }}
            >
              <h2>Transfer Courses</h2>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #ddd" }}>
                    <th style={{ padding: "8px", textAlign: "left" }}>Class</th>
                    <th style={{ padding: "8px", textAlign: "left" }}>University</th>
                    <th style={{ padding: "8px", textAlign: "left" }}>Credits</th>
                    <th style={{ padding: "8px", textAlign: "left" }}>SBU Equivalent</th>
                    <th style={{ padding: "8px", textAlign: "left" }}>Grade</th>
                  </tr>
                </thead>
                <tbody>
                  {academic.transferCourses.map((tc, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid #eee" }}>
                      <td style={{ padding: "8px" }}>{tc.class || "N/A"}</td>
                      <td style={{ padding: "8px" }}>{tc.university || "N/A"}</td>
                      <td style={{ padding: "8px" }}>{tc.credits || 0}</td>
                      <td style={{ padding: "8px" }}>
                        {tc.department && tc.course_num
                          ? `${tc.department}${tc.course_num}`
                          : "N/A"}
                      </td>
                      <td style={{ padding: "8px" }}>{tc.grade || "N/A"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ACADEMIC TAB - Term History */}
      {activeTab === "academic" && (
        <div>
          <h2>Academic History by Term</h2>
          {academic.termHistory && academic.termHistory.length > 0 ? (
            <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 16 }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #1976d2", background: "#f5f5f5" }}>
                  <th style={{ padding: "12px", textAlign: "left" }}>Term</th>
                  <th style={{ padding: "12px", textAlign: "right" }}>Term GPA</th>
                  <th style={{ padding: "12px", textAlign: "right" }}>Term Credits</th>
                  <th style={{ padding: "12px", textAlign: "right" }}>Cumulative GPA</th>
                  <th style={{ padding: "12px", textAlign: "right" }}>Cumulative Credits</th>
                </tr>
              </thead>
              <tbody>
                {academic.termHistory.map((term, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid #eee" }}>
                    <td style={{ padding: "12px", fontWeight: "bold" }}>
                      {term.semester} {term.year}
                    </td>
                    <td style={{ padding: "12px", textAlign: "right" }}>
                      {term.termGPA ? term.termGPA.toFixed(2) : "N/A"}
                    </td>
                    <td style={{ padding: "12px", textAlign: "right" }}>{term.termCredits}</td>
                    <td style={{ padding: "12px", textAlign: "right" }}>
                      {term.cumulativeGPA ? term.cumulativeGPA.toFixed(2) : "N/A"}
                    </td>
                    <td style={{ padding: "12px", textAlign: "right" }}>
                      {term.cumulativeCredits}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p>No academic history available.</p>
          )}
        </div>
      )}

      {/* SCHEDULE TAB */}
      {activeTab === "schedule" && (
        <div>
          <h2>Class Schedules</h2>
          
          {schedulesByTerm && schedulesByTerm.length > 0 ? (
            schedulesByTerm.map((termSchedule) => (
              <div key={`${termSchedule.semester}_${termSchedule.year}`} style={{ marginBottom: 32 }}>
                <h3 style={{ marginBottom: 16, color: "#1976d2" }}>
                  {termSchedule.semester} {termSchedule.year}
                </h3>
                {termSchedule.classes.length > 0 ? (
                  <div style={{ display: "grid", gap: 12 }}>
                    {termSchedule.classes.map((c, idx) => (
                      <div
                        key={idx}
                        style={{
                          padding: 16,
                          borderRadius: 8,
                          background: "#e8f5e8",
                          border: "1px solid #4caf50",
                        }}
                      >
                        <div style={{ fontWeight: "bold", color: "#333", marginBottom: 4 }}>
                          {c.code} - {c.name}
                        </div>
                        <div style={{ color: "#666", fontSize: 14 }}>
                          {c.time && <span>{c.time}</span>}
                          {c.time && c.location && <span> • </span>}
                          {c.location && <span>{c.location}</span>}
                          {!c.time && !c.location && <span>Schedule TBA</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ color: "#666" }}>No classes for this term.</p>
                )}
              </div>
            ))
          ) : schedule && schedule.length > 0 ? (
            <div>
              <h3>Current Term</h3>
              <div style={{ display: "grid", gap: 12 }}>
                {schedule.map((c, idx) => (
                  <div
                    key={idx}
                    style={{
                      padding: 16,
                      borderRadius: 8,
                      background: "#e8f5e8",
                      border: "1px solid #4caf50",
                    }}
                  >
                    <div style={{ fontWeight: "bold", color: "#333", marginBottom: 4 }}>
                      {c.code} - {c.name}
                    </div>
                    <div style={{ color: "#666", fontSize: 14 }}>
                      {c.time && <span>{c.time}</span>}
                      {c.time && c.location && <span> • </span>}
                      {c.location && <span>{c.location}</span>}
                      {!c.time && !c.location && <span>Schedule TBA</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p>No schedule information available.</p>
          )}
        </div>
      )}
    </div>
  );
}
