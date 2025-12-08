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

        const res = await fetch("/api/degree/degree-requirements", { credentials: "include" });

        let data;
        try {
          data = await res.json();
        } catch {
          const txt = await res.text().catch(() => "");
          throw new Error(txt && txt.includes("<!DOCTYPE") ? "Backend returned HTML (route missing). Check server route." : "Invalid JSON response.");
        }

        if (!res.ok || data.ok === false) {
          throw new Error(data.error || "Failed loading degree requirements.");
        }

        setDegreeRequirements(Array.isArray(data.degreeRequirements) ? data.degreeRequirements : []);
      } catch (err) {
        console.error(err);
        setError(err.message || "Failed loading degree requirements.");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  const handleViewDetails = async (id) => {
    try {
      setError("");
      const res = await fetch(`/api/degree/degree-requirements/${id}`, { credentials: "include" });

      let data;
      try {
        data = await res.json();
      } catch {
        const txt = await res.text().catch(() => "");
        throw new Error(txt && txt.includes("<!DOCTYPE") ? "Backend returned HTML (route missing). Check server route." : "Invalid JSON response.");
      }

      if (!res.ok || data.ok === false) {
        throw new Error(data.error || "Failed loading program details.");
      }

      setSelectedProgram(data);
    } catch (err) {
      console.error(err);
      setError(err.message || "Failed loading program details.");
    }
  };

  const renderRequirementDetails = (req) => {
    if (!req || typeof req !== "object") return null;

    const sections = [];

    if (req.required_courses && Array.isArray(req.required_courses)) {
      sections.push(
        <div key="required" style={{ marginBottom: 20 }}>
          <h4 style={{ marginBottom: 8, color: "#1976d2" }}>Required Courses</h4>
          <ul style={{ marginLeft: 20 }}>
            {req.required_courses.map((course, idx) => {
              const text =
                typeof course === "string"
                  ? course
                  : `${course.subject ?? ""} ${course.courseNum ?? course.course_num ?? ""}`.trim();
              return (
                <li key={idx} style={{ marginBottom: 4 }}>
                  {text || "Course"}
                </li>
              );
            })}
          </ul>
        </div>
      );
    }

    if (req.electives && typeof req.electives === "object") {
      sections.push(
        <div key="electives" style={{ marginBottom: 20 }}>
          <h4 style={{ marginBottom: 8, color: "#1976d2" }}>Electives</h4>
          <div style={{ marginLeft: 20 }}>
            {req.electives.min_courses != null ? (
              <p>
                <strong>Minimum courses:</strong> {req.electives.min_courses}
              </p>
            ) : null}
            {req.electives.from_subject ? (
              <p>
                <strong>From subject:</strong> {req.electives.from_subject}
              </p>
            ) : null}
            {req.electives.min_level != null ? (
              <p>
                <strong>Minimum level:</strong> {req.electives.min_level}
              </p>
            ) : null}
            {Array.isArray(req.electives.exclude_courses) && req.electives.exclude_courses.length > 0 ? (
              <div>
                <strong>Excluded courses:</strong>
                <ul style={{ marginLeft: 20 }}>
                  {req.electives.exclude_courses.map((course, idx) => (
                    <li key={idx}>{course}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </div>
      );
    }

    Object.keys(req).forEach((key) => {
      if (key === "required_courses" || key === "electives") return;
      const val = req[key];
      if (!val || typeof val !== "object") return;

      const title = key.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
      const requirement = val;

      const hasSpecial =
        requirement.required != null ||
        Array.isArray(requirement.options) ||
        Array.isArray(requirement.required_sequence) ||
        Array.isArray(requirement.allowed_courses) ||
        requirement.min_credits != null ||
        requirement.natural_science_core != null ||
        requirement.natural_science_additional != null;

      sections.push(
        <div key={key} style={{ marginBottom: 20 }}>
          <h4 style={{ marginBottom: 8, color: "#1976d2" }}>{title}</h4>
          <div style={{ marginLeft: 20 }}>
            {requirement.required != null ? (
              <p style={{ marginBottom: 8 }}>
                <strong>Required:</strong> {requirement.required}
              </p>
            ) : null}

            {Array.isArray(requirement.options) ? (
              <div style={{ marginBottom: 12 }}>
                <strong>Options (choose one set):</strong>
                <ul style={{ marginLeft: 20, marginTop: 8 }}>
                  {requirement.options.map((option, idx) => (
                    <li key={idx} style={{ marginBottom: 4 }}>
                      {Array.isArray(option) ? option.join(", ") : String(option)}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {Array.isArray(requirement.required_sequence) ? (
              <div style={{ marginBottom: 12 }}>
                <strong>Required Sequence:</strong>
                <ul style={{ marginLeft: 20, marginTop: 8 }}>
                  {requirement.required_sequence.map((item, idx) => (
                    <li key={idx} style={{ marginBottom: 4 }}>
                      {Array.isArray(item) ? `Choose one: ${item.join(" or ")}` : String(item)}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {Array.isArray(requirement.allowed_courses) ? (
              <div style={{ marginBottom: 12 }}>
                <strong>Allowed Courses:</strong>
                <ul style={{ marginLeft: 20, marginTop: 8 }}>
                  {requirement.allowed_courses.map((course, idx) => (
                    <li key={idx}>{course}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {requirement.min_credits != null ? (
              <p style={{ marginBottom: 8 }}>
                <strong>Minimum Credits:</strong> {requirement.min_credits}
              </p>
            ) : null}

            {requirement.natural_science_core ? (
              <div style={{ marginBottom: 12, paddingLeft: 12, borderLeft: "2px solid #ddd" }}>
                <strong>Natural Science Core:</strong>
                {requirement.natural_science_core.required != null ? (
                  <p style={{ marginLeft: 12 }}>Required: {requirement.natural_science_core.required}</p>
                ) : null}
                {Array.isArray(requirement.natural_science_core.options) ? (
                  <ul style={{ marginLeft: 32, marginTop: 4 }}>
                    {requirement.natural_science_core.options.map((option, idx) => (
                      <li key={idx}>{Array.isArray(option) ? option.join(", ") : String(option)}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}

            {requirement.natural_science_additional ? (
              <div style={{ marginBottom: 12, paddingLeft: 12, borderLeft: "2px solid #ddd" }}>
                <strong>Natural Science Additional:</strong>
                {Array.isArray(requirement.natural_science_additional.allowed_courses) ? (
                  <ul style={{ marginLeft: 32, marginTop: 4 }}>
                    {requirement.natural_science_additional.allowed_courses.map((course, idx) => (
                      <li key={idx}>{course}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}

            {!hasSpecial ? (
              <pre
                style={{
                  background: "#f5f5f5",
                  padding: 12,
                  borderRadius: 6,
                  overflow: "auto",
                  fontSize: 13,
                }}
              >
                {JSON.stringify(requirement, null, 2)}
              </pre>
            ) : null}
          </div>
        </div>
      );
    });

    return sections;
  };

  return (
    <div style={{ padding: 20 }}>
      <h1>Degree Requirements</h1>
      <p style={{ color: "#666", marginBottom: 24 }}>View all imported degree requirements in the system.</p>

      {loading ? <p style={{ color: "#666" }}>Loading degree requirements...</p> : null}

      {error ? (
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
      ) : null}

      {!loading && !error ? (
        <div style={{ display: "flex", gap: 24 }}>
          <div style={{ flex: "0 0 350px" }}>
            <h2 style={{ marginBottom: 16 }}>Programs ({degreeRequirements.length})</h2>

            {degreeRequirements.length === 0 ? (
              <p style={{ color: "#666" }}>No degree requirements imported yet.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {degreeRequirements.map((prog) => {
                  const term = prog.effectiveTerm;
                  const termStr = term ? `${term.semester || ""} ${term.year || ""}`.trim() : "N/A";

                  return (
                    <div
                      key={prog.id}
                      onClick={() => handleViewDetails(prog.id)}
                      style={{
                        padding: 16,
                        borderRadius: 8,
                        border: selectedProgram?.id === prog.id ? "2px solid #1976d2" : "1px solid #ddd",
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
                      <div style={{ fontSize: 12, color: "#999", marginTop: 4 }}>Effective: {termStr}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

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
                          ? `${selectedProgram.effectiveTerm.semester || ""} ${selectedProgram.effectiveTerm.year || ""}`.trim()
                          : "N/A"}
                      </div>
                    </div>
                  </div>

                  {selectedProgram.admissionRequirements ? (
                    <div style={{ marginBottom: 24 }}>
                      <h3 style={{ marginBottom: 12 }}>Admission Requirements</h3>
                      <div style={{ marginLeft: 20 }}>
                        {selectedProgram.admissionRequirements.min_gpa != null ? (
                          <p>
                            <strong>Minimum GPA:</strong> {selectedProgram.admissionRequirements.min_gpa}
                          </p>
                        ) : null}
                        {Array.isArray(selectedProgram.admissionRequirements.required_courses) ? (
                          <div>
                            <strong>Required Courses:</strong>
                            <ul style={{ marginLeft: 20 }}>
                              {selectedProgram.admissionRequirements.required_courses.map((course, idx) => (
                                <li key={idx}>{course}</li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ) : null}

                  {selectedProgram.degreeRequirements ? (
                    <div>
                      <h3 style={{ marginBottom: 12 }}>Degree Requirements</h3>
                      {renderRequirementDetails(selectedProgram.degreeRequirements)}
                    </div>
                  ) : null}
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
      ) : null}
    </div>
  );
}
