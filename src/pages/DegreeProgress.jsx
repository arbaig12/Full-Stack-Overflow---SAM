import React, { useEffect, useMemo, useState } from "react";

export default function DegreeProgress() {
  const [activeSection, setActiveSection] = useState("overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [overview, setOverview] = useState(null);
  const [sbcRequirements, setSbcRequirements] = useState(null);

  const [majorReqs, setMajorReqs] = useState([]);
  const [minorReqs, setMinorReqs] = useState([]);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setError("");

        const res = await fetch("/api/degree/progress", { credentials: "include" });
        const data = await res.json().catch(() => ({}));

        if (!res.ok || data.ok === false) {
          throw new Error(data.error || "Failed loading degree progress.");
        }

        setOverview(data.overview ?? null);
        setSbcRequirements(data.sbcRequirements ?? null);

        const majors = Array.isArray(data.majorRequirements)
          ? data.majorRequirements
          : data.majorRequirements
          ? [data.majorRequirements]
          : [];

        const minors = Array.isArray(data.minorRequirements)
          ? data.minorRequirements
          : data.minorRequirements
          ? [data.minorRequirements]
          : [];

        setMajorReqs(majors.filter(Boolean));
        setMinorReqs(minors.filter(Boolean));
      } catch (e) {
        console.error(e);
        setError(e.message || "Failed loading degree progress.");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  const calculateProgress = (completed, total) => {
    const t = Number(total) || 0;
    const c = Number(completed) || 0;
    if (!t) return 0;
    return Math.max(0, Math.min(100, Math.round((c / t) * 100)));
  };

  const normalizeGrade = (g) => (g ?? "").toString().trim().toUpperCase();

  const getGradeColor = (grade) => {
    const g = normalizeGrade(grade);
    if (!g) return "#777";
    if (g.startsWith("A")) return "#4caf50";
    if (g.startsWith("B")) return "#2196f3";
    if (g.startsWith("C")) return "#ff9800";
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

  const overallPercent = calculateProgress(totalCreditsCompleted, totalCreditsRequired);

  const genEdCompletedCredits = useMemo(() => {
    if (!sbcRequirements?.sbcCategories) return 0;
    return sbcRequirements.sbcCategories.reduce((sum, cat) => {
      const catCredits = (cat.completedCourses || []).reduce(
        (s2, c) => s2 + (Number(c.credits) || 0),
        0
      );
      return sum + catCredits;
    }, 0);
  }, [sbcRequirements]);

  const programSummary = useMemo(() => {
    const summarize = (programs) => {
      let total = 0;
      let done = 0;

      for (const p of programs || []) {
        const core =
          Array.isArray(p.requiredCourses) && p.requiredCourses.length > 0
            ? p.requiredCourses
            : Array.isArray(p.groups)
            ? p.groups.find((g) => g.type === "all")?.items || []
            : [];

        total += core.length;
        done += core.filter((c) => !!c.completed).length;
      }

      return { programs: (programs || []).length, totalCourses: total, completedCourses: done };
    };

    return {
      majors: summarize(majorReqs),
      minors: summarize(minorReqs),
    };
  }, [majorReqs, minorReqs]);

  const courseKey = (program, c, idx, prefix) => {
    const pid =
      program?.programId ??
      program?.program_id ??
      program?.id ??
      (program?.name ? String(program.name) : null) ??
      "program";

    const cid = c?.id ?? c?.code ?? null;
    if (cid != null && cid !== "") return `${prefix}-${pid}-${cid}`;

    const subj = (c?.subject ?? "UNK").toString();
    const num = (c?.courseNum ?? c?.course_num ?? "UNK").toString();
    return `${prefix}-${pid}-${subj}-${num}-${idx}`;
  };

  const cardStyle = {
    padding: 24,
    borderRadius: 12,
    background: "#fff",
    border: "1px solid #ddd",
    boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
  };

  const pill = (text, bg) => (
    <span
      style={{
        padding: "4px 8px",
        borderRadius: 999,
        background: bg,
        color: "white",
        fontSize: 12,
        fontWeight: "bold",
      }}
    >
      {text}
    </span>
  );

  const renderCourseCard = (program, c, idx, prefix) => {
    const completed = !!c?.completed;
    const inProgress = !!c?.inProgress;

    const bg = completed ? "#e8f5e8" : inProgress ? "#fafafa" : "#fff";
    const border = completed ? "#4caf50" : inProgress ? "#b0bec5" : "#ddd";

    const subject = c?.subject ?? "";
    const courseNum = c?.courseNum ?? c?.course_num ?? "";
    const code = c?.code ?? "";
    const title = c?.title ?? "";
    const credits = c?.credits ?? null;
    const minGrade = c?.minGrade ?? c?.min_grade ?? null;
    const grade = normalizeGrade(c?.grade);

    const top = subject && courseNum ? `${subject} ${courseNum}` : code ? code : "Course";

    return (
      <div
        key={courseKey(program, c, idx, prefix)}
        style={{
          padding: 16,
          borderRadius: 8,
          marginBottom: 10,
          background: bg,
          border: `1px solid ${border}`,
        }}
      >
        <div style={{ fontWeight: "bold" }}>
          {top}
          {title ? ` — ${title}` : ""}
        </div>

        <div style={{ fontSize: 13, color: "#666" }}>
          {credits != null ? `${credits} credits` : "Credits: --"}
          {minGrade ? (
            <>
              {" "}
              • Required grade: <b>{minGrade}</b>
            </>
          ) : null}
        </div>

        {completed ? (
          <span
            style={{
              padding: "4px 8px",
              borderRadius: 6,
              background: getGradeColor(grade),
              color: "white",
              marginTop: 8,
              display: "inline-block",
              fontSize: 12,
            }}
          >
            {grade || "Completed"}
          </span>
        ) : null}

        {inProgress && !completed ? (
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
        ) : null}
      </div>
    );
  };

  const renderGroup = (program, group, gIdx) => {
    const status = group?.status || {};
    const completed = !!status.completed;
    const inProgress = !!status.inProgress;

    const headerBg = completed ? "#4caf50" : inProgress ? "#ff9800" : "#f44336";

    return (
      <div
        key={`${program?.programId ?? program?.name ?? "p"}-g-${group?.id ?? gIdx}`}
        style={{
          border: "1px solid #ddd",
          borderRadius: 12,
          padding: 16,
          background: "#fff",
          marginBottom: 14,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            alignItems: "center",
          }}
        >
          <div style={{ fontWeight: "bold", fontSize: 16 }}>{group?.title ?? "Requirement"}</div>
          {pill(completed ? "Satisfied" : inProgress ? "In progress" : "Not satisfied", headerBg)}
        </div>

        {group?.type === "all" && Array.isArray(group.items) ? (
          <div style={{ marginTop: 12 }}>
            {group.items.map((c, idx) => renderCourseCard(program, c, idx, `g-all-${group.id}`))}
          </div>
        ) : null}

        {group?.type === "choose_one" || group?.type === "choose_n" ? (
          <div style={{ marginTop: 10 }}>
            <div style={{ color: "#666", fontSize: 13, marginBottom: 10 }}>
              {group?.type === "choose_one"
                ? "Choose 1 of the following:"
                : `Choose ${Number(group?.required) || 0} of the following:`}
              {group?.status?.completedCount != null && group?.status?.requiredCount != null ? (
                <>{" "}({group.status.completedCount}/{group.status.requiredCount} completed)</>
              ) : null}
            </div>
            <div>
              {(group.items || []).map((c, idx) => renderCourseCard(program, c, idx, `g-choose-${group.id}`))}
            </div>
          </div>
        ) : null}

        {group?.type === "choose_sequence" ? (
          <div style={{ marginTop: 12 }}>
            <div style={{ color: "#666", fontSize: 13, marginBottom: 10 }}>
              Complete 1 of these sequences:
            </div>
            {(group.options || []).map((opt, oIdx) => {
              const optDone = !!opt?.status?.completed;
              const optProg = !!opt?.status?.inProgress && !optDone;

              return (
                <div
                  key={`${group.id}-opt-${opt?.id ?? oIdx}`}
                  style={{
                    border: "1px solid #ddd",
                    borderRadius: 10,
                    padding: 12,
                    background: optDone ? "#e8f5e8" : optProg ? "#fafafa" : "#fff",
                    marginBottom: 10,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ fontWeight: "bold" }}>Option {oIdx + 1}</div>
                    {pill(
                      optDone ? "Satisfied" : optProg ? "In progress" : "Not satisfied",
                      optDone ? "#4caf50" : optProg ? "#ff9800" : "#f44336"
                    )}
                  </div>
                  <div style={{ marginTop: 10 }}>
                    {(opt.items || []).map((c, idx) =>
                      renderCourseCard(program, c, idx, `g-seq-${group.id}-${opt.id}`)
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}

        {group?.type === "sequence" ? (
          <div style={{ marginTop: 12 }}>
            {(group.steps || []).map((step, sIdx) => {
              const sDone = !!step?.status?.completed;
              const sProg = !!step?.status?.inProgress && !sDone;

              return (
                <div
                  key={`${group.id}-step-${step?.id ?? sIdx}`}
                  style={{
                    border: "1px solid #ddd",
                    borderRadius: 10,
                    padding: 12,
                    background: sDone ? "#e8f5e8" : sProg ? "#fafafa" : "#fff",
                    marginBottom: 10,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ fontWeight: "bold" }}>Step {sIdx + 1}</div>
                    {pill(
                      sDone ? "Satisfied" : sProg ? "In progress" : "Not satisfied",
                      sDone ? "#4caf50" : sProg ? "#ff9800" : "#f44336"
                    )}
                  </div>
                  <div style={{ color: "#666", fontSize: 13, marginTop: 6 }}>Choose one of:</div>
                  <div style={{ marginTop: 10 }}>
                    {(step.options || []).map((c, idx) =>
                      renderCourseCard(program, c, idx, `g-step-${group.id}-${step.id}`)
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}

        {group?.type === "electives" ? (
          <div style={{ marginTop: 12 }}>
            <div style={{ color: "#666", fontSize: 13, marginBottom: 10 }}>
              Need {Number(group?.minCourses) || 0} course(s)
              {group?.fromSubject ? ` from ${group.fromSubject}` : ""}
              {group?.minLevel ? ` at ${group.minLevel}+ level` : ""}.{" "}
              ({group?.status?.completedCount ?? 0}/{Number(group?.minCourses) || 0} completed)
            </div>

            {(group.completedCourses || []).length > 0 ? (
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontWeight: "bold" }}>Counted (Completed)</div>
                <div style={{ marginTop: 8 }}>
                  {(group.completedCourses || []).map((c, idx) =>
                    renderCourseCard(program, c, idx, `g-elec-done-${group.id}`)
                  )}
                </div>
              </div>
            ) : null}

            {(group.inProgressCourses || []).length > 0 ? (
              <div>
                <div style={{ fontWeight: "bold" }}>Counted (In Progress)</div>
                <div style={{ marginTop: 8 }}>
                  {(group.inProgressCourses || []).map((c, idx) =>
                    renderCourseCard(program, c, idx, `g-elec-ip-${group.id}`)
                  )}
                </div>
              </div>
            ) : null}

            {(group.completedCourses || []).length === 0 && (group.inProgressCourses || []).length === 0 ? (
              <div style={{ color: "#777", fontSize: 13 }}>No electives counted yet.</div>
            ) : null}
          </div>
        ) : null}

        {group?.type === "credits_core" ? (
          <div style={{ marginTop: 12 }}>
            <div style={{ color: "#666", fontSize: 13, marginBottom: 10 }}>
              Core options satisfied: {group?.status?.coreCompletedCount ?? 0}/{group?.status?.coreRequiredCount ?? 0} •
              {" "}Credits: {group?.status?.creditsCompleted ?? 0}/{group?.status?.creditsRequired ?? 0}
            </div>

            <div style={{ fontWeight: "bold", marginBottom: 8 }}>Core option sequences</div>
            {(group.coreOptions || []).map((opt, oIdx) => {
              const optDone = !!opt?.status?.completed;
              const optProg = !!opt?.status?.inProgress && !optDone;

              return (
                <div
                  key={`${group.id}-coreopt-${opt?.id ?? oIdx}`}
                  style={{
                    border: "1px solid #ddd",
                    borderRadius: 10,
                    padding: 12,
                    background: optDone ? "#e8f5e8" : optProg ? "#fafafa" : "#fff",
                    marginBottom: 10,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ fontWeight: "bold" }}>Option {oIdx + 1}</div>
                    {pill(
                      optDone ? "Satisfied" : optProg ? "In progress" : "Not satisfied",
                      optDone ? "#4caf50" : optProg ? "#ff9800" : "#f44336"
                    )}
                  </div>
                  <div style={{ marginTop: 10 }}>
                    {(opt.items || []).map((c, idx) =>
                      renderCourseCard(program, c, idx, `g-credcore-${group.id}-${opt.id}`)
                    )}
                  </div>
                </div>
              );
            })}

            {(group.countedCompletedCourses || []).length > 0 ? (
              <div style={{ marginTop: 6 }}>
                <div style={{ fontWeight: "bold" }}>Counted (Completed)</div>
                <div style={{ marginTop: 8 }}>
                  {(group.countedCompletedCourses || []).map((c, idx) =>
                    renderCourseCard(program, c, idx, `g-credcount-done-${group.id}`)
                  )}
                </div>
              </div>
            ) : null}

            {(group.countedInProgressCourses || []).length > 0 ? (
              <div style={{ marginTop: 6 }}>
                <div style={{ fontWeight: "bold" }}>Counted (In Progress)</div>
                <div style={{ marginTop: 8 }}>
                  {(group.countedInProgressCourses || []).map((c, idx) =>
                    renderCourseCard(program, c, idx, `g-credcount-ip-${group.id}`)
                  )}
                </div>
              </div>
            ) : null}

            {((group.countedCompletedCourses || []).length === 0 &&
              (group.countedInProgressCourses || []).length === 0) ? (
              <div style={{ color: "#777", fontSize: 13 }}>No courses counted yet.</div>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  };

  const renderProgramList = (programs, kindLabel) => {
    if (!programs || programs.length === 0) {
      return <p style={{ color: "#777" }}>No {kindLabel.toLowerCase()}s declared.</p>;
    }

    return programs.map((program, pIdx) => {
      const programId = program?.programId ?? program?.program_id ?? program?.id ?? `program-${pIdx}`;
      const programName = program?.name ?? `${kindLabel} Program`;

      const groups = Array.isArray(program?.groups) ? program.groups : [];
      const fallbackCore = Array.isArray(program?.requiredCourses) ? program.requiredCourses : [];

      return (
        <div key={`${kindLabel}-${programId}`} style={{ marginBottom: 28 }}>
          <h2 style={{ marginBottom: 12 }}>{programName}</h2>

          {groups.length > 0 ? (
            <div style={{ marginTop: 12 }}>
              {groups.map((g, idx) => renderGroup(program, g, idx))}
            </div>
          ) : (
            <div style={{ marginTop: 12 }}>
              {fallbackCore.length === 0 ? (
                <div
                  style={{
                    padding: 14,
                    borderRadius: 8,
                    border: "1px dashed #bbb",
                    color: "#666",
                    background: "#fafafa",
                  }}
                >
                  No requirement courses found for this {kindLabel.toLowerCase()}.
                </div>
              ) : (
                <div>
                  {fallbackCore.map((c, idx) =>
                    renderCourseCard(program, c, idx, `fallback-${programId}`)
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      );
    });
  };

  return (
    <div style={{ padding: 20 }}>
      <h1>Degree Progress</h1>

      {loading ? <p style={{ color: "#666" }}>Loading degree progress...</p> : null}

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

      {activeSection === "overview" && overview ? (
        <div>
          <h2>Academic Overview</h2>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
              gap: 20,
              marginBottom: 32,
            }}
          >
            <div style={cardStyle}>
              <h3>Overall Progress</h3>

              <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
                <div
                  style={{
                    width: 80,
                    height: 80,
                    borderRadius: "50%",
                    background: `conic-gradient(${getProgressColor(overallPercent)} ${
                      overallPercent * 3.6
                    }deg, #eee 0deg)`,
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

            <div style={cardStyle}>
              <h3>GPA</h3>
              <div style={{ fontSize: 32, fontWeight: "bold", color: "#1976d2" }}>
                {overview.gpa != null ? Number(overview.gpa).toFixed(3) : "N/A"}
              </div>
            </div>
          </div>

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
                <strong>Majors</strong>
                <div style={{ color: "#666" }}>
                  {programSummary.majors.programs} program(s) •{" "}
                  {programSummary.majors.completedCourses}/{programSummary.majors.totalCourses} courses completed
                </div>
              </div>

              <div>
                <strong>Minors</strong>
                <div style={{ color: "#666" }}>
                  {programSummary.minors.programs} program(s) •{" "}
                  {programSummary.minors.completedCourses}/{programSummary.minors.totalCourses} courses completed
                </div>
              </div>

              <div>
                <strong>General Education (SBC)</strong>
                <div style={{ color: "#666" }}>
                  {genEdCompletedCredits}/{sbcRequirements?.minimumCredits ?? "--"} credits completed
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {activeSection === "major" ? <div>{renderProgramList(majorReqs, "Major")}</div> : null}

      {activeSection === "minor" ? <div>{renderProgramList(minorReqs, "Minor")}</div> : null}

      {activeSection === "gened" && sbcRequirements ? (
        <div>
          <h2>General Education — SBC Requirements</h2>

          <div style={{ marginTop: 16, display: "grid", gap: 16 }}>
            {(sbcRequirements.sbcCategories || []).map((cat, idx) => {
              const completedCourses = cat.completedCourses || [];
              const inProgressCourses = cat.inProgressCourses || [];

              const bg = cat.completed ? "#e8f5e8" : cat.inProgress ? "#fafafa" : "#fff";
              const border = cat.completed ? "#4caf50" : cat.inProgress ? "#b0bec5" : "#ddd";

              return (
                <div
                  key={`${cat.code ?? "SBC"}-${idx}`}
                  style={{
                    padding: 20,
                    borderRadius: 10,
                    border: `1px solid ${border}`,
                    background: bg,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <h3 style={{ margin: 0 }}>{cat.code}</h3>

                    <span
                      style={{
                        padding: "4px 8px",
                        borderRadius: 6,
                        background: cat.completed ? "#4caf50" : cat.inProgress ? "#ff9800" : "#f44336",
                        color: "white",
                        fontSize: 12,
                        fontWeight: "bold",
                      }}
                    >
                      {cat.completed ? "Satisfied" : cat.inProgress ? "In progress" : "Not satisfied"}
                    </span>
                  </div>

                  {completedCourses.length > 0 ? (
                    <div style={{ marginBottom: 8 }}>
                      <strong>Completed:</strong>
                      {completedCourses.map((c, i) => (
                        <div
                          key={`${cat.code}-done-${c.subject ?? "UNK"}-${c.courseNum ?? c.course_num ?? "UNK"}-${i}`}
                          style={{
                            padding: 8,
                            background: "white",
                            borderRadius: 6,
                            border: "1px solid #c8e6c9",
                            marginTop: 6,
                            fontSize: 13,
                          }}
                        >
                          {(c.subject || c.courseNum || c.course_num)
                            ? `${c.subject ?? ""} ${c.courseNum ?? c.course_num ?? ""} — ${c.title ?? ""}`.trim()
                            : c.title ?? "Course"}
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
                            {normalizeGrade(c.grade) || "Completed"}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {inProgressCourses.length > 0 ? (
                    <div>
                      <strong>In Progress:</strong>
                      {inProgressCourses.map((c, i) => (
                        <div
                          key={`${cat.code}-ip-${c.subject ?? "UNK"}-${c.courseNum ?? c.course_num ?? "UNK"}-${i}`}
                          style={{
                            padding: 8,
                            background: "#f5f5f5",
                            border: "1px solid #cfd8dc",
                            borderRadius: 6,
                            marginTop: 6,
                            fontSize: 13,
                          }}
                        >
                          {(c.subject || c.courseNum || c.course_num)
                            ? `${c.subject ?? ""} ${c.courseNum ?? c.course_num ?? ""} — ${c.title ?? ""}`.trim()
                            : c.title ?? "Course"}
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
                  ) : null}

                  {completedCourses.length === 0 && inProgressCourses.length === 0 ? (
                    <div style={{ color: "#777", fontSize: 13 }}>No courses applied yet.</div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
