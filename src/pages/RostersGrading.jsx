// src/pages/RostersGrading.jsx
import React, { useEffect, useState } from "react";

export default function RostersGrading() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [courses, setCourses] = useState([]);
  const [currentTerm, setCurrentTerm] = useState(null);
  const [selectedClassId, setSelectedClassId] = useState(null);

  const [editingStudentId, setEditingStudentId] = useState(null);
  const [gradeInput, setGradeInput] = useState("");

  // Capacity override state (for registrars)
  const [userRole, setUserRole] = useState(null);
  const [capacityOverrideStudentSearch, setCapacityOverrideStudentSearch] = useState("");
  const [capacityOverrideStudents, setCapacityOverrideStudents] = useState([]);
  const [selectedOverrideStudent, setSelectedOverrideStudent] = useState(null);
  const [capacityOverrideClasses, setCapacityOverrideClasses] = useState([]);
  const [selectedOverrideClassId, setSelectedOverrideClassId] = useState(null);
  const [capacityOverrideLoading, setCapacityOverrideLoading] = useState(false);

  /* ---------------------- HELPERS ---------------------- */

  const validGrades = [
    "A", "A-", "B+", "B", "B-",
    "C+", "C", "C-",
    "D+", "D", "D-",
    "F", "P", "NP", "I", "IP",
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

  // Fetch user role
  useEffect(() => {
    async function fetchUserRole() {
      try {
        const res = await fetch("/api/dashboard", {
          credentials: "include",
        });
        if (res.ok) {
          const data = await res.json();
          if (data.role) {
            setUserRole(data.role.toLowerCase());
          }
        }
      } catch (err) {
        console.error("Error fetching user role:", err);
      }
    }
    fetchUserRole();
  }, []);

  // Load classes for capacity override
  useEffect(() => {
    async function loadClassesForOverride() {
      if (userRole !== "registrar") return;

      try {
        const res = await fetch("/api/schedule/sections", {
          credentials: "include",
        });
        if (res.ok) {
          const data = await res.json();
          if (data.ok !== false && data.sections) {
            const classes = data.sections.map((sec) => ({
              classId: sec.classId,
              courseCode: sec.courseCode,
              sectionNum: sec.sectionNumber,
              title: sec.title,
              termLabel: sec.termLabel || `${sec.term?.semester} ${sec.term?.year}`,
            }));
            setCapacityOverrideClasses(classes);
          }
        }
      } catch (err) {
        console.error("Error loading classes for override:", err);
      }
    }
    loadClassesForOverride();
  }, [userRole]);

  // Search students for capacity override
  useEffect(() => {
    async function searchStudents() {
      if (!capacityOverrideStudentSearch.trim() || capacityOverrideStudentSearch.length < 2) {
        setCapacityOverrideStudents([]);
        return;
      }

      try {
        const res = await fetch(
          `/api/user-management/search?name=${encodeURIComponent(capacityOverrideStudentSearch)}&role=student`,
          { credentials: "include" }
        );
        if (res.ok) {
          const data = await res.json();
          if (data.ok !== false && data.users) {
            setCapacityOverrideStudents(data.users.slice(0, 10)); // Limit to 10 results
          }
        }
      } catch (err) {
        console.error("Error searching students:", err);
      }
    }

    const timeoutId = setTimeout(searchStudents, 300);
    return () => clearTimeout(timeoutId);
  }, [capacityOverrideStudentSearch]);

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

    setEditingStudentId(student.studentId);
    setGradeInput(currentGrade || "");
  };

  const handleGradeCancel = () => {
    setEditingStudentId(null);
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
            studentId: student.studentId,
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
              s.studentId === student.studentId
                ? { ...s, grade: trimmed }
                : s
            ),
          };
        })
      );

      setEditingStudentId(null);
      setGradeInput("");
      setMessage(
        `Grade updated successfully for ${student.name} to ${trimmed}.`
      );
    } catch (err) {
      console.error(err);
      setMessage(err.message || "Failed to update grade.");
    }
  };

  /* ---------------------- CAPACITY OVERRIDE HANDLERS ---------------------- */

  const handleGrantCapacityOverride = async () => {
    if (!selectedOverrideStudent || !selectedOverrideClassId) {
      setMessage("Please select both a student and a class.");
      return;
    }

    try {
      setCapacityOverrideLoading(true);
      setMessage("");

      const res = await fetch("/api/registration/capacity-override", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          studentId: selectedOverrideStudent.user_id || selectedOverrideStudent.userId,
          classId: selectedOverrideClassId,
        }),
      });

      const data = await res.json();
      if (!res.ok || data.ok === false) {
        throw new Error(data.error || "Failed to grant capacity override.");
      }

      setMessage(
        `Capacity override granted successfully. ${selectedOverrideStudent.first_name} ${selectedOverrideStudent.last_name} can now register for the selected class even if it's full.`
      );
      setSelectedOverrideStudent(null);
      setSelectedOverrideClassId(null);
      setCapacityOverrideStudentSearch("");
    } catch (err) {
      console.error(err);
      setMessage(err.message || "Failed to grant capacity override.");
    } finally {
      setCapacityOverrideLoading(false);
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

      {/* Capacity Override Section (Registrars only) */}
      {userRole === "registrar" && (
        <div
          style={{
            marginBottom: 32,
            padding: 20,
            borderRadius: 12,
            background: "#fff",
            border: "2px solid #1976d2",
            boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
          }}
        >
          <h2 style={{ margin: "0 0 16px 0", color: "#1976d2" }}>
            Grant Capacity Override
          </h2>
          <p style={{ marginBottom: 16, color: "#666", fontSize: 14 }}>
            Allow a student to register for a class even if it's full. This
            overrides the class capacity restriction.
          </p>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
              gap: 16,
              marginBottom: 16,
            }}
          >
            <div>
              <label
                style={{
                  display: "block",
                  marginBottom: 8,
                  fontWeight: "bold",
                  fontSize: 14,
                }}
              >
                Search Student:
              </label>
              <input
                type="text"
                value={capacityOverrideStudentSearch}
                onChange={(e) => setCapacityOverrideStudentSearch(e.target.value)}
                placeholder="Search by name, email, or ID..."
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  border: "1px solid #ddd",
                  borderRadius: 6,
                  fontSize: 14,
                }}
              />
              {capacityOverrideStudents.length > 0 && (
                <div
                  style={{
                    marginTop: 4,
                    border: "1px solid #ddd",
                    borderRadius: 6,
                    background: "#fff",
                    maxHeight: 200,
                    overflowY: "auto",
                    boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
                  }}
                >
                  {capacityOverrideStudents.map((student) => (
                    <div
                      key={student.user_id || student.userId}
                      onClick={() => {
                        setSelectedOverrideStudent(student);
                        setCapacityOverrideStudentSearch(
                          `${student.first_name} ${student.last_name} (${student.email})`
                        );
                        setCapacityOverrideStudents([]);
                      }}
                      style={{
                        padding: "8px 12px",
                        cursor: "pointer",
                        borderBottom: "1px solid #f0f0f0",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "#f5f5f5";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "#fff";
                      }}
                    >
                      <div style={{ fontWeight: "bold" }}>
                        {student.first_name} {student.last_name}
                      </div>
                      <div style={{ fontSize: 12, color: "#666" }}>
                        {student.email}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label
                style={{
                  display: "block",
                  marginBottom: 8,
                  fontWeight: "bold",
                  fontSize: 14,
                }}
              >
                Select Class:
              </label>
              <select
                value={selectedOverrideClassId || ""}
                onChange={(e) =>
                  setSelectedOverrideClassId(
                    e.target.value ? Number(e.target.value) : null
                  )
                }
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  border: "1px solid #ddd",
                  borderRadius: 6,
                  fontSize: 14,
                }}
              >
                <option value="">-- Select a class --</option>
                {capacityOverrideClasses.map((cls) => (
                  <option key={cls.classId} value={cls.classId}>
                    {cls.courseCode}-{cls.sectionNum} – {cls.title} ({cls.termLabel})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <button
            onClick={handleGrantCapacityOverride}
            disabled={!selectedOverrideStudent || !selectedOverrideClassId || capacityOverrideLoading}
            style={{
              padding: "10px 20px",
              border: "none",
              borderRadius: 6,
              background:
                !selectedOverrideStudent || !selectedOverrideClassId || capacityOverrideLoading
                  ? "#ccc"
                  : "#1976d2",
              color: "white",
              fontWeight: "bold",
              cursor:
                !selectedOverrideStudent || !selectedOverrideClassId || capacityOverrideLoading
                  ? "not-allowed"
                  : "pointer",
              fontSize: 14,
            }}
          >
            {capacityOverrideLoading ? "Granting..." : "Grant Capacity Override"}
          </button>
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
                setEditingStudentId(null);
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
                          editingStudentId === student.studentId;
                        const currentGrade = student.grade
                          ? String(student.grade).toUpperCase()
                          : "";

                        const canEdit =
                          selectedCourse.isCurrent &&
                          (!currentGrade || currentGrade === "I");

                        return (
                          <tr
                            key={student.studentId}
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
