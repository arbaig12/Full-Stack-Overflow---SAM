// src/pages/RostersGrading.jsx
import React, { useEffect, useState } from "react";

export default function RostersGrading() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [courses, setCourses] = useState([]);
  const [currentTerm, setCurrentTerm] = useState(null);
  const [selectedClassId, setSelectedClassId] = useState(null);

  const [editingEnrollmentId, setEditingEnrollmentId] = useState(null);
  const [gradeInput, setGradeInput] = useState("");

  /* ---------------------- HELPERS ---------------------- */

  const validGrades = [
    "A", "A-", "B+", "B", "B-",
    "C+", "C", "C-",
    "D+", "D", "D-",
    "F", "P", "NP",
  ];

  const getGradeColor = (grade) => {
    if (!grade) return "#666";
    if (grade.startsWith("A")) return "#4caf50";
    if (grade.startsWith("B")) return "#2196f3";
    if (grade.startsWith("C")) return "#ff9800";
    if (grade.startsWith("D")) return "#ff5722";
    if (grade === "F") return "#f44336";
    return "#666";
  };

  const selectedCourse = courses.find((c) => c.classId === selectedClassId) || null;

  /* ---------------------- LOAD DATA ---------------------- */
  useEffect(() => {
    async function loadRosters() {
      try {
        setLoading(true);
        setError("");
        setMessage("");

        const res = await fetch("/api/instructor/rosters", {
          credentials: "include",
        });

        const data = await res.json();

        if (!res.ok || data.ok === false) {
          throw new Error(data.error || "Failed to load rosters.");
        }

        setCourses(data.courses || []);
        setCurrentTerm(data.currentTerm || null);

        if (data.courses && data.courses.length > 0) {
          setSelectedClassId(data.courses[0].classId);
        }
      } catch (err) {
        console.error(err);
        setError(err.message || "Failed to load rosters.");
      } finally {
        setLoading(false);
      }
    }

    loadRosters();
  }, []);

  /* ---------------------- GRADE EDIT HANDLERS ---------------------- */

  const handleGradeEdit = (course, student) => {
    setMessage("");

    if (!course.isCurrent) {
      setMessage("Grades can only be edited for classes in the current term.");
      return;
    }

    const currentGrade = student.grade ? String(student.grade).toUpperCase() : null;
    if (currentGrade && currentGrade !== "I") {
      setMessage("Grade changes are only allowed for Incompletes (I).");
      return;
    }

    setEditingEnrollmentId(student.enrollmentId);
    setGradeInput(currentGrade || "");
  };

  const handleGradeCancel = () => {
    setEditingEnrollmentId(null);
    setGradeInput("");
  };

  const handleGradeSave = async (course, student) => {
    const trimmed = (gradeInput || "").trim().toUpperCase();

    if (!validGrades.includes(trimmed)) {
      setMessage(
        "Invalid grade. Must be one of: " + validGrades.join(", ")
      );
      return;
    }

    try {
      setMessage("");

      const res = await fetch(
        `/api/instructor/rosters/${course.classId}/grade`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            enrollmentId: student.enrollmentId,
            newGrade: trimmed,
          }),
        }
      );

      const data = await res.json();
      if (!res.ok || data.ok === false) {
        throw new Error(data.error || "Failed to update grade.");
      }

      // Update local state
      setCourses((prev) =>
        prev.map((c) => {
          if (c.classId !== course.classId) return c;
          return {
            ...c,
            students: c.students.map((s) =>
              s.enrollmentId === student.enrollmentId
                ? { ...s, grade: trimmed }
                : s
            ),
          };
        })
      );

      setEditingEnrollmentId(null);
      setGradeInput("");
      setMessage(
        `Grade updated successfully for ${student.name} to ${trimmed}.`
      );
    } catch (err) {
      console.error(err);
      setMessage(err.message || "Failed to update grade.");
    }
  };

  /* ---------------------- RENDER ---------------------- */

  return (
    <div style={{ padding: 20 }}>
      <h1>Rosters &amp; Grading</h1>

      {loading && (
        <p style={{ color: "#666" }}>Loading rosters...</p>
      )}

      {error && (
        <div
          style={{
            padding: 12,
            marginBottom: 16,
            borderRadius: 6,
            background: "#f8d7da",
            color: "#721c24",
            border: "1px solid #f5c6cb",
          }}
        >
          {error}
        </div>
      )}

      {message && (
        <div
          style={{
            padding: 12,
            marginBottom: 16,
            borderRadius: 6,
            background: message.toLowerCase().includes("success")
              ? "#d4edda"
              : "#f8d7da",
            color: message.toLowerCase().includes("success")
              ? "#155724"
              : "#721c24",
            border: message.toLowerCase().includes("success")
              ? "1px solid #c3e6cb"
              : "1px solid #f5c6cb",
          }}
        >
          {message}
        </div>
      )}

      {/* No courses */}
      {!loading && !error && courses.length === 0 && (
        <p style={{ color: "#666" }}>
          You are not assigned to any class sections.
        </p>
      )}

      {courses.length > 0 && (
        <>
          {/* Current term info (if available) */}
          {currentTerm && (
            <div
              style={{
                marginBottom: 16,
                padding: 12,
                borderRadius: 8,
                background: "#f3f6ff",
                border: "1px solid #c5cae9",
                fontSize: 14,
              }}
            >
              <strong>Current Term:</strong>{" "}
              {currentTerm.termCode || "(unknown)"}{" "}
              {currentTerm.startDate && currentTerm.endDate && (
                <>
                  &mdash;{" "}
                  <span style={{ color: "#555" }}>
                    {new Date(currentTerm.startDate).toLocaleDateString()} -{" "}
                    {new Date(currentTerm.endDate).toLocaleDateString()}
                  </span>
                </>
              )}
            </div>
          )}

          {/* Course selection */}
          <div style={{ marginBottom: 24 }}>
            <label
              style={{
                display: "block",
                marginBottom: 8,
                fontWeight: "bold",
              }}
            >
              Select Course:
            </label>
            <select
              value={selectedClassId ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                setSelectedClassId(v ? Number(v) : null);
                setEditingEnrollmentId(null);
                setGradeInput("");
                setMessage("");
              }}
              style={{
                padding: "8px 12px",
                border: "1px solid #ddd",
                borderRadius: 6,
                fontSize: 14,
                minWidth: 320,
              }}
            >
              {courses.map((c) => (
                <option key={c.classId} value={c.classId}>
                  {c.subject} {c.courseNum}.{c.sectionNum} – {c.title} (
                  {c.termCode}
                  {c.isCurrent ? ", Current" : ""})
                </option>
              ))}
            </select>
          </div>

          {/* Selected course details + roster */}
          {selectedCourse && (
            <>
              {/* Course Info */}
              <div
                style={{
                  padding: 20,
                  borderRadius: 12,
                  background: "#f8f9fa",
                  border: "1px solid #e0e0e0",
                  marginBottom: 24,
                }}
              >
                <h2 style={{ margin: "0 0 8px 0" }}>
                  {selectedCourse.subject} {selectedCourse.courseNum}.
                  {selectedCourse.sectionNum} – {selectedCourse.title}
                </h2>
                <div style={{ color: "#666", fontSize: 14 }}>
                  <strong>Term:</strong> {selectedCourse.termCode}{" "}
                  {selectedCourse.isCurrent && (
                    <span
                      style={{
                        marginLeft: 8,
                        padding: "2px 8px",
                        borderRadius: 10,
                        background: "#e3f2fd",
                        color: "#1976d2",
                        fontSize: 11,
                        fontWeight: "bold",
                      }}
                    >
                      Current Term
                    </span>
                  )}
                  {" | "}
                  <strong>Students:</strong>{" "}
                  {selectedCourse.students.length}
                </div>
                {!selectedCourse.isCurrent && (
                  <div
                    style={{
                      marginTop: 6,
                      fontSize: 12,
                      color: "#b71c1c",
                    }}
                  >
                    Grades in past terms are read-only.
                  </div>
                )}
              </div>

              {/* Roster Table */}
              <div
                style={{
                  background: "#fff",
                  borderRadius: 12,
                  border: "1px solid #e0e0e0",
                  overflow: "hidden",
                  boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
                }}
              >
                <div
                  style={{
                    padding: 16,
                    background: "#f8f9fa",
                    borderBottom: "1px solid #e0e0e0",
                    fontWeight: "bold",
                  }}
                >
                  Student Roster ({selectedCourse.students.length}{" "}
                  students)
                </div>

                <div style={{ overflowX: "auto" }}>
                  <table
                    style={{ width: "100%", borderCollapse: "collapse" }}
                  >
                    <thead>
                      <tr style={{ background: "#f8f9fa" }}>
                        <th
                          style={{
                            padding: 12,
                            textAlign: "left",
                            borderBottom: "1px solid #e0e0e0",
                          }}
                        >
                          Student ID
                        </th>
                        <th
                          style={{
                            padding: 12,
                            textAlign: "left",
                            borderBottom: "1px solid #e0e0e0",
                          }}
                        >
                          Name
                        </th>
                        <th
                          style={{
                            padding: 12,
                            textAlign: "left",
                            borderBottom: "1px solid #e0e0e0",
                          }}
                        >
                          Email
                        </th>
                        <th
                          style={{
                            padding: 12,
                            textAlign: "center",
                            borderBottom: "1px solid #e0e0e0",
                          }}
                        >
                          Grade
                        </th>
                        <th
                          style={{
                            padding: 12,
                            textAlign: "center",
                            borderBottom: "1px solid #e0e0e0",
                          }}
                        >
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedCourse.students.map((student, idx) => {
                        const isRowEditing =
                          editingEnrollmentId === student.enrollmentId;
                        const currentGrade = student.grade
                          ? String(student.grade).toUpperCase()
                          : "";

                        const canEdit =
                          selectedCourse.isCurrent &&
                          (!currentGrade || currentGrade === "I");

                        return (
                          <tr
                            key={student.enrollmentId}
                            style={{
                              background:
                                idx % 2 === 0 ? "#fff" : "#f9f9f9",
                            }}
                          >
                            <td
                              style={{
                                padding: 12,
                                borderBottom:
                                  "1px solid #e0e0e0",
                              }}
                            >
                              {student.studentId}
                            </td>
                            <td
                              style={{
                                padding: 12,
                                borderBottom:
                                  "1px solid #e0e0e0",
                              }}
                            >
                              {student.name}
                            </td>
                            <td
                              style={{
                                padding: 12,
                                borderBottom:
                                  "1px solid #e0e0e0",
                              }}
                            >
                              {student.email}
                            </td>
                            <td
                              style={{
                                padding: 12,
                                textAlign: "center",
                                borderBottom:
                                  "1px solid #e0e0e0",
                              }}
                            >
                              {isRowEditing ? (
                                <input
                                  type="text"
                                  value={gradeInput}
                                  onChange={(e) =>
                                    setGradeInput(e.target.value)
                                  }
                                  style={{
                                    width: 60,
                                    padding: "4px 8px",
                                    border: "1px solid #ddd",
                                    borderRadius: 4,
                                    textAlign: "center",
                                  }}
                                  placeholder="A"
                                />
                              ) : (
                                <span
                                  style={{
                                    padding: "4px 8px",
                                    borderRadius: 4,
                                    background: getGradeColor(
                                      currentGrade
                                    ),
                                    color: "white",
                                    fontWeight: "bold",
                                    fontSize: 12,
                                  }}
                                >
                                  {currentGrade || "N/A"}
                                </span>
                              )}
                            </td>
                            <td
                              style={{
                                padding: 12,
                                textAlign: "center",
                                borderBottom:
                                  "1px solid #e0e0e0",
                              }}
                            >
                              {isRowEditing ? (
                                <div
                                  style={{
                                    display: "flex",
                                    gap: 4,
                                    justifyContent: "center",
                                  }}
                                >
                                  <button
                                    onClick={() =>
                                      handleGradeSave(
                                        selectedCourse,
                                        student
                                      )
                                    }
                                    style={{
                                      padding: "4px 8px",
                                      border: "none",
                                      borderRadius: 4,
                                      background: "#28a745",
                                      color: "white",
                                      fontSize: 12,
                                      cursor: "pointer",
                                    }}
                                  >
                                    Save
                                  </button>
                                  <button
                                    onClick={handleGradeCancel}
                                    style={{
                                      padding: "4px 8px",
                                      border: "none",
                                      borderRadius: 4,
                                      background: "#6c757d",
                                      color: "white",
                                      fontSize: 12,
                                      cursor: "pointer",
                                    }}
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() =>
                                    canEdit
                                      ? handleGradeEdit(
                                          selectedCourse,
                                          student
                                        )
                                      : setMessage(
                                          selectedCourse.isCurrent
                                            ? "Grade changes are only allowed for Incompletes (I)."
                                            : "Grades in past terms are read-only."
                                        )
                                  }
                                  disabled={!canEdit}
                                  style={{
                                    padding: "4px 8px",
                                    border: "none",
                                    borderRadius: 4,
                                    background: canEdit
                                      ? "#007bff"
                                      : "#ccc",
                                    color: "white",
                                    fontSize: 12,
                                    cursor: canEdit
                                      ? "pointer"
                                      : "not-allowed",
                                  }}
                                >
                                  {canEdit ? "Edit Grade" : "Locked"}
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
