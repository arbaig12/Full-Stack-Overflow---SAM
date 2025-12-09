/**
 * @file SchedulePlanRoutes.js
 * @description Routes for Schedule Planner:
 *  - GET  /api/schedule-plan/prefill  (locks completed/in-progress terms + overlays saved editable plan if present)
 *  - POST /api/schedule-plan/save     (saves ONLY editable terms/courses into academic_plans tables)
 *  - POST /api/schedule-plan/validate (validates plan rules + checks graduation readiness by selected graduation term)
 *  - POST /api/schedule-plan/auto-plan (greedy autoplan respecting workload limits, prereqs, offerings; persists result; returns export text)
 *
 * Uses users.user_id (NOT student_id). Ensures user role is student.
 *
 * IMPORTANT:
 *  - Your DB semester_kind enum does NOT accept "Summer".
 *  - Frontend currently uses "Summer".
 *  - We normalize anything "Summer*" to DB-safe "SummerI" (default) on INSERT/UPDATE and comparisons.
 *  - When reading from DB (SummerI/SummerII), we map back to "Summer" for the frontend payload.
 *
 * PATCH NOTES (drop-in):
 *  - Fix SBC parsing so strings like "SBS+ HFA+" are correctly counted.
 *  - Auto-plan elective filler now has a fallback pass: if an SBC is missing but no SBC-covering course fits,
 *    it can still add credits-only courses to reach 120 (prevents deadlock).
 *  - Auto-plan horizon is no longer hard-capped at 2030; it extends to max(2030, requestedGradYear + 4).
 */

import express from "express";
const router = express.Router();

const GRADE_POINTS = {
  "A+": 4.0, A: 4.0, "A-": 3.7,
  "B+": 3.3, B: 3.0, "B-": 2.7,
  "C+": 2.3, C: 2.0, "C-": 1.7,
  "D+": 1.3, D: 1.0, "D-": 0.7,
  F: 0.0,
};

const UNIVERSITY_GRAD_REQ = {
  minimumCredits: 120,
  sbcs: [
    "ARTS","GLO","HUM","LANG","QPS","SBS","SNW","TECH","USA","WRT",
    "STAS","EXP+","HFA+","SBS+","STEM+","CER","DIV","ESI","SPK","WRTD",
  ],
};

const normStr = (x) => (x ?? "").toString().trim();
const normUpper = (x) => {
  const s = normStr(x);
  return s ? s.toUpperCase() : "";
};
const normLower = (x) => {
  const s = normStr(x);
  return s ? s.toLowerCase() : "";
};

function normProgramType(x) {
  const t = normLower(x);
  if (!t) return null;
  if (t === "major" || t === "maj" || t === "ma" || t === "majors") return "major";
  if (t === "minor" || t === "min" || t === "mi" || t === "minors") return "minor";
  return t;
}

// In SAM auth, this should be the user's user_id
function getUserId(req) {
  return req.user?.userId ?? req.user?.user_id ?? req.session?.user?.user_id ?? null;
}

async function ensureStudent(db, userId) {
  const { rows } = await db.query(
    `SELECT role FROM public.users WHERE user_id = $1`,
    [userId]
  );
  if (rows.length === 0) return { ok: false, status: 401, error: "User not found" };
  const role = (rows[0].role ?? "").toString().toLowerCase();
  if (role !== "student") return { ok: false, status: 403, error: "Only students can use Schedule Planner" };
  return { ok: true };
}

function isInProgressStatus(status) {
  const st = normLower(status);
  return ["registered", "enrolled", "waitlisted"].includes(st);
}

function isPassing(rawGrade) {
  const g = normUpper(rawGrade);
  if (!g) return false;
  if (Object.prototype.hasOwnProperty.call(GRADE_POINTS, g)) return g !== "F";
  return ["P", "CR", "S"].includes(g);
}

/**
 * ---- Summer normalization helpers ----
 * DB enum semester_kind DOES NOT accept "Summer".
 * Frontend uses "Summer".
 */
function normalizeSemesterForDb(raw) {
  const s = normUpper(raw).replace(/\s+/g, "");
  if (!s) return null;

  if (s === "SPRING") return "Spring";
  if (s === "FALL") return "Fall";
  // Note: "Winter" is not a valid enum value in the database
  // Valid values are: Spring, SummerI, SummerII, Fall
  if (s === "WINTER") {
    throw new Error("Winter semester is not supported. Valid semesters are: Spring, SummerI, SummerII, Fall");
  }

  // default summer -> SummerI
  if (s === "SUMMER" || s === "SUMMERI" || s === "SUMMER1" || s === "SUMMERONE") return "SummerI";
  if (s === "SUMMERII" || s === "SUMMER2" || s === "SUMMERTWO") return "SummerII";

  return raw;
}

function normalizeSemesterForClient(raw) {
  const s = normUpper(raw).replace(/\s+/g, "");
  if (s === "SUMMERI" || s === "SUMMERII") return "Summer";
  if (s === "SPRING") return "Spring";
  if (s === "FALL") return "Fall";
  // Note: "Winter" is not a valid enum value in the database
  // We don't map it back to the client since it shouldn't exist in the DB
  return raw;
}

/**
 * SBC extraction (PATCHED):
 * - Handles arrays, JSON strings, comma/space separated strings, and "SBS+ HFA+" style.
 * - Filters to the known SBC list so stray tokens don't pollute results.
 */
function extractSbcCodes(sbcField) {
  if (!sbcField) return [];

  // If already an array, normalize directly
  if (Array.isArray(sbcField)) {
    return sbcField
      .map(normStr)
      .map(normUpper)
      .filter((c) => UNIVERSITY_GRAD_REQ.sbcs.includes(c));
  }

  // If it's an object, stringify and tokenize
  if (typeof sbcField === "object") {
    const text = JSON.stringify(sbcField);
    const up = normUpper(text).replace(/PARTIALLY FULFILLS:/gi, " ");
    const tokenRe = /[A-Z]{2,5}\+?/g;

    const out = new Set();
    for (const m of up.matchAll(tokenRe)) {
      const tok = m[0];
      if (UNIVERSITY_GRAD_REQ.sbcs.includes(tok)) out.add(tok);
    }
    return [...out];
  }

  const raw = normStr(sbcField);
  if (!raw) return [];

  // Try JSON parse if it's a JSON string
  try {
    const parsed = JSON.parse(raw);
    if (parsed != null && parsed !== raw) {
      return extractSbcCodes(parsed);
    }
  } catch (_) {}

  // Tokenize aggressively (handles "SBS+ HFA+" / "SBS+,HFA+" / etc.)
  const up = normUpper(raw).replace(/PARTIALLY FULFILLS:/gi, " ");
  const tokenRe = /[A-Z]{2,5}\+?/g;

  const out = new Set();
  for (const m of up.matchAll(tokenRe)) {
    const tok = m[0];
    if (UNIVERSITY_GRAD_REQ.sbcs.includes(tok)) out.add(tok);
  }
  return [...out];
}

function computeGpa(rows) {
  let num = 0;
  let denom = 0;
  let completed = 0;

  for (const r of rows) {
    const credits = Number(r.credits) || 0;
    if (!credits) continue;

    const g = normUpper(r.grade);
    if (!g) continue;

    if (isPassing(g)) completed += credits;

    if (GRADE_POINTS[g] != null) {
      num += GRADE_POINTS[g] * credits;
      denom += credits;
    }
  }

  return {
    totalCreditsCompleted: completed,
    attemptedCredits: denom,
    gpa: denom > 0 ? Number((num / denom).toFixed(3)) : null,
  };
}

function computeSbcSummary(rows) {
  const sbcMap = new Map(
    UNIVERSITY_GRAD_REQ.sbcs.map((c) => [c, { code: c, completedCourses: [], inProgressCourses: [] }])
  );

  for (const r of rows) {
    const codes = extractSbcCodes(r.sbc);
    const grade = normUpper(r.grade);

    const passed = grade && isPassing(grade);
    const inProg = !grade && isInProgressStatus(r.status);

    const courseMini = {
      subject: r.subject,
      courseNum: r.course_num,
      title: r.title,
      credits: r.credits,
      grade: grade || null,
    };

    for (const code of codes) {
      const entry = sbcMap.get(code);
      if (!entry) continue;
      if (passed) entry.completedCourses.push(courseMini);
      else if (inProg) entry.inProgressCourses.push(courseMini);
    }
  }

  return {
    minimumCredits: UNIVERSITY_GRAD_REQ.minimumCredits,
    sbcCategories: [...sbcMap.values()].map((cat) => ({
      ...cat,
      completed: (cat.completedCourses?.length || 0) > 0,
      inProgress: (cat.inProgressCourses?.length || 0) > 0,
      completedCourses: cat.completedCourses || [],
      inProgressCourses: cat.inProgressCourses || [],
    })),
  };
}

