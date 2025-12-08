import express from "express";
const router = express.Router();

const GRADE_POINTS = {
  "A+": 4.0,
  A: 4.0,
  "A-": 3.7,
  "B+": 3.3,
  B: 3.0,
  "B-": 2.7,
  "C+": 2.3,
  C: 2.0,
  "C-": 1.7,
  "D+": 1.3,
  D: 1.0,
  "D-": 0.7,
  F: 0.0,
};

const UNIVERSITY_GRAD_REQ = {
  minimumCredits: 120,
  sbcs: [
    "ARTS",
    "GLO",
    "HUM",
    "LANG",
    "QPS",
    "SBS",
    "SNW",
    "TECH",
    "USA",
    "WRT",
    "STAS",
    "EXP+",
    "HFA+",
    "SBS+",
    "STEM+",
    "CER",
    "DIV",
    "ESI",
    "SPK",
    "WRTD",
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

function getStudentId(req) {
  return req.user?.userId ?? req.user?.user_id ?? req.session?.user?.user_id ?? null;
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

function extractSbcCodes(sbcField) {
  if (!sbcField) return [];
  if (Array.isArray(sbcField)) return sbcField.map(normStr).filter(Boolean);

  const raw = normStr(sbcField);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map(normStr).filter(Boolean);
  } catch {}

  return raw
    .replace(/partially fulfills:/i, "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
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

function buildEnrollmentIndex(enrollments) {
  const idx = new Map();

  for (const r of enrollments) {
    const code = courseCodeFromRow(r);
    if (!code) continue;

    const grade = normUpper(r.grade);
    const inProg = !grade && isInProgressStatus(r.status);
    const passed = grade && isPassing(grade);

    const existing = idx.get(code) || {
      code,
      completed: false,
      inProgress: false,
      grade: null,
      credits: null,
      title: null,
      subject: normUpper(r.subject) || null,
      courseNum: normStr(r.course_num) || null,
    };

    if (passed) {
      existing.completed = true;
      existing.grade = grade;
    } else if (inProg) {
      existing.inProgress = true;
    }

    if (existing.title == null && r.title) existing.title = r.title;
    if (existing.credits == null && r.credits != null) existing.credits = r.credits;

    idx.set(code, existing);
  }

  return idx;
}

function titleFromKey(key) {
  const s = normStr(key).replace(/_/g, " ");
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "Requirement";
}

function collectCodesFromReqObj(reqObj) {
  const codes = new Set();

  const addCode = (x) => {
    if (!x) return;
    if (typeof x === "string") {
      const c = splitCourseCode(x).code;
      if (c) codes.add(c);
      return;
    }
    if (Array.isArray(x)) {
      for (const y of x) addCode(y);
      return;
    }
    if (typeof x === "object") {
      for (const v of Object.values(x)) addCode(v);
    }
  };

  addCode(reqObj?.required_courses ?? reqObj?.requiredCourses ?? []);
  for (const [k, v] of Object.entries(reqObj || {})) {
    if (k === "required_courses" || k === "requiredCourses") continue;
    if (!v || typeof v !== "object") continue;
    if (Array.isArray(v.options)) addCode(v.options);
    if (Array.isArray(v.required_sequence)) addCode(v.required_sequence);
    if (Array.isArray(v.additional_allowed_courses)) addCode(v.additional_allowed_courses);
    if (Array.isArray(v.exclude_courses)) addCode(v.exclude_courses);
  }

  return [...codes];
}

async function fetchCourseInfoMap(db, codes) {
  const pairs = [];
  for (const code of codes || []) {
    const { subject, courseNum, code: normCode } = splitCourseCode(code);
    if (!subject || !courseNum || !normCode) continue;
    pairs.push({ subject, courseNum, code: normCode });
  }

  if (pairs.length === 0) return new Map();

  const valuesSql = pairs.map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2})`).join(", ");
  const params = pairs.flatMap((p) => [p.subject, p.courseNum]);

  try {
    const { rows } = await db.query(
      `
      WITH req(subject, course_num) AS (
        VALUES ${valuesSql}
      )
      SELECT c.subject, c.course_num, c.title, c.credits
      FROM courses c
      JOIN req r ON r.subject = c.subject AND r.course_num = c.course_num
      `,
      params
    );

    const map = new Map();
    for (const r of rows) {
      const code = `${normUpper(r.subject)}${normStr(r.course_num)}`;
      map.set(code, { title: r.title ?? null, credits: r.credits ?? null });
    }
    return map;
  } catch {
    return new Map();
  }
}

function buildCourseNode(codeRaw, enrollmentIdx, courseInfoMap) {
  const parsed = splitCourseCode(codeRaw);
  const code = parsed.code ?? normUpper(codeRaw) ?? null;

  const enr = code ? enrollmentIdx.get(code) : null;
  const info = code ? courseInfoMap.get(code) : null;

  return {
    id: code || `course-${Math.random().toString(36).slice(2)}`,
    code: code || null,
    subject: parsed.subject ?? enr?.subject ?? null,
    courseNum: parsed.courseNum ?? enr?.courseNum ?? null,
    title: info?.title ?? enr?.title ?? "",
    credits: info?.credits ?? enr?.credits ?? null,
    completed: !!enr?.completed,
    inProgress: !!enr?.inProgress,
    grade: enr?.grade ?? null,
  };
}

function groupStatusFromCourses(courses, requiredCount, mode) {
  const items = Array.isArray(courses) ? courses : [];
  const completedCount = items.filter((c) => !!c.completed).length;
  const inProgressAny = items.some((c) => !!c.inProgress) || items.some((c) => !!c.completed);

  let completed = false;
  if (mode === "all") completed = completedCount === items.length && items.length > 0;
  else if (mode === "atleast") completed = completedCount >= (Number(requiredCount) || 0);

  return {
    completed,
    inProgress: !completed && inProgressAny,
    completedCount,
    requiredCount: Number(requiredCount) || 0,
  };
}

function buildGroupsForProgram(reqObj, enrollments, enrollmentIdx, courseInfoMap, programId) {
  const groups = [];
  const requiredList = reqObj?.required_courses ?? reqObj?.requiredCourses ?? reqObj?.required ?? [];

  const coreCodes = Array.isArray(requiredList) ? requiredList : [];
  const coreItems = coreCodes.map((c) => buildCourseNode(c, enrollmentIdx, courseInfoMap));
  const coreStatus = groupStatusFromCourses(coreItems, null, "all");

  groups.push({
    id: `${programId}-core`,
    title: "Required Courses",
    type: "all",
    items: coreItems,
    status: coreStatus,
  });

  for (const [key, rawVal] of Object.entries(reqObj || {})) {
    if (key === "required_courses" || key === "requiredCourses") continue;
    if (!rawVal || typeof rawVal !== "object") continue;

    if (key === "electives") {
      const minLevel = Number(rawVal.min_level) || 0;
      const minCourses = Number(rawVal.min_courses) || 0;
      const fromSubject = normUpper(rawVal.from_subject);
      const exclude = new Set((rawVal.exclude_courses || []).map((x) => splitCourseCode(x).code).filter(Boolean));

      const completed = [];
      const inProgress = [];
      const seenCompleted = new Set();
      const seenInProgress = new Set();

      for (const r of enrollments) {
        const code = courseCodeFromRow(r);
        if (!code) continue;
        if (fromSubject && normUpper(r.subject) !== fromSubject) continue;

        const num = Number(r.course_num);
        if (minLevel && (!Number.isFinite(num) || num < minLevel)) continue;
        if (exclude.has(code)) continue;

        const grade = normUpper(r.grade);
        if (grade && isPassing(grade)) {
          if (!seenCompleted.has(code)) {
            completed.push(buildCourseNode(code, enrollmentIdx, courseInfoMap));
            seenCompleted.add(code);
          }
        } else if (!grade && isInProgressStatus(r.status)) {
          if (!seenInProgress.has(code)) {
            inProgress.push(buildCourseNode(code, enrollmentIdx, courseInfoMap));
            seenInProgress.add(code);
          }
        }
      }

      const status = {
        completed: completed.length >= minCourses && minCourses > 0,
        inProgress: completed.length < minCourses && (inProgress.length > 0 || completed.length > 0),
        completedCount: completed.length,
        requiredCount: minCourses,
      };

      groups.push({
        id: `${programId}-${key}`,
        title: "Electives",
        type: "electives",
        minLevel,
        minCourses,
        fromSubject: fromSubject || null,
        excludeCourses: [...exclude],
        completedCourses: completed,
        inProgressCourses: inProgress,
        status,
      });

      continue;
    }

    if (Array.isArray(rawVal.required_sequence)) {
      const seq = rawVal.required_sequence;
      const steps = seq.map((step, idx) => {
        const options = Array.isArray(step) ? step : [step];
        const items = options.map((c) => buildCourseNode(c, enrollmentIdx, courseInfoMap));

        const stepCompleted = items.some((c) => !!c.completed);
        const stepInProgress = !stepCompleted && items.some((c) => !!c.inProgress);

        return {
          id: `${programId}-${key}-step-${idx}`,
          options: items,
          status: {
            completed: stepCompleted,
            inProgress: stepInProgress,
          },
        };
      });

      const completed = steps.length > 0 && steps.every((s) => !!s.status.completed);
      const inProgress = !completed && steps.some((s) => s.status.inProgress || s.status.completed);

      groups.push({
        id: `${programId}-${key}`,
        title: titleFromKey(key),
        type: "sequence",
        steps,
        status: { completed, inProgress },
      });

      continue;
    }

    if (Array.isArray(rawVal.options)) {
      const required = Number(rawVal.required) || 1;
      const options = rawVal.options;

      const optionGroups = options.map((arr, idx) => {
        const list = Array.isArray(arr) ? arr : [arr];
        const items = list.map((c) => buildCourseNode(c, enrollmentIdx, courseInfoMap));
        const optCompleted = items.length > 0 && items.every((c) => !!c.completed);
        const optInProgress = !optCompleted && items.some((c) => !!c.completed || !!c.inProgress);

        return {
          id: `${programId}-${key}-opt-${idx}`,
          items,
          status: { completed: optCompleted, inProgress: optInProgress },
        };
      });

      const maxGroupLen = optionGroups.reduce((m, g) => Math.max(m, g.items.length), 0);

      if (rawVal.min_credits != null) {
        const minCredits = Number(rawVal.min_credits) || 0;
        const additional = Array.isArray(rawVal.additional_allowed_courses) ? rawVal.additional_allowed_courses : [];

        const allowed = new Set();
        for (const g of optionGroups) {
          for (const c of g.items) if (c.code) allowed.add(c.code);
        }
        for (const c of additional) {
          const code = splitCourseCode(c).code;
          if (code) allowed.add(code);
        }

        const countedCompleted = [];
        const countedInProgress = [];
        const seen = new Set();

        let creditsCompleted = 0;

        for (const r of enrollments) {
          const code = courseCodeFromRow(r);
          if (!code || !allowed.has(code)) continue;

          const grade = normUpper(r.grade);
          if (grade && isPassing(grade)) {
            if (!seen.has(code)) {
              const credits = Number(r.credits) || 0;
              creditsCompleted += credits;
              countedCompleted.push(buildCourseNode(code, enrollmentIdx, courseInfoMap));
              seen.add(code);
            }
          } else if (!grade && isInProgressStatus(r.status)) {
            countedInProgress.push(buildCourseNode(code, enrollmentIdx, courseInfoMap));
          }
        }

        const coreSatisfied = optionGroups.filter((g) => g.status.completed).length >= required;
        const completed = coreSatisfied && creditsCompleted >= minCredits;
        const inProgress =
          !completed &&
          (optionGroups.some((g) => g.status.inProgress || g.status.completed) ||
            countedInProgress.length > 0 ||
            countedCompleted.length > 0);

        groups.push({
          id: `${programId}-${key}`,
          title: titleFromKey(key),
          type: "credits_core",
          minCredits,
          requiredCoreOptions: required,
          coreOptions: optionGroups,
          countedCompletedCourses: countedCompleted,
          countedInProgressCourses: countedInProgress,
          status: {
            completed,
            inProgress,
            creditsCompleted,
            creditsRequired: minCredits,
            coreCompletedCount: optionGroups.filter((g) => g.status.completed).length,
            coreRequiredCount: required,
          },
        });

        continue;
      }

      if (required === 1 && maxGroupLen > 1) {
        const anySatisfied = optionGroups.some((g) => g.status.completed);
        const inProgress = !anySatisfied && optionGroups.some((g) => g.status.inProgress || g.status.completed);

        groups.push({
          id: `${programId}-${key}`,
          title: titleFromKey(key),
          type: "choose_sequence",
          required: 1,
          options: optionGroups,
          status: { completed: anySatisfied, inProgress },
        });

        continue;
      }

      const poolMap = new Map();
      for (const g of optionGroups) {
        for (const c of g.items) {
          const code = c.code || c.id;
          if (!poolMap.has(code)) poolMap.set(code, c);
        }
      }
      const pool = [...poolMap.values()];
      const status = groupStatusFromCourses(pool, required, "atleast");

      groups.push({
        id: `${programId}-${key}`,
        title: titleFromKey(key),
        type: required === 1 ? "choose_one" : "choose_n",
        required,
        items: pool,
        status,
      });

      continue;
    }
  }

  return groups;
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
  const text = `${codeU} ${nameU}`.trim();
  const cleaned = text.replace(/[^A-Z0-9]/g, "");

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

router.get("/progress", async (req, res) => {
  const studentId = getStudentId(req);
  if (!studentId) return res.status(401).json({ ok: false, error: "Not authenticated" });

  try {
    const db = req.db;

    const { rows: enrollmentsRaw } = await db.query(
      `
      SELECT e.grade, e.status, c.subject, c.course_num, c.title, c.credits, c.sbc
      FROM enrollments e
      JOIN class_sections cs ON e.class_id = cs.class_id
      JOIN courses c ON cs.course_id = c.course_id
      WHERE e.student_id = $1
      `,
      [studentId]
    );

    const enrollments = enrollmentsRaw.map((r) => ({ ...r, grade: normUpper(r.grade) || null }));

    const overview = computeGpa(enrollments);
    const sbcRequirements = computeSbcSummary(enrollments);
    const enrollmentIdx = buildEnrollmentIndex(enrollments);

    const { rows: studentPrograms } = await db.query(
      `
      SELECT
        sp.program_id,
        sp.kind,
        p.code AS program_code,
        p.name AS program_name,
        p.type AS program_table_type
      FROM student_programs sp
      JOIN programs p ON p.program_id = sp.program_id
      WHERE sp.student_id = $1
      ORDER BY sp.program_id ASC
      `,
      [studentId]
    );

    const { rows: drRows } = await db.query(
      `
      SELECT id, subject, degree_type, program_type, degree_requirements, effective_term, admission_requirements
      FROM degree_requirements
      `
    );

    const chosen = [];
    for (const sp of studentPrograms) {
      const programId = Number(sp.program_id);
      const programType = normProgramType(sp.kind ?? sp.program_table_type);
      if (programType !== "major" && programType !== "minor") continue;

      const inf = inferSubjectDegreeType(programType, sp.program_code, sp.program_name);
      let dr = null;

      if (inf.subject && inf.degreeType) {
        dr = drRows.find(
          (r) =>
            normUpper(r.subject) === inf.subject &&
            normUpper(r.degree_type) === inf.degreeType &&
            normProgramType(r.program_type) === programType
        );
        if (!dr) {
          dr = drRows.find((r) => normUpper(r.subject) === inf.subject && normUpper(r.degree_type) === inf.degreeType);
        }
      }

      if (!dr) {
        dr = bestMatchDegreeRequirements(drRows, programType, sp.program_code, sp.program_name);
      }

      chosen.push({
        programId,
        programType,
        programCode: sp.program_code ?? null,
        programName: sp.program_name ?? null,
        degreeRow: dr ?? null,
      });
    }

    const allCodes = new Set();
    for (const item of chosen) {
      const reqObj = safeJson(item.degreeRow?.degree_requirements);
      if (!reqObj) continue;
      for (const c of collectCodesFromReqObj(reqObj)) allCodes.add(c);
    }

    const courseInfoMap = await fetchCourseInfoMap(db, [...allCodes]);

    const majors = [];
    const minors = [];

    for (const item of chosen) {
      const label = item.programType === "minor" ? "Minor" : "Major";

      if (!item.degreeRow) {
        const fallback = {
          programId: item.programId,
          programType: item.programType,
          subject: null,
          degreeType: item.programType === "minor" ? "MIN" : null,
          name: `${item.programCode ?? item.programName ?? "Program"} ${label}`.trim(),
          groups: [
            {
              id: `${item.programId}-core`,
              title: "Required Courses",
              type: "all",
              items: [],
              status: { completed: false, inProgress: false, completedCount: 0, requiredCount: 0 },
            },
          ],
          requiredCourses: [],
        };
        if (item.programType === "major") majors.push(fallback);
        else minors.push(fallback);
        continue;
      }

      const subject = normUpper(item.degreeRow.subject);
      const degreeType = normUpper(item.degreeRow.degree_type);
      const reqObj = safeJson(item.degreeRow.degree_requirements) || {};

      const groups = buildGroupsForProgram(reqObj, enrollments, enrollmentIdx, courseInfoMap, item.programId);
      const core = groups.find((g) => g.type === "all")?.items ?? [];

      const programPayload = {
        programId: item.programId,
        programType: item.programType,
        subject,
        degreeType,
        name: `${subject} ${degreeType} ${label}`.trim(),
        groups,
        requiredCourses: core,
      };

      if (item.programType === "major") majors.push(programPayload);
      else minors.push(programPayload);
    }

    return res.json({
      ok: true,
      overview: { ...overview, totalCreditsRequired: UNIVERSITY_GRAD_REQ.minimumCredits },
      sbcRequirements,
      majorRequirements: majors,
      minorRequirements: minors,
    });
  } catch (err) {
    console.error("[degree/progress] error:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

router.get("/degree-requirements", async (req, res) => {
  const studentId = getStudentId(req);
  if (!studentId) return res.status(401).json({ ok: false, error: "Not authenticated" });

  try {
    const db = req.db;

    const { rows } = await db.query(
      `
      SELECT
        id,
        subject,
        degree_type,
        program_type,
        effective_term,
        updated_at
      FROM degree_requirements
      ORDER BY subject ASC, degree_type ASC, id ASC
      `
    );

    const degreeRequirements = rows.map((r) => ({
      id: r.id,
      subject: r.subject ?? null,
      degreeType: r.degree_type ?? null,
      programType: normProgramType(r.program_type) ?? r.program_type ?? null,
      effectiveTerm: safeJson(r.effective_term),
      updatedAt: r.updated_at ?? null,
    }));

    return res.json({ ok: true, degreeRequirements });
  } catch (err) {
    console.error("[degree] GET /degree-requirements failed:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

router.get("/degree-requirements/:id", async (req, res) => {
  const studentId = getStudentId(req);
  if (!studentId) return res.status(401).json({ ok: false, error: "Not authenticated" });

  try {
    const db = req.db;
    const id = parseInt(req.params.id, 10);

    if (!Number.isFinite(id)) {
      return res.status(400).json({ ok: false, error: "Invalid id" });
    }

    const { rows } = await db.query(
      `
      SELECT 
        id,
        subject,
        degree_type,
        program_type,
        effective_term,
        admission_requirements,
        degree_requirements
      FROM degree_requirements
      WHERE id = $1
      `,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ ok: false, error: "Degree requirements not found" });
    }

    const row = rows[0];

    return res.json({
      ok: true,
      id: row.id,
      subject: row.subject,
      degreeType: row.degree_type,
      programType: normProgramType(row.program_type) ?? row.program_type,
      effectiveTerm: safeJson(row.effective_term),
      admissionRequirements: safeJson(row.admission_requirements),
      degreeRequirements: safeJson(row.degree_requirements),
    });
  } catch (err) {
    console.error("[degree] GET /degree-requirements/:id failed:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
