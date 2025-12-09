import React, { useEffect, useMemo, useState } from "react";

const totalWorkload = (term) =>
  (term?.courses || []).reduce((sum, c) => sum + Number(c?.credits ?? c?.workload ?? 0), 0);

async function readJsonSafe(res) {
  const ct = (res.headers.get("content-type") || "").toLowerCase();
  if (!ct.includes("application/json")) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Server did not return JSON (status ${res.status}). ` +
        (text ? `Response starts with: ${text.slice(0, 40)}` : "")
    );
  }
  return res.json();
}

function normalizeCode(raw) {
  return (raw ?? "").toString().trim().toUpperCase().replace(/\s+/g, "");
}

function downloadTextFile(filename, text) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** ---------------------------
 * Term helpers (client-side)
 * --------------------------*/
const SEM_ORDER = { SPRING: 1, SUMMER: 2, FALL: 3, WINTER: 4 };
const semKey = (sem) => SEM_ORDER[(sem ?? "").toString().trim().toUpperCase()] ?? 99;

function normalizeSemesterClient(raw) {
  const s = (raw ?? "").toString().trim().toLowerCase();
  if (!s) return null;
  if (s.startsWith("spr")) return "Spring";
  if (s.startsWith("sum")) return "Summer";
  if (s.startsWith("fal")) return "Fall";
  if (s.startsWith("win")) return "Winter";
  // fallback: TitleCase first char
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function termLabel(semester, year) {
  const sem = normalizeSemesterClient(semester);
  const yr = Number(year);
  if (!sem || !Number.isFinite(yr)) return "";
  return `${sem} ${yr}`;
}

function parseTermLabel(label) {
  const s = (label ?? "").toString().trim();
  if (!s) return { semester: null, year: null };

  const m = s.match(/^(Spring|Summer|Fall|Winter)\s+(\d{4})$/i);
  if (!m) return { semester: null, year: null };

  return { semester: normalizeSemesterClient(m[1]), year: Number(m[2]) };
}

function termCompare(aSem, aYear, bSem, bYear) {
  const ay = Number(aYear) || 0;
  const by = Number(bYear) || 0;
  if (ay !== by) return ay - by;
  return semKey(aSem) - semKey(bSem);
}

function nextTerm(semester, year) {
  const sem = normalizeSemesterClient(semester) || "Spring";
  const yr = Number(year) || new Date().getFullYear();

  // planner convention: Spring -> Summer -> Fall -> Spring ...
  const order = ["Spring", "Summer", "Fall"];
  const idx = order.indexOf(sem);
  if (idx === -1) return { semester: "Spring", year: yr };

  const nextIdx = (idx + 1) % order.length;
  const nextYear = nextIdx === 0 ? yr + 1 : yr;
  return { semester: order[nextIdx], year: nextYear };
}

function defaultWorkloadLimit(semester) {
  const sem = (normalizeSemesterClient(semester) ?? "").toUpperCase();
  if (sem === "SUMMER") return 0;
  return 15;
}

function termSortKey(t) {
  const sem = normalizeSemesterClient(t?.semester) || parseTermLabel(t?.termLabel).semester;
  const yr = Number(t?.year) || parseTermLabel(t?.termLabel).year || 0;
  return yr * 100 + semKey(sem);
}

function parseTermFromAny(term) {
  const parsed = parseTermLabel(term?.termLabel);
  const sem = normalizeSemesterClient(term?.semester) || parsed.semester;
  const yr = Number(term?.year) || parsed.year;
  return {
    semester: sem ?? null,
    year: Number.isFinite(yr) ? yr : null,
    termLabel: termLabel(sem, yr),
  };
}

export default function PlanPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [validating, setValidating] = useState(false);
  const [autoPlanning, setAutoPlanning] = useState(false);
  const [error, setError] = useState("");

  const [plan, setPlan] = useState([]);
  const [graduationTerm, setGraduationTerm] = useState("");
  const [message, setMessage] = useState("");

  const [validationIssues, setValidationIssues] = useState([]);

  const [overview, setOverview] = useState(null);
  const [sbcRequirements, setSbcRequirements] = useState(null);
  const [requiredSummary, setRequiredSummary] = useState({
    requiredCourseIds: [],
    satisfiedRequired: [],
    missingRequired: [],
  });

  const requiredSet = useMemo(() => new Set(requiredSummary.requiredCourseIds || []), [requiredSummary]);

  const loadPrefill = async () => {
    try {
      setLoading(true);
      setError("");
      setMessage("");
      setValidationIssues([]);

      const res = await fetch("/api/schedule-plan/prefill", { credentials: "include" });
      const data = await readJsonSafe(res);

      if (!res.ok || data.ok === false) throw new Error(data.error || "Failed loading schedule planner prefill.");

      setPlan(Array.isArray(data.planTerms) ? data.planTerms : []);
      setOverview(data.overview ?? null);
      setSbcRequirements(data.sbcRequirements ?? null);
      setRequiredSummary(data.requiredSummary ?? { requiredCourseIds: [], satisfiedRequired: [], missingRequired: [] });

      // Prefer saved graduation term if backend has it
      if (data.graduationTerm) {
        setGraduationTerm(data.graduationTerm);
      } else {
        const terms = Array.isArray(data.planTerms) ? data.planTerms : [];
        const last = terms.length > 0 ? terms[terms.length - 1] : null;
        setGraduationTerm(last?.termLabel ?? "");
      }
    } catch (e) {
      console.error(e);
      setError(e.message || "Failed loading schedule planner prefill.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPrefill();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** ---------------------------------------------------------
   * ✅ KEY FIX:
   * When graduationTerm changes, expand/clip plan terms up to it.
   * --------------------------------------------------------*/
  useEffect(() => {
    const gradParsed = parseTermLabel(graduationTerm);
    if (!gradParsed.semester || !gradParsed.year) return;

    setPlan((prev) => {
      if (!Array.isArray(prev) || prev.length === 0) return prev;

      // Build map of existing terms by "Semester Year"
      const map = new Map();
      for (const t of prev) {
        const p = parseTermFromAny(t);
        if (!p.semester || !p.year) continue;
        const key = `${p.semester} ${p.year}`;
        if (!map.has(key)) {
          map.set(key, {
            ...t,
            semester: p.semester,
            year: p.year,
            termLabel: p.termLabel,
            courses: Array.isArray(t.courses) ? t.courses : [],
          });
        }
      }

      const all = Array.from(map.values());
      const lockedTerms = all.filter((t) => !!t.locked);
      const editableTerms = all.filter((t) => !t.locked);

      // Determine where editable planning starts
      let start = null;

      if (editableTerms.length) {
        start = editableTerms.reduce((min, t) => {
          const tp = parseTermFromAny(t);
          const mp = parseTermFromAny(min);
          return termCompare(tp.semester, tp.year, mp.semester, mp.year) < 0 ? t : min;
        }, editableTerms[0]);
        const sp = parseTermFromAny(start);
        start = { semester: sp.semester, year: sp.year };
      } else if (lockedTerms.length) {
        const lastLocked = lockedTerms.reduce((max, t) => {
          const tp = parseTermFromAny(t);
          const mp = parseTermFromAny(max);
          return termCompare(tp.semester, tp.year, mp.semester, mp.year) > 0 ? t : max;
        }, lockedTerms[0]);
        const lp = parseTermFromAny(lastLocked);
        start = nextTerm(lp.semester, lp.year);
      } else {
        // extremely unlikely: no terms at all
        start = { semester: "Spring", year: new Date().getFullYear() };
      }

      // If user selects graduation BEFORE start, just clip editable terms to <= grad
      // (locked terms still show)
      const seq = [];
      if (termCompare(start.semester, start.year, gradParsed.semester, gradParsed.year) <= 0) {
        let cur = { ...start };
        while (termCompare(cur.semester, cur.year, gradParsed.semester, gradParsed.year) <= 0) {
          seq.push({ ...cur });
          cur = nextTerm(cur.semester, cur.year);
        }
      }

      // Build output: keep all locked + editable sequence up to graduation
      const out = [];
      for (const t of lockedTerms) out.push(t);

      for (const s of seq) {
        const key = `${s.semester} ${s.year}`;
        const existing = map.get(key);

        // if existing term is locked it was already added above; skip adding again
        if (existing) {
          if (!existing.locked) out.push(existing);
        } else {
          out.push({
            termLabel: termLabel(s.semester, s.year),
            semester: s.semester,
            year: s.year,
            termId: null,
            workloadLimit: defaultWorkloadLimit(s.semester),
            locked: false,
            courses: [],
          });
        }
      }

      // De-dupe by key (just in case)
      const seen = new Set();
      const dedup = [];
      for (const t of out) {
        const p = parseTermFromAny(t);
        if (!p.semester || !p.year) continue;
        const key = `${p.semester} ${p.year}`;
        if (seen.has(key)) continue;
        seen.add(key);
        dedup.push({
          ...t,
          semester: p.semester,
          year: p.year,
          termLabel: p.termLabel,
          workloadLimit:
            Number.isFinite(Number(t.workloadLimit)) ? Number(t.workloadLimit) : defaultWorkloadLimit(p.semester),
          courses: Array.isArray(t.courses) ? t.courses : [],
        });
      }

      // Sort chronologically
      dedup.sort((a, b) => termSortKey(a) - termSortKey(b));

      return dedup;
    });
  }, [graduationTerm]);

  /** Graduation dropdown: stop at Summer 2030 */
  const ENDYEAR = 2030;

  const generateTerms = () => {
    const terms = [];
    const currentYear = new Date().getFullYear();

    for (let year = currentYear; year <= ENDYEAR; year++) {
      const semesters = year === ENDYEAR ? ["Spring", "Summer"] : ["Spring", "Summer", "Fall"];
      for (const sem of semesters) terms.push(`${sem} ${year}`);
    }
    return terms;
  };

  const graduationOptions = useMemo(() => generateTerms(), []);

  const handleWorkloadLimitChange = (termIndex, value) => {
    setPlan((prev) => {
      const next = prev.map((t) => ({ ...t, courses: (t.courses || []).map((c) => ({ ...c })) }));
      next[termIndex].workloadLimit = Number(value) || 0;
      return next;
    });
  };

  const handleAddCourse = (termIndex) => {
    setPlan((prev) => {
      const next = prev.map((t) => ({ ...t, courses: (t.courses || []).map((c) => ({ ...c })) }));
      const term = next[termIndex];
      if (term.locked) return prev; // no-op
      term.courses = term.courses || [];
      term.courses.push({ code: "", title: "", credits: 3, locked: false });
      return next;
    });
  };

  const handleRemoveCourse = (termIndex, courseIndex) => {
    setPlan((prev) => {
      const next = prev.map((t) => ({ ...t, courses: (t.courses || []).map((c) => ({ ...c })) }));
      const term = next[termIndex];
      const course = term?.courses?.[courseIndex];
      if (term?.locked || course?.locked) return prev; // no-op
      term.courses.splice(courseIndex, 1);
      return next;
    });
  };

  const handleCourseChange = (termIndex, courseIndex, key, value) => {
    setPlan((prev) => {
      const next = prev.map((t) => ({ ...t, courses: (t.courses || []).map((c) => ({ ...c })) }));
      const term = next[termIndex];
      const course = term?.courses?.[courseIndex];
      if (term?.locked || course?.locked) return prev; // no-op

      if (key === "code") next[termIndex].courses[courseIndex][key] = normalizeCode(value);
      else next[termIndex].courses[courseIndex][key] = value;

      return next;
    });
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError("");
      setMessage("");
      setValidationIssues([]);

      const payload = { graduationTerm, planTerms: plan };

      const res = await fetch("/api/schedule-plan/save", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await readJsonSafe(res);
      if (!res.ok || data.ok === false) throw new Error(data.error || "Failed to save plan.");

      setMessage("Plan saved successfully!");
      await loadPrefill();
    } catch (e) {
      console.error(e);
      setError(e.message || "Failed to save plan.");
    } finally {
      setSaving(false);
    }
  };

  const handleValidate = async () => {
    try {
      setValidating(true);
      setError("");
      setMessage("");
      setValidationIssues([]);

      const payload = { graduationTerm, planTerms: plan };

      const res = await fetch("/api/schedule-plan/validate", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await readJsonSafe(res);

      if (!res.ok || data.ok === false) {
        const issues = Array.isArray(data.issues) ? data.issues : [];
        setValidationIssues(issues);
        throw new Error(data.error || "Plan is not valid.");
      }

      const warnings = Array.isArray(data.warnings) ? data.warnings : [];
      const gradOk = !!data.graduationOk;
      const grad = data.graduationSummary || null;

      if (gradOk) {
        const warnText = warnings.length ? `\nWarnings:\n- ${warnings.join("\n- ")}` : "";
        setMessage(`✅ Plan is valid and graduation-ready by ${graduationTerm || "your selected graduation term"}!${warnText}`);
      } else {
        const missingLines = [];
        if (grad) {
          if ((grad.missingRequired || []).length) missingLines.push(`Missing required courses: ${grad.missingRequired.join(", ")}`);
          if ((grad.missingSbcCategories || []).length) missingLines.push(`Missing SBC categories: ${grad.missingSbcCategories.join(", ")}`);
          if ((grad.creditsMissing ?? 0) > 0) {
            missingLines.push(`Missing credits: ${grad.creditsMissing} (planned ${grad.creditsPlanned} / ${grad.totalCreditsRequired})`);
          }
        } else {
          missingLines.push("Graduation summary unavailable (backend did not return details).");
        }

        const warnText = warnings.length ? `\nWarnings:\n- ${warnings.join("\n- ")}` : "";
        setMessage(
          `✅ Plan is valid, but NOT graduation-ready by ${graduationTerm || "your selected graduation term"}.\n` +
            `What's missing:\n- ${missingLines.join("\n- ")}${warnText}`
        );
      }
    } catch (e) {
      console.error(e);
      setError(e.message || "Plan is not valid.");
    } finally {
      setValidating(false);
    }
  };

  const handleRunAutoPlanner = async () => {
    try {
      setAutoPlanning(true);
      setError("");
      setMessage("");
      setValidationIssues([]);

      const payload = { graduationTerm, planTerms: plan };

      const res = await fetch("/api/schedule-plan/auto-plan", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await readJsonSafe(res);

      if (!res.ok || data.ok === false) {
        if (Array.isArray(data.issues)) setValidationIssues(data.issues);
        throw new Error(data.error || "Auto-planner failed.");
      }

      if (Array.isArray(data.planTerms)) setPlan(data.planTerms);
      if (data.graduationTerm) setGraduationTerm(data.graduationTerm);

      const summary = data.graduationSummary;
      const extra =
        summary
          ? `\nPlanned credits: ${summary.creditsPlanned}/${summary.totalCreditsRequired}` +
            (summary.missingRequired?.length ? `\nMissing required: ${summary.missingRequired.join(", ")}` : "") +
            (summary.missingSbcCategories?.length ? `\nMissing SBC: ${summary.missingSbcCategories.join(", ")}` : "")
          : "";

      setMessage((data.message || "✅ Auto-plan generated.") + extra);

      const safeTerm = (data.graduationTerm || graduationTerm || "Plan").replace(/\s+/g, "_");
      if (data.exportText) {
        downloadTextFile(`SAM_AutoPlan_${safeTerm}.txt`, data.exportText);
      }
    } catch (e) {
      console.error(e);
      setError(e.message || "Auto-planner failed.");
    } finally {
      setAutoPlanning(false);
    }
  };

  const sbcStats = useMemo(() => {
    const cats = sbcRequirements?.sbcCategories || [];
    const completedCount = cats.filter((c) => c.completed).length;
    const inProgressCount = cats.filter((c) => !c.completed && c.inProgress).length;
    const total = cats.length;

    const completedCredits = cats.reduce((sum, cat) => {
      const credits = (cat.completedCourses || []).reduce((s2, c) => s2 + (Number(c.credits) || 0), 0);
      return sum + credits;
    }, 0);

    return { completedCount, inProgressCount, total, completedCredits };
  }, [sbcRequirements]);

  return (
    <div style={{ padding: 20, maxWidth: 980, margin: "0 auto" }}>
      <h1>Schedule Planner</h1>

      {loading ? <p style={{ color: "#666" }}>Loading planner…</p> : null}

      {error ? (
        <div
          style={{
            padding: 12,
            borderRadius: 6,
            background: "#f8d7da",
            color: "#721c24",
            border: "1px solid #f5c6cb",
            marginBottom: 16,
            whiteSpace: "pre-line",
          }}
        >
          {error}
        </div>
      ) : null}

      {validationIssues.length ? (
        <div
          style={{
            padding: 12,
            borderRadius: 6,
            background: "#fff3cd",
            border: "1px solid #ffeeba",
            marginBottom: 16,
          }}
        >
          <div style={{ fontWeight: "bold", marginBottom: 8 }}>Validation Issues</div>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {validationIssues.map((it, idx) => (
              <li key={idx}>
                <strong>{it.termLabel || "Term"}</strong> — <strong>{it.courseCode || "Course"}</strong>: {it.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {message ? (
        <div
          style={{
            padding: 12,
            borderRadius: 6,
            background: "#e3f2fd",
            color: "#0d47a1",
            border: "1px solid #bbdefb",
            marginBottom: 16,
            whiteSpace: "pre-line",
          }}
        >
          {message}
        </div>
      ) : null}

      <div style={{ marginBottom: 20, padding: 12, background: "#f0f2f5", borderRadius: 8 }}>
        <label style={{ fontWeight: "bold" }}>Planned Graduation Term:</label>
        <select
          value={graduationTerm}
          onChange={(e) => setGraduationTerm(e.target.value)}
          style={{ display: "block", width: "100%", padding: 8, marginTop: 8 }}
        >
          <option value="">-- Select Graduation Term --</option>
          {graduationOptions.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>

        <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            onClick={handleRunAutoPlanner}
            disabled={autoPlanning || loading || saving || validating}
            style={{
              padding: "8px 12px",
              background: autoPlanning ? "#90caf9" : "#1976d2",
              color: "white",
              border: "none",
              borderRadius: 6,
              cursor: autoPlanning ? "not-allowed" : "pointer",
              fontWeight: "bold",
            }}
          >
            {autoPlanning ? "Auto-planning..." : "Run Auto-Planner"}
          </button>

          <button
            onClick={loadPrefill}
            style={{
              padding: "8px 12px",
              background: "#666",
              color: "white",
              border: "none",
              borderRadius: 6,
              cursor: "pointer",
              fontWeight: "bold",
            }}
          >
            Reset (Reload)
          </button>

          <button
            onClick={handleValidate}
            disabled={validating || saving || autoPlanning}
            style={{
              padding: "8px 12px",
              background: validating ? "#c9a227" : "#f9a825",
              color: "white",
              border: "none",
              borderRadius: 6,
              cursor: validating || saving || autoPlanning ? "not-allowed" : "pointer",
              fontWeight: "bold",
            }}
          >
            {validating ? "Validating..." : "Validate Plan"}
          </button>

          <button
            onClick={handleSave}
            disabled={saving || validating || autoPlanning}
            style={{
              padding: "8px 12px",
              background: saving ? "#6aa76d" : "#388e3c",
              color: "white",
              border: "none",
              borderRadius: 6,
              cursor: saving || validating || autoPlanning ? "not-allowed" : "pointer",
              fontWeight: "bold",
            }}
          >
            {saving ? "Saving..." : "Save Plan"}
          </button>
        </div>
      </div>

      {/* SUMMARY */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
        <div style={{ padding: 12, borderRadius: 8, background: "#fffbe6", border: "1px solid #ffd54f" }}>
          <h3 style={{ marginTop: 0 }}>Required Courses Summary</h3>
          <p style={{ margin: 0 }}>
            Satisfied: {requiredSummary.satisfiedRequired?.length || 0} / {requiredSummary.requiredCourseIds?.length || 0}
          </p>
          <p style={{ marginTop: 8 }}>
            <strong>Missing:</strong>{" "}
            {(requiredSummary.missingRequired || []).length === 0 ? "None" : requiredSummary.missingRequired.join(", ")}
          </p>
        </div>

        <div style={{ padding: 12, borderRadius: 8, background: "#fff", border: "1px solid #eee" }}>
          <h3 style={{ marginTop: 0 }}>SBC Summary</h3>
          <p style={{ margin: 0 }}>
            Categories satisfied: {sbcStats.completedCount} / {sbcStats.total}{" "}
            {sbcStats.inProgressCount ? `• In progress: ${sbcStats.inProgressCount}` : ""}
          </p>
          <p style={{ marginTop: 8 }}>
            Credits completed (from SBC courses): {sbcStats.completedCredits} / {sbcRequirements?.minimumCredits ?? "--"}
          </p>
        </div>
      </div>

      {/* OVERVIEW */}
      {overview ? (
        <div style={{ marginBottom: 20, padding: 12, borderRadius: 8, background: "#fff", border: "1px solid #eee" }}>
          <h3 style={{ marginTop: 0 }}>Academic Overview</h3>
          <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontWeight: "bold" }}>GPA</div>
              <div style={{ fontSize: 22, color: "#1976d2", fontWeight: "bold" }}>
                {overview.gpa != null ? Number(overview.gpa).toFixed(3) : "N/A"}
              </div>
            </div>
            <div>
              <div style={{ fontWeight: "bold" }}>Credits Completed</div>
              <div style={{ fontSize: 22, fontWeight: "bold" }}>
                {overview.totalCreditsCompleted ?? 0}/{overview.totalCreditsRequired ?? 120}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* PLAN */}
      {plan.map((term, termIndex) => {
        const lockedTerm = !!term.locked;
        const wl = Number(term.workloadLimit) || 0;
        const total = totalWorkload(term);

        return (
          <div
            key={term.termLabel || `${term.semester}-${term.year}-${termIndex}`}
            style={{ marginBottom: 20, padding: 12, backgroundColor: "#f5f5f5", borderRadius: 6 }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
              <h3 style={{ margin: 0 }}>{term.termLabel || "Term"}</h3>
              {lockedTerm ? (
                <span
                  style={{
                    padding: "4px 8px",
                    borderRadius: 999,
                    background: "#424242",
                    color: "white",
                    fontSize: 12,
                    fontWeight: "bold",
                  }}
                >
                  Locked (Completed / In-progress)
                </span>
              ) : (
                <span
                  style={{
                    padding: "4px 8px",
                    borderRadius: 999,
                    background: "#1976d2",
                    color: "white",
                    fontSize: 12,
                    fontWeight: "bold",
                  }}
                >
                  Editable
                </span>
              )}
            </div>

            <div style={{ marginTop: 10 }}>
              <label style={{ fontWeight: "bold" }}>Workload Limit:</label>
              <input
                type="number"
                value={wl}
                disabled={lockedTerm}
                onChange={(e) => handleWorkloadLimitChange(termIndex, e.target.value)}
                min="0"
                style={{ display: "block", width: "100%", padding: 8, marginTop: 8 }}
              />
              <p style={{ fontStyle: "italic", marginTop: 4 }}>
                Current total workload: {total} / {wl}
              </p>
            </div>

            {(term.courses || []).map((course, courseIndex) => {
              const code = normalizeCode(course.code || course.id || course.name || "");
              const lockedCourse = !!course.locked;
              const isRequired = code ? requiredSet.has(code) : false;

              return (
                <div
                  key={`${termIndex}-${courseIndex}-${code || "course"}`}
                  style={{ display: "flex", alignItems: "center", marginBottom: 8, gap: 8 }}
                >
                  <input
                    type="text"
                    value={code}
                    disabled={lockedTerm || lockedCourse}
                    onChange={(e) => handleCourseChange(termIndex, courseIndex, "code", e.target.value)}
                    placeholder="Course ID (e.g., CSE214)"
                    style={{
                      flex: 1,
                      padding: 8,
                      borderRadius: 6,
                      background: lockedTerm || lockedCourse ? "#eee" : "white",
                      border: "1px solid #ccc",
                    }}
                  />

                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    value={Number(course.credits ?? course.workload ?? 0)}
                    disabled={lockedTerm || lockedCourse}
                    onChange={(e) => handleCourseChange(termIndex, courseIndex, "credits", e.target.value)}
                    placeholder="Credits"
                    style={{
                      width: 110,
                      padding: 8,
                      borderRadius: 6,
                      background: lockedTerm || lockedCourse ? "#eee" : "white",
                      border: "1px solid #ccc",
                    }}
                  />

                  <div
                    style={{
                      padding: "6px 10px",
                      borderRadius: 6,
                      background: isRequired ? "#e8f5e9" : "#fff3e0",
                      border: isRequired ? "1px solid #c8e6c9" : "1px solid #ffd89b",
                      whiteSpace: "nowrap",
                      fontSize: 12,
                      fontWeight: "bold",
                    }}
                  >
                    {isRequired ? "Required" : "Non-required"}
                  </div>

                  {course.grade ? (
                    <div
                      style={{
                        padding: "6px 10px",
                        borderRadius: 6,
                        background: "#263238",
                        color: "white",
                        fontSize: 12,
                        fontWeight: "bold",
                        whiteSpace: "nowrap",
                      }}
                      title="Grade"
                    >
                      {course.grade}
                    </div>
                  ) : null}

                  {!lockedTerm && !lockedCourse ? (
                    <button
                      onClick={() => handleRemoveCourse(termIndex, courseIndex)}
                      style={{
                        backgroundColor: "#d32f2f",
                        color: "white",
                        border: "none",
                        borderRadius: 6,
                        padding: "6px 10px",
                        cursor: "pointer",
                        fontWeight: "bold",
                      }}
                      title="Remove"
                    >
                      X
                    </button>
                  ) : (
                    <button
                      disabled
                      style={{
                        backgroundColor: "#bbb",
                        color: "white",
                        border: "none",
                        borderRadius: 6,
                        padding: "6px 10px",
                        cursor: "not-allowed",
                        fontWeight: "bold",
                      }}
                      title="Locked"
                    >
                      🔒
                    </button>
                  )}
                </div>
              );
            })}

            {!lockedTerm ? (
              <div style={{ marginTop: 10 }}>
                <button
                  onClick={() => handleAddCourse(termIndex)}
                  style={{
                    padding: "6px 12px",
                    backgroundColor: "#1976d2",
                    color: "white",
                    border: "none",
                    borderRadius: 6,
                    cursor: "pointer",
                    fontWeight: "bold",
                  }}
                >
                  Add Course
                </button>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