function safeJson(x) {
  if (!x) return null;
  if (typeof x === "object") return x;
  try {
    return JSON.parse(x);
  } catch {
    return null;
  }
}

function splitCourseCode(raw) {
  const s = normUpper(raw).replace(/\s+/g, "");
  const m = s.match(/^([A-Z]{2,6})(\d{2,4}[A-Z]?)$/);
  if (!m) return { subject: null, courseNum: null, code: s || null };
  return { subject: m[1], courseNum: m[2], code: `${m[1]}${m[2]}` };
}

function courseCodeFromRow(r) {
  const subj = normUpper(r?.subject);
  const num = normStr(r?.course_num);
  if (!subj || !num) return null;
  return `${subj}${num}`;
}

function inferSubjectDegreeType(programType, programCode, programName) {
  const text = `${normUpper(programCode)} ${normUpper(programName)}`.replace(/\s+/g, " ").trim();
  const cleaned = text.replace(/[^A-Z0-9]/g, "");

  let subject = null;
  const mSub = cleaned.match(/^([A-Z]{2,6})/);
  if (mSub) subject = mSub[1].slice(0, 3);

  let degreeType = null;
  if (programType === "minor") degreeType = "MIN";
  if (!degreeType) {
    if (cleaned.includes("BS")) degreeType = "BS";
    else if (cleaned.includes("BA")) degreeType = "BA";
    else {
      const mDeg = cleaned.match(/(BS|BA|MIN)$/);
      if (mDeg) degreeType = mDeg[1];
    }
  }

  return { subject: subject ? subject.toUpperCase() : null, degreeType: degreeType ? degreeType.toUpperCase() : null };
}

function bestMatchDegreeRequirements(drRows, programType, programCode, programName) {
  const codeU = normUpper(programCode);
  const nameU = normUpper(programName);
  const cleaned = `${codeU} ${nameU}`.trim().replace(/[^A-Z0-9]/g, "");

  let best = null;
  let bestScore = -1;

  for (const dr of drRows) {
    const drProgType = normLower(dr.program_type);
    if (programType && drProgType && drProgType !== programType) continue;

    const subj = normUpper(dr.subject);
    const deg = normUpper(dr.degree_type);

    let score = 0;
    if (subj && cleaned.startsWith(subj)) score += 8;
    else if (subj && cleaned.includes(subj)) score += 5;

    if (deg && cleaned.includes(deg)) score += 4;
    if (subj && deg && cleaned.includes(`${subj}${deg}`)) score += 6;

    if (programType === "minor" && deg === "MIN") score += 4;
    if (programType === "major" && (deg === "BS" || deg === "BA")) score += 2;

    if (score > bestScore) {
      bestScore = score;
      best = dr;
    }
  }

  if (bestScore <= 0) return null;
  return best;
}

// NOTE: expanded to include SummerI / SummerII while still allowing "Summer" in comparisons
const SEM_ORDER = { SPRING: 1, SUMMER: 2, SUMMERI: 2, SUMMERII: 3, FALL: 4, WINTER: 5 };
function semKey(semester) {
  return SEM_ORDER[normUpper(semester).replace(/\s+/g, "")] ?? 99;
}

// term label shown to frontend — keep "Summer {year}"
function termLabel(semester, year) {
  const semClient = normalizeSemesterForClient(semester) || "Unknown";
  const yr = Number(year) || null;
  return yr ? `${semClient} ${yr}` : semClient;
}

// supports "Summer 2026", "Summer I 2026", "SummerI 2026", "SummerII 2026"
function parseTermLabel(label) {
  const s = normStr(label);
  if (!s) return { semester: null, year: null };

  const m = s.match(/^(Spring|Summer|Fall|Winter)(?:\s*(I|II))?\s+(\d{4})$/i);
  if (m) {
    const sem = m[1];
    const year = Number(m[3]);
    return { semester: sem, year: Number.isFinite(year) ? year : null };
  }

  const parts = s.split(/\s+/);
  if (parts.length < 2) return { semester: null, year: null };
  const semester = parts[0];
  const year = Number(parts[1]);
  return { semester: semester || null, year: Number.isFinite(year) ? year : null };
}

function nextTerm(semester, year) {
  const sem = normUpper(normalizeSemesterForClient(semester)).replace(/\s+/g, "");
  const yr = Number(year) || new Date().getFullYear();

  const order = ["SPRING", "SUMMER", "FALL"];
  const idx = order.indexOf(sem);
  if (idx === -1) return { semester: "Spring", year: yr };

  const nextIdx = (idx + 1) % order.length;
  const nextYear = nextIdx === 0 ? yr + 1 : yr;
  const nextSem = order[nextIdx];

  return { semester: nextSem.charAt(0) + nextSem.slice(1).toLowerCase(), year: nextYear };
}

function defaultWorkloadLimit(semester) {
  const s = normUpper(semester).replace(/\s+/g, "");
  if (s === "SUMMER" || s === "SUMMERI" || s === "SUMMERII") return 0;
  return 15;
}

function termCompare(aSem, aYear, bSem, bYear) {
  const ay = Number(aYear) || 0;
  const by = Number(bYear) || 0;
  if (ay !== by) return ay - by;
  return semKey(aSem) - semKey(bSem);
}

function normalizePlanCourseCode(raw) {
  return normUpper(raw).replace(/\s+/g, "");
}

function parseGraduationTerm(raw) {
  const { semester, year } = parseTermLabel(raw);
  return { graduationSemester: semester, graduationYear: year };
}

async function resolveCourseLatest(db, codeRaw) {
  const parsed = splitCourseCode(codeRaw);
  if (!parsed.subject || !parsed.courseNum) return null;

  const { rows } = await db.query(
    `
    SELECT c.course_id, c.title, c.credits, c.sbc
    FROM public.courses c
    JOIN public.terms t ON c.catalog_term_id = t.term_id
    WHERE c.subject = $1 AND c.course_num = $2
    ORDER BY t.year DESC,
      CASE t.semester
        WHEN 'Spring' THEN 1
        WHEN 'SummerI' THEN 2
        WHEN 'SummerII' THEN 3
        WHEN 'Fall' THEN 4
        ELSE 99
      END DESC,
      c.course_id DESC
    LIMIT 1
    `,
    [parsed.subject, parsed.courseNum]
  );

  if (rows.length === 0) return null;
  return {
    courseId: rows[0].course_id,
    title: rows[0].title ?? "",
    credits: Number(rows[0].credits) || 0,
    sbc: rows[0].sbc ?? null,
    subject: parsed.subject,
    courseNum: parsed.courseNum,
    code: `${parsed.subject}${parsed.courseNum}`,
  };
}

async function loadSavedPlan(db, userId) {
  const { rows: planRows } = await db.query(
    `
    SELECT plan_id, graduation_semester, graduation_year
    FROM public.academic_plans
    WHERE user_id = $1
    `,
    [userId]
  );
  if (planRows.length === 0) return null;

  const plan = planRows[0];

  const { rows } = await db.query(
    `
    SELECT
      pt.plan_term_id,
      pt.semester,
      pt.year,
      pt.workload_limit,
      pt.sort_index,
      c.subject,
      c.course_num,
      c.title,
      apc.credits AS planned_credits
    FROM public.academic_plan_terms pt
    LEFT JOIN public.academic_plan_courses apc ON apc.plan_term_id = pt.plan_term_id
    LEFT JOIN public.courses c ON c.course_id = apc.course_id
    WHERE pt.plan_id = $1
    ORDER BY
      pt.sort_index ASC,
      pt.year ASC,
      CASE pt.semester
        WHEN 'Spring' THEN 1
        WHEN 'SummerI' THEN 2
        WHEN 'SummerII' THEN 3
        WHEN 'Fall' THEN 4
        ELSE 99
      END ASC,
      pt.plan_term_id ASC
    `,
    [plan.plan_id]
  );

  const termMap = new Map();
  for (const r of rows) {
    const semClient = normalizeSemesterForClient(r.semester);
    const key = `${semClient ?? ""} ${r.year ?? ""}`.trim();

    if (!termMap.has(key)) {
      termMap.set(key, {
        termLabel: termLabel(semClient, r.year),
        semester: semClient,
        year: r.year,
        termId: null,
        workloadLimit: Number(r.workload_limit) || defaultWorkloadLimit(semClient),
        locked: false,
        courses: [],
      });
    }

    if (r.subject && r.course_num) {
      const code = `${normUpper(r.subject)}${normStr(r.course_num)}`;
      termMap.get(key).courses.push({
        code,
        title: r.title ?? "",
        credits: Number(r.planned_credits) || 0,
        locked: false,
      });
    }
  }

  const terms = [...termMap.values()];

  return {
    planId: plan.plan_id,
    graduationSemester: normalizeSemesterForClient(plan.graduation_semester ?? null),
    graduationYear: plan.graduation_year ?? null,
    terms,
  };
}

