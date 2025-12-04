// src/pages/DegreeProgress.jsx
import React, { useEffect, useState } from "react";

export default function DegreeProgress() {
  const [activeSection, setActiveSection] = useState("overview");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [overview, setOverview] = useState(null);
  const [sbcRequirements, setSbcRequirements] = useState(null);
  const [majorReq, setMajorReq] = useState(null);
  const [minorReq, setMinorReq] = useState(null);

  /* ------------------ LOAD DATA ------------------ */
  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setError("");

        const res = await fetch("/api/degree/progress", {
          credentials: "include",
        });

        const data = await res.json();

        if (!res.ok || data.ok === false) {
          throw new Error(data.error || "Failed loading degree progress.");
        }

        setOverview(data.overview);
        setSbcRequirements(data.sbcRequirements);
        setMajorReq(data.majorRequirements);
        setMinorReq(data.minorRequirements);
      } catch (err) {
        console.error(err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  /* ------------------ HELPERS ------------------ */
  const calculateProgress = (completed, total) => {
    if (!total) return 0;
    return Math.round((completed / total) * 100);
  };

  const getGradeColor = (grade) => {
    if (!grade) return "#777";
    if (grade.startsWith("A")) return "#4caf50";
    if (grade.startsWith("B")) return "#2196f3";
    if (grade.startsWith("C")) return "#ff9800";
    return "#f44336";
  };

  const getProgressColor = (pct) => {
    if (pct >= 90) return "#4caf50";
    if (pct >= 70) return "#2196f3";
    if (pct >= 50) return "#ff9800";
    return "#f44336";
  };

  const totalCreditsCompleted = overview?.totalCreditsCompleted ?? 0;
  const totalCreditsRequired = overview?.totalCreditsRequired ?? 120;
  const overallPercent = calculateProgress(
    totalCreditsCompleted,
    totalCreditsRequired
  );

  const genEdCompletedCredits = sbcRequirements
    ? sbcRequirements.sbcCategories.reduce((sum, cat) => {
        const catCredits = cat.completedCourses.reduce(
          (sum2, c) => sum2 + (c.credits || 0),
          0
        );
        return sum + catCredits;
      }, 0)
    : 0;

  /* ===========================================================
      RENDER PAGE
  ============================================================ */
  return (
    <div style={{ padding: 20 }}>
      <h1>Degree Progress</h1>

      {/* Loading */}
      {loading && <p style={{ color: "#666" }}>Loading degree progress...</p>}

      {/* Error */}
      {error && (
        <div
          style={{
            padding: 12,
            borderRadius: 6,
            background: "#f8d7da",
            color: "#721c24",
            border: "1px solid #f5c6cb",
            marginBottom: 16,
          }}
        >
          {error}
        </div>
      )}

      {/* ----------------- NAV TABS ----------------- */}
      <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        {["overview", "major", "minor", "gened"].map((section) => (
          <button
            key={section}
            onClick={() => setActiveSection(section)}
            style={{
              padding: "12px 24px",
              border: "none",
              borderRadius: 6,
              background: activeSection === section ? "#1976d2" : "#f5f5f5",
              color: activeSection === section ? "white" : "#333",
              fontWeight: "bold",
              cursor: "pointer",
              textTransform: "capitalize",
            }}
          >
            {section === "gened" ? "General Education" : section}
          </button>
        ))}
      </div>

      {/* ===========================================================
          OVERVIEW
      ============================================================ */}
      {activeSection === "overview" && overview && (
        <div>
          <h2>Academic Overview</h2>

          {/* --- Summary Cards --- */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
              gap: 20,
              marginBottom: 32,
            }}
          >
            {/* Credits */}
            <div
              style={{
                padding: 24,
                borderRadius: 12,
                background: "#fff",
                border: "1px solid #ddd",
                boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
              }}
            >
              <h3>Overall Progress</h3>

              <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
                <div
                  style={{
                    width: 80,
                    height: 80,
                    borderRadius: "50%",
                    background: `conic-gradient(${getProgressColor(
                      overallPercent
                    )} ${overallPercent * 3.6}deg, #eee 0deg)`,
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                >
                  <div
                    style={{
                      width: 60,
                      height: 60,
                      borderRadius: "50%",
                      background: "white",
                      display: "flex",
                      justifyContent: "center",
                      alignItems: "center",
                      fontWeight: "bold",
                    }}
                  >
                    {overallPercent}%
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: 22, fontWeight: "bold" }}>
                    {totalCreditsCompleted}/{totalCreditsRequired}
                  </div>
                  <div style={{ color: "#666" }}>Credits Completed</div>
                </div>
              </div>
            </div>

            {/* GPA */}
            <div
              style={{
                padding: 24,
                borderRadius: 12,
                background: "#fff",
                border: "1px solid #ddd",
                boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
              }}
            >
              <h3>GPA</h3>
              <div style={{ fontSize: 32, fontWeight: "bold", color: "#1976d2" }}>
                {overview.gpa != null ? overview.gpa.toFixed(3) : "N/A"}
              </div>
            </div>
          </div>

          {/* --- Requirement Summary --- */}
          <div
            style={{
              padding: 24,
              background: "#f8f9fa",
              borderRadius: 12,
              border: "1px solid #ddd",
            }}
          >
            <h3>Requirements Summary</h3>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                gap: 16,
              }}
            >
              <div>
                <strong>Major</strong>
                <div style={{ color: "#666" }}>
                  {majorReq
                    ? majorReq.requiredCourses.filter((c) => c.completed).length
                    : 0}
                  /
                  {majorReq ? majorReq.requiredCourses.length : "--"} courses
                  completed
                </div>
              </div>

              <div>
                <strong>Minor</strong>
                <div style={{ color: "#666" }}>
                  {minorReq
                    ? minorReq.requiredCourses.filter((c) => c.completed).length
                    : 0}
                  /
                  {minorReq ? minorReq.requiredCourses.length : "--"} courses
                  completed
                </div>
              </div>

              <div>
                <strong>General Education (SBC)</strong>
                <div style={{ color: "#666" }}>
                  {genEdCompletedCredits}/
                  {sbcRequirements?.minimumCredits ?? "--"} credits completed
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===========================================================
          MAJOR
      ============================================================ */}
      {activeSection === "major" && majorReq && (
        <div>
          <h2>{majorReq.name} — Major Requirements</h2>

          <div style={{ marginTop: 16 }}>
            {majorReq.requiredCourses.map((c) => {
              const bg = c.completed
                ? "#e8f5e8"
                : c.inProgress
                ? "#fafafa"
                : "#ffffff";

              const border = c.completed
                ? "#4caf50"
                : c.inProgress
                ? "#b0bec5"
                : "#ddd";

              return (
                <div
                  key={c.id}
                  style={{
                    padding: 16,
                    borderRadius: 8,
                    marginBottom: 10,
                    background: bg,
                    border: `1px solid ${border}`,
                  }}
                >
                  <div style={{ fontWeight: "bold" }}>
                    {c.subject} {c.courseNum} — {c.title}
                  </div>
                  <div style={{ fontSize: 13, color: "#666" }}>
                    {c.credits} credits
                    {c.minGrade && (
                      <> • Required grade: <b>{c.minGrade}</b></>
                    )}
                  </div>

                  {c.completed && (
                    <span
                      style={{
                        padding: "4px 8px",
                        borderRadius: 6,
                        background: getGradeColor(c.grade),
                        color: "white",
                        marginTop: 8,
                        display: "inline-block",
                        fontSize: 12,
                      }}
                    >
                      {c.grade}
                    </span>
                  )}

                  {c.inProgress && (
                    <span
                      style={{
                        padding: "4px 8px",
                        borderRadius: 6,
                        background: "#b0bec5",
                        color: "white",
                        marginTop: 8,
                        display: "inline-block",
                        fontSize: 12,
                      }}
                    >
                      Enrolled
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ===========================================================
          MINOR
      ============================================================ */}
      {activeSection === "minor" && minorReq && (
        <div>
          <h2>{minorReq.name} — Minor Requirements</h2>

          <div style={{ marginTop: 16 }}>
            {minorReq.requiredCourses.map((c) => {
              const bg = c.completed
                ? "#e8f5e8"
                : c.inProgress
                ? "#fafafa"
                : "#fff";
              const border = c.completed
                ? "#4caf50"
                : c.inProgress
                ? "#b0bec5"
                : "#ddd";

              return (
                <div
                  key={c.id}
                  style={{
                    padding: 16,
                    borderRadius: 8,
                    marginBottom: 10,
                    background: bg,
                    border: `1px solid ${border}`,
                  }}
                >
                  <div style={{ fontWeight: "bold" }}>
                    {c.subject} {c.courseNum} — {c.title}
                  </div>
                  <div style={{ fontSize: 13, color: "#666" }}>
                    {c.credits} credits
                  </div>

                  {c.completed && (
                    <span
                      style={{
                        padding: "4px 8px",
                        borderRadius: 6,
                        background: getGradeColor(c.grade),
                        color: "white",
                        display: "inline-block",
                        marginTop: 8,
                        fontSize: 12,
                      }}
                    >
                      {c.grade}
                    </span>
                  )}

                  {c.inProgress && (
                    <span
                      style={{
                        padding: "4px 8px",
                        borderRadius: 6,
                        background: "#b0bec5",
                        color: "white",
                        display: "inline-block",
                        marginTop: 8,
                        fontSize: 12,
                      }}
                    >
                      Enrolled
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ===========================================================
          GENERAL EDUCATION (SBC)
      ============================================================ */}
      {activeSection === "gened" && sbcRequirements && (
        <div>
          <h2>General Education — SBC Requirements</h2>

          <div style={{ marginTop: 16, display: "grid", gap: 16 }}>
            {sbcRequirements.sbcCategories.map((cat) => {
              const bg = cat.completed
                ? "#e8f5e8"
                : cat.inProgress
                ? "#fafafa"
                : "#fff";

              const border = cat.completed
                ? "#4caf50"
                : cat.inProgress
                ? "#b0bec5"
                : "#ddd";

              return (
                <div
                  key={cat.code}
                  style={{
                    padding: 20,
                    borderRadius: 10,
                    border: `1px solid ${border}`,
                    background: bg,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      marginBottom: 8,
                    }}
                  >
                    <h3 style={{ margin: 0 }}>{cat.code}</h3>

                    <span
                      style={{
                        padding: "4px 8px",
                        borderRadius: 6,
                        background: cat.completed
                          ? "#4caf50"
                          : cat.inProgress
                          ? "#ff9800"
                          : "#f44336",
                        color: "white",
                        fontSize: 12,
                        fontWeight: "bold",
                      }}
                    >
                      {cat.completed
                        ? "Satisfied"
                        : cat.inProgress
                        ? "In progress"
                        : "Not satisfied"}
                    </span>
                  </div>

                  {/* Completed courses */}
                  {cat.completedCourses.length > 0 && (
                    <div style={{ marginBottom: 8 }}>
                      <strong>Completed:</strong>
                      {cat.completedCourses.map((c, i) => (
                        <div
                          key={i}
                          style={{
                            padding: 8,
                            background: "white",
                            borderRadius: 6,
                            border: "1px solid #c8e6c9",
                            marginTop: 6,
                            fontSize: 13,
                          }}
                        >
                          {c.subject} {c.courseNum} — {c.title}
                          <span
                            style={{
                              padding: "3px 6px",
                              marginLeft: 8,
                              borderRadius: 6,
                              background: getGradeColor(c.grade),
                              color: "white",
                              fontSize: 12,
                            }}
                          >
                            {c.grade}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* In progress courses */}
                  {cat.inProgressCourses.length > 0 && (
                    <div>
                      <strong>In Progress:</strong>
                      {cat.inProgressCourses.map((c, i) => (
                        <div
                          key={i}
                          style={{
                            padding: 8,
                            background: "#f5f5f5",
                            border: "1px solid #cfd8dc",
                            borderRadius: 6,
                            marginTop: 6,
                            fontSize: 13,
                          }}
                        >
                          {c.subject} {c.courseNum} — {c.title}
                          <span
                            style={{
                              padding: "3px 6px",
                              marginLeft: 8,
                              borderRadius: 6,
                              background: "#b0bec5",
                              color: "white",
                              fontSize: 12,
                            }}
                          >
                            Enrolled
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Nothing here */}
                  {cat.completedCourses.length === 0 &&
                    cat.inProgressCourses.length === 0 && (
                      <div style={{ color: "#777", fontSize: 13 }}>
                        No courses applied yet.
                      </div>
                    )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
