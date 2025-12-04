// server/routes/degreeProgressRoutes.jsx
import express from "express";

const router = express.Router();

/* -----------------  GPA GRADE MAP ----------------- */
const GRADE_POINTS = {
  "A+": 4.0, "A": 4.0, "A-": 3.7,
  "B+": 3.3, "B": 3.0, "B-": 2.7,
  "C+": 2.3, "C": 2.0, "C-": 1.7,
  "D+": 1.3, "D": 1.0, "D-": 0.7,
  "F": 0.0
};

const UNIVERSITY_GRAD_REQ = {
  minimumCredits: 120,
  sbcs: [
    "ARTS","GLO","HUM","LANG","QPS","SBS","SNW","TECH","USA","WRT",
    "STAS","EXP+","HFA+","SBS+","STEM+","CER","DIV","ESI","SPK","WRTD",
  ],
  langExemptions: ["CEAS"],
};

function getStudentId(req) {
  return req.user?.userId ?? req.user?.user_id ?? null;
}

/* ----------------- HELPERS ----------------- */
function isPassing(grade) {
  if (!grade) return false;
  if (GRADE_POINTS.hasOwnProperty(grade)) return grade !== "F";
  return ["P", "CR", "S"].includes(grade);
}

function extractSbcCodes(str) {
  if (!str) return [];
  return str
    .replace(/partially fulfills:/i, "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function computeGpa(rows) {
  let num = 0,
    denom = 0,
    completed = 0;

  for (let r of rows) {
    const credits = Number(r.credits) || 0;
    if (!credits) continue;

    if (r.grade) {
      if (isPassing(r.grade)) completed += credits;
      if (GRADE_POINTS[r.grade] != null) {
        num += GRADE_POINTS[r.grade] * credits;
        denom += credits;
      }
    }
  }

  return {
    totalCreditsCompleted: completed,
    attemptedCredits: denom,
    gpa: denom > 0 ? Number((num / denom).toFixed(3)) : null,
  };
}

/* ----------------- SBC STATUS ----------------- */
function computeSbcSummary(rows) {
  const sbcMap = new Map(
    UNIVERSITY_GRAD_REQ.sbcs.map((c) => [
      c,
      { code: c, completedCourses: [], inProgressCourses: [] },
    ])
  );

  for (let r of rows) {
    const codes = extractSbcCodes(r.sbc);
    const passed = r.grade && isPassing(r.grade);
    const inProg = !r.grade && ["registered","enrolled","waitlisted"].includes(
      (r.status || "").toLowerCase()
    );

    const courseMini = {
      subject: r.subject,
      courseNum: r.course_num,
      title: r.title,
      credits: r.credits,
      grade: r.grade,
    };

    for (let code of codes) {
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
      completed: cat.completedCourses.length > 0,
      inProgress: cat.inProgressCourses.length > 0,
    })),
  };
}

/* ----------------- BUILD MAJOR / MINOR STATUS ----------------- */
function buildDegreeRequirementStatus(requirementJson, enrollments, degreeRow) {
  if (!requirementJson) return null;

  const required = requirementJson.required_courses || [];
  const electives = requirementJson.major_electives || null;

  const resultRequired = [];

  for (let req of required) {
    const match = enrollments.filter(
      (r) =>
        r.subject === req.subject &&
        String(r.course_num) === String(req.course_num)
    );

    let completed = false;
    let inProgress = false;
    let grade = null;

    for (let m of match) {
      if (m.grade && isPassing(m.grade)) {
        completed = true;
        grade = m.grade;
      } else if (!m.grade && ["registered","enrolled","waitlisted"].includes((m.status||"").toLowerCase())) {
        inProgress = true;
      }
    }

    resultRequired.push({
      id: `${req.subject}${req.course_num}`,
      subject: req.subject,
      courseNum: req.course_num,
      title: req.title,
      credits: req.credits,
      minGrade: req.min_grade,
      completed,
      inProgress,
      grade,
    });
  }

  return {
    name:
      degreeRow.program_type === "major"
        ? `${degreeRow.subject} ${degreeRow.degree_type} Major`
        : `${degreeRow.subject} ${degreeRow.degree_type} Minor`,
    requiredCourses: resultRequired,
    majorElectives: electives || null,
  };
}

/* ----------------- MAIN API ROUTE ----------------- */
router.get("/progress", async (req, res) => {
  const studentId = getStudentId(req);
  if (!studentId) return res.status(401).json({ ok: false, error: "Not authenticated" });

  try {
    const db = req.db;

    /* 1. FETCH ENROLLMENTS + COURSES */
    const { rows: enrollments } = await db.query(
      `
      SELECT e.grade, e.status, c.subject, c.course_num, c.title, c.credits, c.sbc
      FROM enrollments e
      JOIN class_sections cs ON e.class_id = cs.class_id
      JOIN courses c ON cs.course_id = c.course_id
      WHERE e.student_id = $1
      `,
      [studentId]
    );

    /* 2. GPA / Credits */
    const overview = computeGpa(enrollments);

    /* 3. SBC */
    const sbcRequirements = computeSbcSummary(enrollments);

    /* 4. FETCH STUDENT PROGRAMS (major/minor) */
    const { rows: programs } = await db.query(
      `
      SELECT sp.program_id,
             dr.subject,
             dr.degree_type,
             dr.program_type,
             dr.degree_requirements
      FROM student_programs sp
      JOIN degree_requirements dr ON dr.id = sp.program_id
      WHERE sp.student_id = $1
      `,
      [studentId]
    );

    let majorReq = null;
    let minorReq = null;

    for (let p of programs) {
      const requirementJson =
        typeof p.degree_requirements === "string"
          ? JSON.parse(p.degree_requirements)
          : p.degree_requirements;

      if (p.program_type === "major") {
        majorReq = buildDegreeRequirementStatus(requirementJson, enrollments, p);
      } else if (p.program_type === "minor") {
        minorReq = buildDegreeRequirementStatus(requirementJson, enrollments, p);
      }
    }

    return res.json({
      ok: true,
      overview: {
        ...overview,
        totalCreditsRequired: UNIVERSITY_GRAD_REQ.minimumCredits,
      },
      sbcRequirements,
      majorRequirements: majorReq,
      minorRequirements: minorReq,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