async function getRequiredCourseCodes(db, userId) {
  // student programs
  const { rows: studentPrograms } = await db.query(
    `
    SELECT
      sp.program_id,
      sp.kind,
      p.code AS program_code,
      p.name AS program_name,
      p.type AS program_table_type
    FROM public.student_programs sp
    JOIN public.programs p ON p.program_id = sp.program_id
    WHERE sp.student_id = $1
    ORDER BY sp.program_id ASC
    `,
    [userId]
  );

  // degree_requirements rows
  const { rows: drRows } = await db.query(
    `
    SELECT id, subject, degree_type, program_type, degree_requirements
    FROM public.degree_requirements
    `
  );

  const chosenReqRows = [];
  for (const sp of studentPrograms || []) {
    const programType = normProgramType(sp.kind ?? sp.program_table_type);
    if (programType !== "major" && programType !== "minor") continue;

    const inf = inferSubjectDegreeType(programType, sp.program_code, sp.program_name);
    let dr = null;

    if (inf.subject && inf.degreeType) {
      dr =
        drRows.find(
          (r) =>
            normUpper(r.subject) === inf.subject &&
            normUpper(r.degree_type) === inf.degreeType &&
            normProgramType(r.program_type) === programType
        ) ||
        drRows.find((r) => normUpper(r.subject) === inf.subject && normUpper(r.degree_type) === inf.degreeType) ||
        null;
    }

    if (!dr) dr = bestMatchDegreeRequirements(drRows, programType, sp.program_code, sp.program_name);
    if (dr) chosenReqRows.push({ programType, dr });
  }

  const requiredCourseIdsSet = new Set();
  for (const x of chosenReqRows) {
    const obj = safeJson(x.dr?.degree_requirements) || {};
    const required = obj.required_courses ?? obj.requiredCourses ?? obj.required ?? [];
    const list = Array.isArray(required) ? required : [];
    for (const raw of list) {
      const code = splitCourseCode(raw).code;
      if (code) requiredCourseIdsSet.add(code);
    }
  }

  return { requiredCourseIdsSet, requiredCourseIds: [...requiredCourseIdsSet].sort() };
}

// -------------------------
// PREREQ HELPERS (validation)
// -------------------------

async function detectPrereqSource(db) {
  const t = await db.query(`SELECT to_regclass('public.course_prerequisites') AS reg`);
  if (t.rows?.[0]?.reg) {
    const cols = await db.query(
      `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema='public' AND table_name='course_prerequisites'
      `
    );
    const names = new Set((cols.rows || []).map((r) => r.column_name));
    const prereqCol =
      names.has("prereq_course_id") ? "prereq_course_id" :
      names.has("prerequisite_course_id") ? "prerequisite_course_id" :
      null;

    if (names.has("course_id") && prereqCol) return { kind: "table", prereqCol };
  }

  const c = await db.query(
    `
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name='courses'
    `
  );
  const cols = new Set((c.rows || []).map((r) => r.column_name));
  const candidate =
    cols.has("prerequisites") ? "prerequisites" :
    cols.has("prereq") ? "prereq" :
    cols.has("prereqs") ? "prereqs" :
    cols.has("prerequisite_text") ? "prerequisite_text" :
    cols.has("prerequisites_text") ? "prerequisites_text" :
    null;

  if (candidate) return { kind: "courses_col", col: candidate };
  return { kind: "none" };
}

function extractCourseCodesFromTextOrJson(val) {
  if (val == null) return [];
  const text = typeof val === "string" ? val : JSON.stringify(val);

  const re = /([A-Z]{2,6})\s*(\d{2,4}[A-Z]?)/g;
  const out = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    out.push(`${m[1]}${m[2]}`.toUpperCase());
  }
  return [...new Set(out)];
}

/**
 * Return groups: [ ["CSE214"], ["MAT125","MAT131"] ] meaning (CSE214) AND (MAT125 OR MAT131)
 * Heuristic for plain strings:
 *  - contains " OR " => one OR-group
 *  - contains " AND " => AND of singletons
 *  - otherwise => AND of singletons
 */
function prereqGroupsFromValue(val) {
  if (Array.isArray(val)) {
    const groups = [];
    for (const item of val) {
      if (Array.isArray(item)) {
        const codes = item.map((x) => normalizePlanCourseCode(x)).filter(Boolean);
        if (codes.length) groups.push([...new Set(codes)]);
      } else {
        const codes = extractCourseCodesFromTextOrJson(item).map(normalizePlanCourseCode).filter(Boolean);
        for (const c of codes) groups.push([c]);
      }
    }
    return groups;
  }

  if (val && typeof val === "object" && !Array.isArray(val)) {
    const keys = Object.keys(val);
    if (keys.some((k) => ["and", "all", "required"].includes(k))) {
      const k = keys.find((x) => ["and", "all", "required"].includes(x));
      return prereqGroupsFromValue(val[k]) || [];
    }
    if (keys.some((k) => ["or", "any"].includes(k))) {
      const k = keys.find((x) => ["or", "any"].includes(x));
      const codes = extractCourseCodesFromTextOrJson(val[k]).map(normalizePlanCourseCode).filter(Boolean);
      return codes.length ? [Array.from(new Set(codes))] : [];
    }
  }

  if (typeof val === "string") {
    const up = val.toUpperCase();
    const codes = extractCourseCodesFromTextOrJson(val).map(normalizePlanCourseCode).filter(Boolean);
    if (!codes.length) return [];

    if (up.includes(" OR ")) return [Array.from(new Set(codes))];
    // treat as AND by default
    return codes.map((c) => [c]);
  }

  const flat = extractCourseCodesFromTextOrJson(val).map(normalizePlanCourseCode).filter(Boolean);
  return flat.map((c) => [c]);
}

async function courseCodeById(db, courseId) {
  const { rows } = await db.query(
    `SELECT subject, course_num FROM public.courses WHERE course_id = $1 LIMIT 1`,
    [courseId]
  );
  if (!rows.length) return null;
  return `${normUpper(rows[0].subject)}${normStr(rows[0].course_num)}`;
}

async function getPrereqGroupsForCourse(db, prereqSource, courseId) {
  if (prereqSource.kind === "none") {
    throw new Error(
      "Cannot validate prerequisites: no prerequisite source found (expected public.course_prerequisites or a prereq column on public.courses)."
    );
  }

  if (prereqSource.kind === "table") {
    const { rows } = await db.query(
      `
      SELECT ${prereqSource.prereqCol} AS prereq_id
      FROM public.course_prerequisites
      WHERE course_id = $1
      `,
      [courseId]
    );
    const prereqIds = (rows || []).map((r) => r.prereq_id).filter(Boolean);
    if (!prereqIds.length) return [];

    const codes = [];
    for (const pid of prereqIds) {
      const code = await courseCodeById(db, pid);
      if (code) codes.push(code);
    }
    return codes.map((c) => [normalizePlanCourseCode(c)]);
  }

  const { rows } = await db.query(
    `SELECT ${prereqSource.col} AS prereq_val FROM public.courses WHERE course_id = $1 LIMIT 1`,
    [courseId]
  );
  if (!rows.length) return [];
  const val = rows[0].prereq_val;

  let parsed = val;
  if (typeof val === "string") {
    try {
      parsed = JSON.parse(val);
    } catch (_) {}
  }

  return prereqGroupsFromValue(parsed);
}

/**
 * OFFERING CHECK (by subject/course_num, NOT by course_id)
 * Rule:
 *  - must exist for exact semester+year, OR
 *  - exists for same semester in any other year
 */
