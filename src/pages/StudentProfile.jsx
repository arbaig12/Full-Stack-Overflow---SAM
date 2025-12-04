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

  const { personal, academic, schedule } = profile;

  return (
    <div style={{ padding: 20 }}>
      <h1>Student Profile</h1>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        {["overview", "schedule"].map((tab) => (
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
            <p><strong>Class Standing:</strong> {personal.classStanding}</p>
            <p><strong>Majors:</strong> {personal.declaredMajors.join(", ")}</p>
            <p><strong>Minors:</strong> {personal.declaredMinors.join(", ")}</p>
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
            <p><strong>Cumulative GPA:</strong> {academic.cumulativeGPA ?? "N/A"}</p>
            <p><strong>Cumulative Credits:</strong> {academic.cumulativeCredits}</p>
            <p><strong>Registration Holds:</strong> {academic.registrationHolds.join(", ")}</p>

            <h3>Current Term GPA</h3>
            <p>
              {academic.termGPA
                ? `${academic.termGPA.toFixed(2)} (${academic.termCredits} credits)`
                : "No grades yet"}
            </p>
          </div>
        </div>
      )}

      {/* SCHEDULE TAB */}
      {activeTab === "schedule" && (
        <div>
          <h2>Current Term Schedule</h2>

          {schedule.length === 0 && <p>No current-term courses.</p>}

          <div style={{ display: "grid", gap: 12 }}>
            {schedule.map((c) => (
              <div
                key={c.code}
                style={{
                  padding: 16,
                  borderRadius: 8,
                  background: "#e8f5e8",
                  border: "1px solid #4caf50",
                }}
              >
                <div style={{ fontWeight: "bold", color: "#333" }}>
                  {c.code} - {c.name}
                </div>
                <div style={{ color: "#666", fontSize: 14 }}>
                  {c.time}, {c.location}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
