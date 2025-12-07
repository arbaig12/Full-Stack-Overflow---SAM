// src/pages/DegreeRequirements.jsx
import React, { useEffect, useState } from "react";

export default function DegreeRequirements() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [degreeRequirements, setDegreeRequirements] = useState([]);
  const [selectedProgram, setSelectedProgram] = useState(null);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setError("");

        const res = await fetch("/api/degree/degree-requirements", {
          credentials: "include",
        });

        const data = await res.json();

        if (!res.ok || data.ok === false) {
          throw new Error(data.error || "Failed loading degree requirements.");
        }

        setDegreeRequirements(data.degreeRequirements || []);
      } catch (err) {
        console.error(err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  const handleViewDetails = async (programId) => {
    try {
      const res = await fetch(`/api/degree/degree-requirements/${programId}`, {
        credentials: "include",
      });

      const data = await res.json();

      if (!res.ok || data.ok === false) {
        throw new Error(data.error || "Failed loading program details.");
      }

      setSelectedProgram(data);
    } catch (err) {
      console.error(err);
      setError(err.message);
    }
  };

  const renderRequirementDetails = (req) => {
    if (!req) return null;

    const sections = [];

    // Required courses
    if (req.required_courses && Array.isArray(req.required_courses)) {
      sections.push(
        <div key="required" style={{ marginBottom: 20 }}>
          <h4 style={{ marginBottom: 8, color: "#1976d2" }}>Required Courses</h4>
          <ul style={{ marginLeft: 20 }}>
            {req.required_courses.map((course, idx) => (
              <li key={idx} style={{ marginBottom: 4 }}>
                {typeof course === 'string' ? course : `${course.subject || ''} ${course.courseNum || course.course_num || ''}`}
              </li>
            ))}
          </ul>
        </div>
      );
    }

    // Electives
    if (req.electives) {
      sections.push(
        <div key="electives" style={{ marginBottom: 20 }}>
          <h4 style={{ marginBottom: 8, color: "#1976d2" }}>Electives</h4>
          <div style={{ marginLeft: 20 }}>
            {req.electives.min_courses && (
              <p><strong>Minimum courses:</strong> {req.electives.min_courses}</p>
            )}
            {req.electives.from_subject && (
              <p><strong>From subject:</strong> {req.electives.from_subject}</p>
            )}
            {req.electives.min_level && (
              <p><strong>Minimum level:</strong> {req.electives.min_level}</p>
            )}
            {req.electives.exclude_courses && req.electives.exclude_courses.length > 0 && (
              <div>
                <strong>Excluded courses:</strong>
                <ul style={{ marginLeft: 20 }}>
                  {req.electives.exclude_courses.map((course, idx) => (
                    <li key={idx}>{course}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      );
    }

    // Other requirements (calculus, linear_algebra, natural_science, etc.)
    Object.keys(req).forEach((key) => {
      if (key !== 'required_courses' && key !== 'electives' && typeof req[key] === 'object' && req[key] !== null) {
        const requirement = req[key];
        const title = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        
        sections.push(
          <div key={key} style={{ marginBottom: 20 }}>
            <h4 style={{ marginBottom: 8, color: "#1976d2" }}>{title}</h4>
            <div style={{ marginLeft: 20 }}>
              {/* Show required count if present */}
              {requirement.required !== undefined && (
                <p style={{ marginBottom: 8 }}>
                  <strong>Required:</strong> {requirement.required}
                </p>
              )}
              
              {/* Show options (for courses like calculus, natural_science, etc.) */}
              {requirement.options && Array.isArray(requirement.options) && (
                <div style={{ marginBottom: 12 }}>
                  <strong>Options (choose one set):</strong>
                  <ul style={{ marginLeft: 20, marginTop: 8 }}>
                    {requirement.options.map((option, idx) => (
                      <li key={idx} style={{ marginBottom: 4 }}>
                        {Array.isArray(option) ? option.join(', ') : option}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              
              {/* Show required_sequence if present */}
              {requirement.required_sequence && Array.isArray(requirement.required_sequence) && (
                <div style={{ marginBottom: 12 }}>
                  <strong>Required Sequence:</strong>
                  <ul style={{ marginLeft: 20, marginTop: 8 }}>
                    {requirement.required_sequence.map((item, idx) => (
                      <li key={idx} style={{ marginBottom: 4 }}>
                        {Array.isArray(item) 
                          ? `Choose one: ${item.join(' or ')}`
                          : item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              
              {/* Show allowed_courses if present */}
              {requirement.allowed_courses && Array.isArray(requirement.allowed_courses) && (
                <div style={{ marginBottom: 12 }}>
                  <strong>Allowed Courses:</strong>
                  <ul style={{ marginLeft: 20, marginTop: 8 }}>
                    {requirement.allowed_courses.map((course, idx) => (
                      <li key={idx}>{course}</li>
                    ))}
                  </ul>
                </div>
              )}
              
              {/* Show min_credits if present */}
              {requirement.min_credits && (
                <p style={{ marginBottom: 8 }}>
                  <strong>Minimum Credits:</strong> {requirement.min_credits}
                </p>
              )}
              
              {/* For nested structures like natural_science_core */}
              {requirement.natural_science_core && (
                <div style={{ marginBottom: 12, paddingLeft: 12, borderLeft: '2px solid #ddd' }}>
                  <strong>Natural Science Core:</strong>
                  {requirement.natural_science_core.required && (
                    <p style={{ marginLeft: 12 }}>Required: {requirement.natural_science_core.required}</p>
                  )}
                  {requirement.natural_science_core.options && Array.isArray(requirement.natural_science_core.options) && (
                    <ul style={{ marginLeft: 32, marginTop: 4 }}>
                      {requirement.natural_science_core.options.map((option, idx) => (
                        <li key={idx}>{Array.isArray(option) ? option.join(', ') : option}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
              
              {requirement.natural_science_additional && (
                <div style={{ marginBottom: 12, paddingLeft: 12, borderLeft: '2px solid #ddd' }}>
                  <strong>Natural Science Additional:</strong>
                  {requirement.natural_science_additional.allowed_courses && Array.isArray(requirement.natural_science_additional.allowed_courses) && (
                    <ul style={{ marginLeft: 32, marginTop: 4 }}>
                      {requirement.natural_science_additional.allowed_courses.map((course, idx) => (
                        <li key={idx}>{course}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
              
              {/* Fallback: if none of the above match, show formatted JSON */}
              {!requirement.options && 
               !requirement.required_sequence && 
               !requirement.allowed_courses && 
               !requirement.min_credits &&
               !requirement.natural_science_core &&
               !requirement.natural_science_additional && (
                <pre style={{ 
                  background: '#f5f5f5', 
                  padding: 12, 
                  borderRadius: 6,
                  overflow: 'auto',
                  fontSize: 13
                }}>
                  {JSON.stringify(requirement, null, 2)}
                </pre>
              )}
            </div>
          </div>
        );
      }
    });

    return sections;
  };

  return (
    <div style={{ padding: 20 }}>
      <h1>Degree Requirements</h1>
      <p style={{ color: "#666", marginBottom: 24 }}>
        View all imported degree requirements in the system.
      </p>

      {/* Loading */}
      {loading && <p style={{ color: "#666" }}>Loading degree requirements...</p>}

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

      {/* Main Content */}
      {!loading && !error && (
        <div style={{ display: "flex", gap: 24 }}>
          {/* Left: List of Programs */}
          <div style={{ flex: "0 0 350px" }}>
            <h2 style={{ marginBottom: 16 }}>Programs ({degreeRequirements.length})</h2>
            {degreeRequirements.length === 0 ? (
              <p style={{ color: "#666" }}>No degree requirements imported yet.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {degreeRequirements.map((prog) => {
                  const term = prog.effectiveTerm;
                  const termStr = term
                    ? `${term.semester || ''} ${term.year || ''}`.trim()
                    : 'N/A';

                  return (
                    <div
                      key={prog.id}
                      onClick={() => handleViewDetails(prog.id)}
                      style={{
                        padding: 16,
                        borderRadius: 8,
                        border: selectedProgram?.id === prog.id
                          ? "2px solid #1976d2"
                          : "1px solid #ddd",
                        background: selectedProgram?.id === prog.id ? "#e3f2fd" : "#fff",
                        cursor: "pointer",
                        transition: "all 0.2s",
                      }}
                    >
                      <div style={{ fontWeight: "bold", fontSize: 16 }}>
                        {prog.subject} {prog.degreeType}
                      </div>
                      <div style={{ fontSize: 13, color: "#666", marginTop: 4 }}>
                        {prog.programType === "major" ? "Major" : "Minor"}
                      </div>
                      <div style={{ fontSize: 12, color: "#999", marginTop: 4 }}>
                        Effective: {termStr}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right: Details */}
          <div style={{ flex: 1 }}>
            {selectedProgram ? (
              <div>
                <h2 style={{ marginBottom: 16 }}>
                  {selectedProgram.subject} {selectedProgram.degreeType} - Details
                </h2>

                <div
                  style={{
                    padding: 24,
                    background: "#fff",
                    borderRadius: 12,
                    border: "1px solid #ddd",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
                  }}
                >
                  {/* Basic Info */}
                  <div style={{ marginBottom: 24, paddingBottom: 16, borderBottom: "1px solid #eee" }}>
                    <h3 style={{ marginBottom: 12 }}>Program Information</h3>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
                      <div>
                        <strong>Subject:</strong> {selectedProgram.subject}
                      </div>
                      <div>
                        <strong>Degree Type:</strong> {selectedProgram.degreeType}
                      </div>
                      <div>
                        <strong>Program Type:</strong> {selectedProgram.programType === "major" ? "Major" : "Minor"}
                      </div>
                      <div>
                        <strong>Effective Term:</strong>{" "}
                        {selectedProgram.effectiveTerm
                          ? `${selectedProgram.effectiveTerm.semester || ''} ${selectedProgram.effectiveTerm.year || ''}`.trim()
                          : "N/A"}
                      </div>
                    </div>
                  </div>

                  {/* Admission Requirements */}
                  {selectedProgram.admissionRequirements && (
                    <div style={{ marginBottom: 24 }}>
                      <h3 style={{ marginBottom: 12 }}>Admission Requirements</h3>
                      <div style={{ marginLeft: 20 }}>
                        {selectedProgram.admissionRequirements.min_gpa && (
                          <p>
                            <strong>Minimum GPA:</strong> {selectedProgram.admissionRequirements.min_gpa}
                          </p>
                        )}
                        {selectedProgram.admissionRequirements.required_courses &&
                          Array.isArray(selectedProgram.admissionRequirements.required_courses) && (
                            <div>
                              <strong>Required Courses:</strong>
                              <ul style={{ marginLeft: 20 }}>
                                {selectedProgram.admissionRequirements.required_courses.map((course, idx) => (
                                  <li key={idx}>{course}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                      </div>
                    </div>
                  )}

                  {/* Degree Requirements */}
                  {selectedProgram.degreeRequirements && (
                    <div>
                      <h3 style={{ marginBottom: 12 }}>Degree Requirements</h3>
                      {renderRequirementDetails(selectedProgram.degreeRequirements)}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div
                style={{
                  padding: 40,
                  textAlign: "center",
                  color: "#999",
                  background: "#f5f5f5",
                  borderRadius: 12,
                  border: "1px solid #ddd",
                }}
              >
                <p>Select a program from the list to view details</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