async function checkOfferingByCode(db, subject, courseNum, semesterClient, year) {
  const semesterDb = normalizeSemesterForDb(semesterClient);

  const exact = await db.query(
    `
    SELECT 1
    FROM public.class_sections cs
    JOIN public.terms t ON t.term_id = cs.term_id
    JOIN public.courses c ON c.course_id = cs.course_id
    WHERE c.subject = $1
      AND c.course_num = $2
      AND t.semester = $3
      AND t.year = $4
    LIMIT 1
    `,
    [subject, courseNum, semesterDb, Number(year)]
  );
  if (exact.rows.length) return { ok: true, mode: "exact" };

  const any = await db.query(
    `
    SELECT t.year
    FROM public.class_sections cs
    JOIN public.terms t ON t.term_id = cs.term_id
    JOIN public.courses c ON c.course_id = cs.course_id
    WHERE c.subject = $1
      AND c.course_num = $2
      AND t.semester = $3
    ORDER BY t.year DESC
    LIMIT 1
    `,
    [subject, courseNum, semesterDb]
  );

  if (any.rows.length) return { ok: true, mode: "same_semester_other_year", exampleYear: any.rows[0].year };
  return { ok: false, mode: "not_found" };
}

// -------------------------
// GET /prefill
// -------------------------
router.get("/prefill", async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ ok: false, error: "Not authenticated" });

  try {
    const db = req.db;

    const guard = await ensureStudent(db, userId);
    if (!guard.ok) return res.status(guard.status).json({ ok: false, error: guard.error });

    // enrollments + term info
    const { rows: enrRaw } = await db.query(
      `
      SELECT
        e.grade,
        e.status,
        c.subject,
        c.course_num,
        c.title,
        c.credits,
        c.sbc,
        t.term_id,
        t.semester,
        t.year
      FROM public.enrollments e
      JOIN public.class_sections cs ON e.class_id = cs.class_id
      JOIN public.courses c ON cs.course_id = c.course_id
      LEFT JOIN public.terms t ON cs.term_id = t.term_id
      WHERE e.student_id = $1
      `,
      [userId]
    );

    const enrollments = (enrRaw || []).map((r) => ({
      ...r,
      grade: normUpper(r.grade) || null,
      status: r.status ?? null,
      subject: normUpper(r.subject) || null,
      course_num: normStr(r.course_num) || null,
      title: r.title ?? "",
      credits: r.credits ?? null,
      semester: normalizeSemesterForClient(r.semester ?? null),
      year: r.year ?? null,
    }));

    const overview = computeGpa(enrollments);
    const sbcRequirements = computeSbcSummary(enrollments);

    const passedCodes = new Set(
      enrollments
        .filter((r) => r.grade && isPassing(r.grade))
        .map((r) => courseCodeFromRow(r))
        .filter(Boolean)
    );

    const { requiredCourseIdsSet, requiredCourseIds } = await getRequiredCourseCodes(db, userId);

    const missingRequired = requiredCourseIds.filter((c) => !passedCodes.has(c));
    const satisfiedRequired = requiredCourseIds.filter((c) => passedCodes.has(c));

    // group enrollments into locked terms
    const lockedTermMap = new Map();
    for (const r of enrollments) {
      const sem = r.semester ?? "Unknown";
      const yr = r.year ?? null;
      const label = termLabel(sem, yr);

      if (!lockedTermMap.has(label)) {
        lockedTermMap.set(label, {
          termLabel: label,
          semester: sem,
          year: yr,
          termId: r.term_id ?? null,
          workloadLimit: defaultWorkloadLimit(sem),
          locked: true,
          courses: [],
        });
      }

      const code = courseCodeFromRow(r) || null;
      lockedTermMap.get(label).courses.push({
        code,
        subject: r.subject ?? null,
        courseNum: r.course_num ?? null,
        title: r.title ?? "",
        credits: Number(r.credits) || 0,
        grade: r.grade ?? null,
        status: r.status ?? null,
        locked: true,
        required: code ? requiredCourseIdsSet.has(code) : false,
      });
    }

    const planTermsLocked = [...lockedTermMap.values()].sort((a, b) => {
      const ay = Number(a.year) || 0;
      const by = Number(b.year) || 0;
      if (ay !== by) return ay - by;
      return semKey(a.semester) - semKey(b.semester);
    });

    let lastLocked = { semester: "Fall", year: new Date().getFullYear() };
    if (planTermsLocked.length > 0) {
      const last = planTermsLocked[planTermsLocked.length - 1];
      lastLocked = { semester: last.semester ?? "Fall", year: Number(last.year) || new Date().getFullYear() };
    }

    const saved = await loadSavedPlan(db, userId);

    const FUTURE_TERM_COUNT = 8;
    let planTermsFuture = [];

    if (saved?.terms?.length) {
      planTermsFuture = saved.terms
        .filter((t) => termCompare(lastLocked.semester, lastLocked.year, t.semester, t.year) < 0)
        .filter((t) => !lockedTermMap.has(t.termLabel))
        .map((t) => ({
          ...t,
          locked: false,
          workloadLimit: Number(t.workloadLimit) || defaultWorkloadLimit(t.semester),
          courses: (t.courses || []).map((c) => {
            const code = normalizePlanCourseCode(c.code);
            return { ...c, code, locked: false, required: requiredCourseIdsSet.has(code) };
          }),
        }));

      let lastSem = planTermsFuture.length ? planTermsFuture[planTermsFuture.length - 1].semester : lastLocked.semester;
      let lastYear = planTermsFuture.length ? Number(planTermsFuture[planTermsFuture.length - 1].year) || lastLocked.year : lastLocked.year;

      while (planTermsFuture.length < FUTURE_TERM_COUNT) {
        const nxt = nextTerm(lastSem, lastYear);
        const label = termLabel(nxt.semester, nxt.year);

        if (!lockedTermMap.has(label) && !planTermsFuture.some((x) => x.termLabel === label)) {
          planTermsFuture.push({
            termLabel: label,
            semester: nxt.semester,
            year: nxt.year,
            termId: null,
            workloadLimit: defaultWorkloadLimit(nxt.semester),
            locked: false,
            courses: [],
          });
        }

        lastSem = nxt.semester;
        lastYear = nxt.year;
      }
    } else {
      let cur = nextTerm(lastLocked.semester, lastLocked.year);
      for (let i = 0; i < FUTURE_TERM_COUNT; i++) {
        const label = termLabel(cur.semester, cur.year);
        planTermsFuture.push({
          termLabel: label,
          semester: cur.semester,
          year: cur.year,
          termId: null,
          workloadLimit: defaultWorkloadLimit(cur.semester),
          locked: false,
          courses: [],
        });
        cur = nextTerm(cur.semester, cur.year);
      }
    }

    const planTerms = [...planTermsLocked, ...planTermsFuture];

    const graduationTermLabel =
      saved?.graduationSemester && saved?.graduationYear
        ? `${saved.graduationSemester} ${saved.graduationYear}`
        : (planTermsFuture.length ? planTermsFuture[planTermsFuture.length - 1].termLabel : "");

    return res.json({
      ok: true,
      overview: { ...overview, totalCreditsRequired: UNIVERSITY_GRAD_REQ.minimumCredits },
      sbcRequirements,
      requiredSummary: {
        requiredCourseIds,
        satisfiedRequired,
        missingRequired,
      },
      graduationTerm: graduationTermLabel,
      planTerms,
    });
  } catch (err) {
    console.error("[schedule-plan] GET /prefill failed:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// -------------------------
// POST /save
// -------------------------
router.post("/save", async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ ok: false, error: "Not authenticated" });

  const db = req.db;

  try {
    const guard = await ensureStudent(db, userId);
    if (!guard.ok) return res.status(guard.status).json({ ok: false, error: guard.error });

    const body = req.body || {};
    const planTermsRaw = Array.isArray(body.planTerms) ? body.planTerms : [];
    const graduationTermRaw = normStr(body.graduationTerm);

    const editableTerms = planTermsRaw
      .filter((t) => !t?.locked)
      .map((t, idx) => {
        const label = normStr(t.termLabel);
        const parsed = parseTermLabel(label);

        const semClient = normStr(t.semester) || parsed.semester;
        const yr = Number(t.year) || parsed.year;

        return {
          sortIndex: idx,
          termLabel: label || termLabel(semClient, yr),
          semesterClient: semClient || null,
          year: Number.isFinite(yr) ? yr : null,
          workloadLimit: Number(t.workloadLimit) || 0,
          courses: Array.isArray(t.courses) ? t.courses : [],
        };
      })
      .filter((t) => t.semesterClient && t.year);

    const { graduationSemester, graduationYear } = parseGraduationTerm(graduationTermRaw);
    const graduationSemesterDb = normalizeSemesterForDb(graduationSemester);

    await db.query("BEGIN");

    const { rows: upRows } = await db.query(
      `
      INSERT INTO public.academic_plans (user_id, graduation_semester, graduation_year)
      VALUES ($1, $2, $3)
      ON CONFLICT (user_id)
      DO UPDATE SET
        graduation_semester = EXCLUDED.graduation_semester,
        graduation_year = EXCLUDED.graduation_year,
        updated_at = now()
      RETURNING plan_id
      `,
      [userId, graduationSemesterDb, graduationYear]
    );

    const planId = upRows[0]?.plan_id;
    if (!planId) throw new Error("Failed to create/update plan");

    await db.query(`DELETE FROM public.academic_plan_terms WHERE plan_id = $1`, [planId]);

    for (const t of editableTerms) {
      const semesterDb = normalizeSemesterForDb(t.semesterClient);

      const { rows: termRows } = await db.query(
        `
        INSERT INTO public.academic_plan_terms (plan_id, semester, year, workload_limit, sort_index)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING plan_term_id
        `,
        [
          planId,
          semesterDb,
          t.year,
          Number(t.workloadLimit) || defaultWorkloadLimit(t.semesterClient),
          Number(t.sortIndex) || 0,
        ]
      );

      const planTermId = termRows[0]?.plan_term_id;
      if (!planTermId) throw new Error("Failed inserting plan term");

      const seenCodes = new Set();
      for (const c of t.courses || []) {
        if (c?.locked) continue;
        const code = normalizePlanCourseCode(c?.code || c?.id || c?.name || "");
        if (!code) continue;
        if (seenCodes.has(code)) continue;
        seenCodes.add(code);

        const resolved = await resolveCourseLatest(db, code);
        if (!resolved) throw new Error(`Unknown course code: ${code}`);

        const credits = Number(c?.credits);
        const useCredits = Number.isFinite(credits) && credits >= 0 ? credits : resolved.credits;

        await db.query(
          `
          INSERT INTO public.academic_plan_courses (plan_term_id, course_id, credits)
          VALUES ($1, $2, $3)
          `,
          [planTermId, resolved.courseId, useCredits]
        );
      }
    }

    await db.query("COMMIT");

    return res.json({
      ok: true,
      message: "Plan saved successfully",
      planId,
      savedEditableTerms: editableTerms.length,
    });
  } catch (err) {
    try { await db.query("ROLLBACK"); } catch (_) {}
    console.error("[schedule-plan] POST /save failed:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// -------------------------
// Shared term helpers (validate + autoplan)
// -------------------------
function termSortKey(t) {
  const y = Number(t.year) || 0;
  const s = semKey(t.semester);
  return y * 100 + s;
}

function parseTermFromAny(term) {
  const label = normStr(term?.termLabel);
  const parsed = parseTermLabel(label);
  const semester = normStr(term?.semester) || parsed.semester || null;
  const year = Number(term?.year) || parsed.year || null;
  return {
    termLabel: label || (semester && year ? termLabel(semester, year) : ""),
    semester,
    year,
  };
}

function addSbcHits(sbcSet, sbcField) {
  const codes = extractSbcCodes(sbcField);
  for (const c of codes) sbcSet.add(normStr(c));
}

// -------------------------
// POST /validate
// -------------------------
router.post("/validate", async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ ok: false, error: "Not authenticated" });

  const db = req.db;

  try {
    const guard = await ensureStudent(db, userId);
    if (!guard.ok) return res.status(guard.status).json({ ok: false, error: guard.error });

    const body = req.body || {};
    const planTermsRaw = Array.isArray(body.planTerms) ? body.planTerms : [];
    const graduationTermRaw = normStr(body.graduationTerm);

    const gradParsed = graduationTermRaw ? parseTermLabel(graduationTermRaw) : { semester: null, year: null };
    const gradSem = gradParsed.semester;
    const gradYear = gradParsed.year;

    // enrollment baseline
    const { rows: enrRaw } = await db.query(
      `
      SELECT
        e.grade,
        e.status,
        c.subject,
        c.course_num,
        c.credits,
        c.sbc,
        t.semester,
        t.year
      FROM public.enrollments e
      JOIN public.class_sections cs ON e.class_id = cs.class_id
      JOIN public.courses c ON cs.course_id = c.course_id
      LEFT JOIN public.terms t ON cs.term_id = t.term_id
      WHERE e.student_id = $1
      `,
      [userId]
    );

    // satisfied baseline = passed + in-progress
    const satisfied = new Set();
    // credits/sbc tracking for graduation check
    const countedCodesForGrad = new Set();
    let creditsPlanned = 0;
    const sbcSatisfied = new Set();

    for (const r of enrRaw || []) {
      const code = `${normUpper(r.subject)}${normStr(r.course_num)}`;
      const grade = normUpper(r.grade);
      const status = r.status ?? null;

      const semClient = normalizeSemesterForClient(r.semester ?? null);
      const yr = Number(r.year) || null;

      // If graduation term exists, only count enrollments up to grad term (when term data exists)
      if (gradSem && gradYear && semClient && yr) {
        if (termCompare(semClient, yr, gradSem, gradYear) > 0) continue;
      }

      if (grade && isPassing(grade)) satisfied.add(code);
      else if (!grade && isInProgressStatus(status)) satisfied.add(code);

      // For graduation check, count passed + in-progress as part of "taken + plan"
      if ((grade && isPassing(grade)) || (!grade && isInProgressStatus(status))) {
        if (!countedCodesForGrad.has(code)) {
          countedCodesForGrad.add(code);
          creditsPlanned += Number(r.credits) || 0;
          addSbcHits(sbcSatisfied, r.sbc);
        }
      }
    }

    // normalize/clip plan terms to graduation
    let terms = planTermsRaw
      .map((t) => {
        const parsed = parseTermFromAny(t);
        return {
          ...t,
          termLabel: parsed.termLabel,
          semester: parsed.semester,
          year: parsed.year,
          courses: Array.isArray(t.courses) ? t.courses : [],
        };
      })
      .filter((t) => t.semester && t.year);

    if (gradSem && gradYear) {
      terms = terms.filter((t) => termCompare(t.semester, t.year, gradSem, gradYear) <= 0);
    }

    terms.sort((a, b) => termSortKey(a) - termSortKey(b));

    const prereqSource = await detectPrereqSource(db);

    const resolveCache = new Map(); // code -> resolved latest course object
    const issues = [];
    const warnings = [];

    for (const term of terms) {
      const termCodesThisTerm = [];

      for (const course of term.courses || []) {
        const code = normalizePlanCourseCode(course?.code || course?.id || course?.name || "");
        if (!code) continue;

        const isLockedCourse = !!course?.locked;
        // skip prereq / offering validation for locked courses
        if (isLockedCourse) {
          termCodesThisTerm.push(code);
          continue;
        }

        const parsedCode = splitCourseCode(code);
        if (!parsedCode.subject || !parsedCode.courseNum) {
          issues.push({
            type: "UNKNOWN_COURSE",
            termLabel: term.termLabel,
            courseCode: code,
            message: `Unknown course code format: ${code}`,
          });
          continue;
        }

        let resolved = resolveCache.get(code);
        if (resolved === undefined) {
          resolved = await resolveCourseLatest(db, code);
          resolveCache.set(code, resolved || null);
        }
        if (!resolved) {
          issues.push({
            type: "UNKNOWN_COURSE",
            termLabel: term.termLabel,
            courseCode: code,
            message: `Unknown course code: ${code}`,
          });
          continue;
        }

        // RULE 2: offering check (only for planner-added courses)
        const offering = await checkOfferingByCode(db, parsedCode.subject, parsedCode.courseNum, term.semester, term.year);
        if (!offering.ok) {
          issues.push({
            type: "NOT_OFFERED",
            termLabel: term.termLabel,
            courseCode: code,
            message: `${code} is not offered in ${term.termLabel}, and no historical offering exists for the same semester in other years.`,
          });
        } else if (offering.mode === "same_semester_other_year") {
          warnings.push(`${code} not found for ${term.termLabel}, but exists in the same semester in year ${offering.exampleYear} (allowed).`);
        }

        // RULE 1: prerequisites must be satisfied BEFORE this term (only for planner-added courses)
        const prereqGroups = await getPrereqGroupsForCourse(db, prereqSource, resolved.courseId);
        for (const group of prereqGroups) {
          const ok = group.some((opt) => satisfied.has(opt));
          if (!ok) {
            issues.push({
              type: "PREREQ_MISSING",
              termLabel: term.termLabel,
              courseCode: code,
              message: `Missing prerequisite(s) for ${code}: need one of [${group.join(", ")}] completed before this term.`,
            });
          }
        }

        termCodesThisTerm.push(code);

        // graduation credit/sbc tracking from plan (count once)
        if (!countedCodesForGrad.has(code)) {
          countedCodesForGrad.add(code);
          const cCredits = Number(course?.credits);
          creditsPlanned += Number.isFinite(cCredits) && cCredits >= 0 ? cCredits : (Number(resolved.credits) || 0);
          addSbcHits(sbcSatisfied, resolved.sbc);
        }
      }

      // RULE: workload limit must not be exceeded (editable terms only)
      if (!term.locked) {
        const wl = Number(term.workloadLimit) || 0;
        const total = (term.courses || [])
          .filter((c) => !c?.locked)
          .reduce((s, c) => s + (Number(c?.credits ?? 0) || 0), 0);

        if (wl <= 0 && total > 0) {
          issues.push({
            type: "WORKLOAD_EXCEEDED",
            termLabel: term.termLabel,
            courseCode: "",
            message: `Workload limit is ${wl}, but term has ${total} planned credits.`,
          });
        } else if (total > wl + 1e-9) {
          issues.push({
            type: "WORKLOAD_EXCEEDED",
            termLabel: term.termLabel,
            courseCode: "",
            message: `Workload limit is ${wl}, but term has ${total} planned credits.`,
          });
        }
      }

      // After validating term, add courses to satisfied (so same-term prereqs do NOT count)
      for (const c of termCodesThisTerm) satisfied.add(c);
    }

    if (issues.length) {
      return res.status(400).json({
        ok: false,
        error: "Plan is not valid.",
        issues,
        warnings,
      });
    }

    // -------------------------
    // GRADUATION CHECK (only after plan validity)
    // -------------------------
    const { requiredCourseIds } = await getRequiredCourseCodes(db, userId);

    const missingRequired = requiredCourseIds.filter((c) => !countedCodesForGrad.has(c));

    // SBC missing categories (simple rule: at least one course hits category)
    const missingSbcCategories = UNIVERSITY_GRAD_REQ.sbcs.filter((cat) => !sbcSatisfied.has(cat));

    const totalCreditsRequired = UNIVERSITY_GRAD_REQ.minimumCredits;
    const creditsMissing = Math.max(0, totalCreditsRequired - Math.round(creditsPlanned * 10) / 10);

    const graduationOk =
      missingRequired.length === 0 &&
      missingSbcCategories.length === 0 &&
      creditsMissing <= 0;

    return res.json({
      ok: true,
      warnings,
      graduationOk,
      graduationSummary: {
        totalCreditsRequired,
        creditsPlanned: Math.round(creditsPlanned * 10) / 10,
        creditsMissing,
        missingRequired,
        missingSbcCategories,
      },
    });
  } catch (err) {
    console.error("[schedule-plan] POST /validate failed:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// -------------------------
// POST /auto-plan (greedy)
// -------------------------
function prereqsSatisfied(prereqGroups, satisfiedSet) {
  for (const group of prereqGroups || []) {
    const ok = (group || []).some((code) => satisfiedSet.has(normalizePlanCourseCode(code)));
    if (!ok) return false;
  }
  return true;
}

function normalizeIncomingTerms(planTermsRaw) {
  const out = [];
  for (const t of Array.isArray(planTermsRaw) ? planTermsRaw : []) {
    const parsed = parseTermFromAny(t);
    if (!parsed.semester || !parsed.year) continue;

    out.push({
      ...t,
      termLabel: parsed.termLabel || termLabel(parsed.semester, parsed.year),
      semester: parsed.semester,
      year: parsed.year,
      workloadLimit: Number(t?.workloadLimit) || 0,
      locked: !!t?.locked,
      courses: Array.isArray(t?.courses) ? t.courses : [],
    });
  }

  const seen = new Set();
  const deduped = [];
  for (const t of out) {
    const key = `${normUpper(t.semester)}-${Number(t.year)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(t);
  }

  deduped.sort((a, b) => termSortKey(a) - termSortKey(b));
  return deduped;
}

/**
 * ensureTermsThrough (PATCHED): takes an explicit maxYear guard instead of hard-coded 2035.
 */
function ensureTermsThrough(terms, targetSem, targetYear, maxYear = 2035) {
  const tgtLabel = termLabel(targetSem, targetYear);

  if (terms.some((t) => normStr(t.termLabel) === normStr(tgtLabel))) return terms;

  if (!terms.length) {
    return [
      {
        termLabel: tgtLabel,
        semester: targetSem,
        year: targetYear,
        workloadLimit: defaultWorkloadLimit(targetSem),
        locked: false,
        courses: [],
      },
    ];
  }

  let last = terms[terms.length - 1];
  let curSem = last.semester;
  let curYear = last.year;

  while (termCompare(curSem, curYear, targetSem, targetYear) < 0) {
    const nxt = nextTerm(curSem, curYear);
    const label = termLabel(nxt.semester, nxt.year);

    if (!terms.some((t) => normStr(t.termLabel) === normStr(label))) {
      terms.push({
        termLabel: label,
        semester: nxt.semester,
        year: nxt.year,
        workloadLimit: defaultWorkloadLimit(nxt.semester),
        locked: false,
        courses: [],
      });
    }

    curSem = nxt.semester;
    curYear = nxt.year;

    if ((Number(curYear) || 0) > maxYear) break;
  }

  terms.sort((a, b) => termSortKey(a) - termSortKey(b));
  return terms;
}

async function loadEnrollmentBaselineForAuto(db, userId, gradSem, gradYear) {
  const { rows: enrRaw } = await db.query(
    `
    SELECT
      e.grade,
      e.status,
      c.subject,
      c.course_num,
      c.credits,
      c.sbc,
      t.semester,
      t.year
    FROM public.enrollments e
    JOIN public.class_sections cs ON e.class_id = cs.class_id
    JOIN public.courses c ON cs.course_id = c.course_id
    LEFT JOIN public.terms t ON cs.term_id = t.term_id
    WHERE e.student_id = $1
    `,
    [userId]
  );

  const satisfied = new Set();
  const countedCodesForGrad = new Set();
  const sbcSatisfied = new Set();
  let creditsPlanned = 0;

  for (const r of enrRaw || []) {
    const code = `${normUpper(r.subject)}${normStr(r.course_num)}`;
    const grade = normUpper(r.grade);
    const status = r.status ?? null;

    const semClient = normalizeSemesterForClient(r.semester ?? null);
    const yr = Number(r.year) || null;

    if (gradSem && gradYear && semClient && yr) {
      if (termCompare(semClient, yr, gradSem, gradYear) > 0) continue;
    }

    const pass = grade && isPassing(grade);
    const inProg = !grade && isInProgressStatus(status);

    if (pass || inProg) satisfied.add(code);

    if (pass || inProg) {
      if (!countedCodesForGrad.has(code)) {
        countedCodesForGrad.add(code);
        creditsPlanned += Number(r.credits) || 0;
        addSbcHits(sbcSatisfied, r.sbc);
      }
    }
  }

  return { satisfied, countedCodesForGrad, sbcSatisfied, creditsPlanned };
}

async function getOfferedSemestersForCode(db, subject, courseNum) {
  const { rows } = await db.query(
    `
    SELECT DISTINCT t.semester
    FROM public.class_sections cs
    JOIN public.terms t ON t.term_id = cs.term_id
    JOIN public.courses c ON c.course_id = cs.course_id
    WHERE c.subject = $1 AND c.course_num = $2
    `,
    [subject, courseNum]
  );

  const set = new Set();
  for (const r of rows || []) {
    const semClient = normalizeSemesterForClient(r.semester);
    if (semClient) set.add(normUpper(semClient));
  }
  return set;
}

async function getSemesterPool(db, semesterClient) {
  const semDb = normalizeSemesterForDb(semesterClient);

  const semDbList =
    normUpper(semesterClient).startsWith("SUMMER") ? ["SummerI", "SummerII"] : [semDb];

  const { rows } = await db.query(
    `
    SELECT DISTINCT ON (c.subject, c.course_num)
      c.course_id, c.subject, c.course_num, c.title, c.credits, c.sbc,
      t.year
    FROM public.class_sections cs
    JOIN public.terms t ON t.term_id = cs.term_id
    JOIN public.courses c ON c.course_id = cs.course_id
    WHERE t.semester = ANY($1)
    ORDER BY c.subject, c.course_num, t.year DESC, c.course_id DESC
    `,
    [semDbList]
  );

  return (rows || []).map((r) => ({
    courseId: r.course_id,
    subject: normUpper(r.subject),
    courseNum: normStr(r.course_num),
    code: `${normUpper(r.subject)}${normStr(r.course_num)}`,
    title: r.title ?? "",
    credits: Number(r.credits) || 0,
    sbc: r.sbc ?? null,
  }));
}

function computeCompletionState(requiredCourseIds, countedCodesForGrad, sbcSatisfied, creditsPlanned) {
  const missingRequired = (requiredCourseIds || []).filter((c) => !countedCodesForGrad.has(c));
  const missingSbcCategories = UNIVERSITY_GRAD_REQ.sbcs.filter((cat) => !sbcSatisfied.has(cat));
  const totalCreditsRequired = UNIVERSITY_GRAD_REQ.minimumCredits;
  const creditsMissing = Math.max(0, totalCreditsRequired - Math.round(creditsPlanned * 10) / 10);

  return {
    missingRequired,
    missingSbcCategories,
    totalCreditsRequired,
    creditsPlanned: Math.round(creditsPlanned * 10) / 10,
    creditsMissing,
    graduationOk: missingRequired.length === 0 && missingSbcCategories.length === 0 && creditsMissing <= 0,
  };
}

async function persistGeneratedPlan(db, userId, graduationTermLabel, planTerms) {
  const { graduationSemester, graduationYear } = parseGraduationTerm(normStr(graduationTermLabel));
  const graduationSemesterDb = normalizeSemesterForDb(graduationSemester);

  const editableTerms = (planTerms || [])
    .filter((t) => !t?.locked)
    .map((t, idx) => ({
      sortIndex: idx,
      semesterClient: normStr(t.semester),
      year: Number(t.year),
      workloadLimit: Number(t.workloadLimit) || defaultWorkloadLimit(t.semester),
      courses: Array.isArray(t.courses) ? t.courses : [],
    }))
    .filter((t) => t.semesterClient && t.year);

  await db.query("BEGIN");

  const { rows: upRows } = await db.query(
    `
    INSERT INTO public.academic_plans (user_id, graduation_semester, graduation_year)
    VALUES ($1, $2, $3)
    ON CONFLICT (user_id)
    DO UPDATE SET
      graduation_semester = EXCLUDED.graduation_semester,
      graduation_year = EXCLUDED.graduation_year,
      updated_at = now()
    RETURNING plan_id
    `,
    [userId, graduationSemesterDb, graduationYear]
  );

  const planId = upRows[0]?.plan_id;
  if (!planId) throw new Error("Failed to create/update plan");

  await db.query(`DELETE FROM public.academic_plan_terms WHERE plan_id = $1`, [planId]);

  for (const t of editableTerms) {
    const semesterDb = normalizeSemesterForDb(t.semesterClient);

    const { rows: termRows } = await db.query(
      `
      INSERT INTO public.academic_plan_terms (plan_id, semester, year, workload_limit, sort_index)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING plan_term_id
      `,
      [planId, semesterDb, t.year, t.workloadLimit, t.sortIndex]
    );

    const planTermId = termRows[0]?.plan_term_id;
    if (!planTermId) throw new Error("Failed inserting plan term");

    const seen = new Set();
    for (const c of t.courses || []) {
      const code = normalizePlanCourseCode(c?.code || "");
      if (!code) continue;
      if (seen.has(code)) continue;
      seen.add(code);

      const resolved = await resolveCourseLatest(db, code);
      if (!resolved) throw new Error(`Unknown course code in auto-plan: ${code}`);

      const credits = Number(c?.credits);
      const useCredits = Number.isFinite(credits) && credits >= 0 ? credits : (Number(resolved.credits) || 0);

      await db.query(
        `
        INSERT INTO public.academic_plan_courses (plan_term_id, course_id, credits)
        VALUES ($1, $2, $3)
        `,
        [planTermId, resolved.courseId, useCredits]
      );
    }
  }

  await db.query("COMMIT");
  return { planId };
}

router.post("/auto-plan", async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ ok: false, error: "Not authenticated" });

  const db = req.db;

  try {
    const guard = await ensureStudent(db, userId);
    if (!guard.ok) return res.status(guard.status).json({ ok: false, error: guard.error });

    const body = req.body || {};
    const graduationTermRaw = normStr(body.graduationTerm);
    if (!graduationTermRaw) {
      return res.status(400).json({ ok: false, error: "graduationTerm is required for auto-planner." });
    }

    const gradParsed = parseTermLabel(graduationTermRaw);
    const requestedGradSem = gradParsed.semester;
    const requestedGradYear = gradParsed.year;
    if (!requestedGradSem || !requestedGradYear) {
      return res.status(400).json({ ok: false, error: `Invalid graduationTerm: "${graduationTermRaw}"` });
    }

    // PATCHED: dynamic horizon (prevents hard failure at 2030)
    const HORIZON_YEAR = Math.max(2030, (Number(requestedGradYear) || 0) + 4);

    const options = body.options || {};
    const desiredSet = new Set((options.desiredCourses || []).map(normalizePlanCourseCode).filter(Boolean));
    const avoidSet = new Set((options.avoidCourses || []).map(normalizePlanCourseCode).filter(Boolean));
    const workloadOverrides = options.workloadOverrides || {}; // { "CSE360": 4, ... }

    let terms = normalizeIncomingTerms(body.planTerms || []);
    terms = ensureTermsThrough(terms, requestedGradSem, requestedGradYear, HORIZON_YEAR);

    // wipe editable courses (auto-plan from scratch, keep workload limits)
    for (const t of terms) {
      if (!t.locked) t.courses = [];
    }

    const baseline = await loadEnrollmentBaselineForAuto(db, userId, requestedGradSem, requestedGradYear);

    const prereqSource = await detectPrereqSource(db);
    const { requiredCourseIds } = await getRequiredCourseCodes(db, userId);

    const reqInfo = new Map();
    const prereqCacheByCourseId = new Map();

    for (const code of requiredCourseIds) {
      const resolved = await resolveCourseLatest(db, code);
      if (!resolved) continue;

      let prereqGroups = prereqCacheByCourseId.get(resolved.courseId);
      if (prereqGroups === undefined) {
        prereqGroups = await getPrereqGroupsForCourse(db, prereqSource, resolved.courseId);
        prereqCacheByCourseId.set(resolved.courseId, prereqGroups);
      }

      const offeredSemSet = await getOfferedSemestersForCode(db, resolved.subject, resolved.courseNum);

      reqInfo.set(code, {
        code,
        courseId: resolved.courseId,
        title: resolved.title ?? "",
        credits: Number(resolved.credits) || 0,
        sbc: resolved.sbc ?? null,
        prereqGroups,
        offeredSemSet,
      });
    }

    const satisfiedForPrereqs = new Set(baseline.satisfied);
    const countedForGrad = new Set(baseline.countedCodesForGrad);
    const sbcSatisfied = new Set(baseline.sbcSatisfied);
    let creditsPlanned = Number(baseline.creditsPlanned) || 0;

    let completionTermLabel = null;

    const semesterPoolCache = new Map();

    const addPlannedCourse = async (term, courseMini) => {
      const code = normalizePlanCourseCode(courseMini.code);
      if (!code) return false;
      if (countedForGrad.has(code)) return false;

      countedForGrad.add(code);
      const credits = Number(courseMini.credits) || 0;
      creditsPlanned += credits;

      if (courseMini.sbc != null) addSbcHits(sbcSatisfied, courseMini.sbc);

      term.courses.push({
        code,
        title: courseMini.title ?? "",
        credits,
        locked: false,
      });

      return true;
    };

    const MAX_YEAR = HORIZON_YEAR;

    let i = 0;
    while (true) {
      if (i >= terms.length) {
        const last = terms[terms.length - 1];
        const nxt = nextTerm(last.semester, last.year);
        if ((Number(nxt.year) || 0) > MAX_YEAR) break;
        terms.push({
          termLabel: termLabel(nxt.semester, nxt.year),
          semester: nxt.semester,
          year: nxt.year,
          workloadLimit: defaultWorkloadLimit(nxt.semester),
          locked: false,
          courses: [],
        });
      }

      const term = terms[i];

      if (term.locked) {
        i++;
        continue;
      }

      const wl = Number(term.workloadLimit) || 0;
      if (wl <= 0) {
        i++;
        continue;
      }

      let used = 0;
      const termCodesThisTerm = [];

      // 1) Fill required first
      const missingRequiredNow = requiredCourseIds.filter((c) => !countedForGrad.has(c));

      const reqCandidates = [];
      for (const code of missingRequiredNow) {
        const info = reqInfo.get(code);
        if (!info) continue;

        const semKeyU = normUpper(term.semester);
        if (!info.offeredSemSet.has(semKeyU)) continue;

        if (!prereqsSatisfied(info.prereqGroups, satisfiedForPrereqs)) continue;

        const override = Number(workloadOverrides[code]);
        const cCredits = Number.isFinite(override) && override > 0 ? override : (Number(info.credits) || 0);

        if (cCredits <= 0) continue;
        if (used + cCredits > wl) continue;

        const scarcity = info.offeredSemSet.size;
        const desiredBonus = desiredSet.has(code) ? 50 : 0;

        reqCandidates.push({
          code,
          info,
          credits: cCredits,
          score: (10 - Math.min(10, scarcity)) * 10 + desiredBonus + cCredits,
        });
      }

      reqCandidates.sort((a, b) => b.score - a.score);

      for (const cand of reqCandidates) {
        if (used + cand.credits > wl) continue;
        if (countedForGrad.has(cand.code)) continue;

        await addPlannedCourse(term, {
          code: cand.code,
          title: cand.info.title,
          credits: cand.credits,
          sbc: cand.info.sbc,
        });

        used += cand.credits;
        termCodesThisTerm.push(cand.code);
      }

      const stateAfterRequired = computeCompletionState(requiredCourseIds, countedForGrad, sbcSatisfied, creditsPlanned);
      let missingSbcSet = new Set(stateAfterRequired.missingSbcCategories);

      // 2) Fill SBC / credits as needed
      while (used < wl) {
        const remainingBudget = wl - used;

        const needCredits = (UNIVERSITY_GRAD_REQ.minimumCredits - creditsPlanned) > 0;
        const needSbc = missingSbcSet.size > 0;

        if (!needCredits && !needSbc) break;

        const semU = normUpper(term.semester);

        let pool = semesterPoolCache.get(semU);
        if (!pool) {
          pool = await getSemesterPool(db, term.semester);
          semesterPoolCache.set(semU, pool);
        }

        let best = null;
        let bestScore = -1;

        const considerCourse = async (c, requireCover) => {
          const code = normalizePlanCourseCode(c.code);
          if (!code) return;
          if (countedForGrad.has(code)) return;
          if (avoidSet.has(code)) return;

          const cCredits = Number(c.credits) || 0;
          if (cCredits <= 0) return;
          if (cCredits > remainingBudget) return;

          const sbcCodes = extractSbcCodes(c.sbc).map(normStr);
          let cover = 0;
          for (const s of sbcCodes) if (missingSbcSet.has(s)) cover++;

          // First pass: if we still need SBC, try to pick something that covers missing SBC.
          if (requireCover && cover === 0) return;

          let groups = prereqCacheByCourseId.get(c.courseId);
          if (groups === undefined) {
            groups = await getPrereqGroupsForCourse(db, prereqSource, c.courseId);
            prereqCacheByCourseId.set(c.courseId, groups);
          }
          if (!prereqsSatisfied(groups, satisfiedForPrereqs)) return;

          const desiredBonus = desiredSet.has(code) ? 50 : 0;
          const noPrereqBonus = (groups?.length || 0) === 0 ? 20 : 0;

          const score =
            cover * 200 +
            desiredBonus +
            noPrereqBonus +
            (cCredits === 3 ? 5 : 0);

          if (score > bestScore) {
            bestScore = score;
            best = { ...c, code, credits: cCredits };
          }
        };

        // PASS A: prefer courses that cover missing SBCs (if any missing)
        for (const c of pool) {
          await considerCourse(c, needSbc);
        }

        // PATCHED PASS B (fallback): if SBC is missing but none cover it, allow credits-only picks
        if (!best && needSbc) {
          for (const c of pool) {
            await considerCourse(c, false);
          }
        }

        if (!best) break;

        await addPlannedCourse(term, {
          code: best.code,
          title: best.title,
          credits: best.credits,
          sbc: best.sbc,
        });

        used += best.credits;
        termCodesThisTerm.push(best.code);

        const sbcCodes = extractSbcCodes(best.sbc).map(normStr);
        for (const s of sbcCodes) missingSbcSet.delete(s);
      }

      // end of term: now courses count for prereqs
      for (const code of termCodesThisTerm) satisfiedForPrereqs.add(code);

      const doneState = computeCompletionState(requiredCourseIds, countedForGrad, sbcSatisfied, creditsPlanned);
      if (doneState.graduationOk) {
        completionTermLabel = term.termLabel;
        break;
      }

      i++;
      if ((Number(term.year) || 0) > MAX_YEAR) break;
    }

    if (!completionTermLabel) {
      const finalState = computeCompletionState(requiredCourseIds, countedForGrad, sbcSatisfied, creditsPlanned);
      return res.status(400).json({
        ok: false,
        error:
          `Auto-planner could not find a graduation-ready plan through ${MAX_YEAR}. ` +
          `Try increasing workload limits or selecting a later graduation term.`,
        graduationOk: false,
        graduationSummary: finalState,
      });
    }

    const suggestedGraduationTerm = completionTermLabel;

    const { semester: sugSem, year: sugYear } = parseTermLabel(suggestedGraduationTerm);
    const trimmedTerms = terms
      .filter((t) => t.semester && t.year)
      .filter((t) => termCompare(t.semester, t.year, sugSem, sugYear) <= 0)
      .sort((a, b) => termSortKey(a) - termSortKey(b));

    let planId = null;
    try {
      const saved = await persistGeneratedPlan(db, userId, suggestedGraduationTerm, trimmedTerms);
      planId = saved.planId;
    } catch (e) {
      console.error("[schedule-plan] auto-plan persist failed:", e);
    }

    const finalState = computeCompletionState(requiredCourseIds, countedForGrad, sbcSatisfied, creditsPlanned);

    const earlier = termCompare(sugSem, sugYear, requestedGradSem, requestedGradYear) < 0;
    const later = termCompare(sugSem, sugYear, requestedGradSem, requestedGradYear) > 0;

    const msg =
      earlier
        ? `✅ Auto-planner found a plan that graduates EARLIER than requested: ${suggestedGraduationTerm} (requested ${graduationTermRaw}).`
        : later
        ? `⚠️ Not possible to graduate by ${graduationTermRaw} under current workload limits. Earliest feasible is ${suggestedGraduationTerm}.`
        : `✅ Auto-planner found a graduation-ready plan by ${suggestedGraduationTerm}.`;

    const exportText =
      `SAM Auto-Plan Export\n` +
      `Graduation Term: ${suggestedGraduationTerm}\n` +
      `Plan ID: ${planId ?? "N/A"}\n\n` +
      trimmedTerms
        .map((t) => {
          const lines = (t.courses || []).map((c) => `  - ${normalizePlanCourseCode(c.code)} (${Number(c.credits) || 0} cr)`).join("\n");
          return `${t.termLabel} [limit ${Number(t.workloadLimit) || 0}]\n${lines || "  (no courses)"}`;
        })
        .join("\n\n");

    return res.json({
      ok: true,
      message: msg,
      graduationTerm: suggestedGraduationTerm,
      planTerms: trimmedTerms,
      planId,
      graduationOk: finalState.graduationOk,
      graduationSummary: {
        totalCreditsRequired: finalState.totalCreditsRequired,
        creditsPlanned: finalState.creditsPlanned,
        creditsMissing: finalState.creditsMissing,
        missingRequired: finalState.missingRequired,
        missingSbcCategories: finalState.missingSbcCategories,
      },
      exportText,
    });
  } catch (err) {
    console.error("[schedule-plan] POST /auto-plan failed:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;

