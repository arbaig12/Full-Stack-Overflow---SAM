// server/routes/rostersGradingRoutes.js
import express from "express";
const router = express.Router();

/* -----------------------
   VALID GRADE SET
------------------------ */
const ALLOWED_GRADES = [
  "A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-",
  "D+", "D", "D-", "F", "P", "NP", "CR", "NC", "S", "U", "I"
];

/* -----------------------
   HELPERS
------------------------ */
const getUserId = (req) =>
  req.user?.user_id ??
  req.user?.userId ??
  req.session?.user?.user_id ??
  null;

/** Check if user is in instructors table */
async function isInstructor(db, userId) {
  const { rows } = await db.query(
    `SELECT user_id FROM instructors WHERE user_id = $1`,
    [userId]
  );
  return rows.length > 0;
}

/**
 * Get current term — matches your DB EXACTLY
 * terms table: term_id, semester, year
 * system_state: current_term_id only
 */
async function getCurrentTerm(db) {
  const { rows } = await db.query(
    `
      SELECT
        s.current_term_id AS term_id,
        t.semester,
        t.year
      FROM system_state s
      JOIN terms t ON t.term_id = s.current_term_id
      ORDER BY s.system_state_id DESC
      LIMIT 1
    `
  );

  if (!rows.length) return null;

  const t = rows[0];
  return {
    termId: Number(t.term_id),
    semester: t.semester,
    year: t.year,
    termCode: `${t.semester} ${t.year}`
  };
}

/* =========================================================
   GET /api/instructor/rosters
========================================================= */
router.get("/rosters", async (req, res) => {
  const db = req.db;
  const userId = getUserId(req);

  if (!userId)
    return res.status(401).json({ ok: false, error: "Not authenticated" });

  try {
    // Instructor must exist in instructors table
    const isInst = await isInstructor(db, userId);
    if (!isInst) {
      return res
        .status(403)
        .json({ ok: false, error: "You are not registered as an instructor." });
    }

    const currentTerm = await getCurrentTerm(db);

    /* Pull all class sections taught by this instructor */
    const { rows: classes } = await db.query(
      `
        SELECT 
          cs.class_id,
          cs.section_num,
          cs.term_id,
          cs.meeting_days,
          cs.meeting_times,
          c.course_id,
          c.subject,
          c.course_num,
          c.title,
          t.semester,
          t.year
        FROM class_sections cs
        JOIN courses c ON c.course_id = cs.course_id
        JOIN terms t ON t.term_id = cs.term_id
        WHERE cs.instructor_id = $1
        ORDER BY t.year DESC, t.semester DESC, c.subject, c.course_num
      `,
      [userId]
    );

    if (!classes.length) {
      return res.json({ ok: true, currentTerm, courses: [] });
    }

    // Convert all IDs to numbers
    const classIds = classes.map((c) => Number(c.class_id));

    /* Pull roster for all these classes */
    const { rows: roster } = await db.query(
      `
        SELECT
          e.enrollment_id,
          e.class_id,
          e.student_id,
          e.grade,
          e.status,
          u.first_name,
          u.last_name,
          u.email
        FROM enrollments e
        JOIN users u ON u.user_id = e.student_id
        WHERE e.class_id = ANY($1::bigint[])
        ORDER BY u.last_name, u.first_name
      `,
      [classIds]
    );

    /* Group students by class_id */
    const studentsByClass = new Map();
    for (const r of roster) {
      const cid = Number(r.class_id);
      if (!studentsByClass.has(cid)) studentsByClass.set(cid, []);
      studentsByClass.get(cid).push({
        enrollmentId: Number(r.enrollment_id),
        studentId: Number(r.student_id),
        name: `${r.first_name} ${r.last_name}`,
        email: r.email,
        grade: r.grade,
        status: r.status
      });
    }

    /* Build final course objects */
    const courses = classes.map((c) => {
      const cid = Number(c.class_id);
      return {
        classId: cid,
        sectionNum: c.section_num,
        termId: Number(c.term_id),
        meetingDays: c.meeting_days,
        meetingTimes: c.meeting_times,
        courseId: Number(c.course_id),
        subject: c.subject,
        courseNum: c.course_num,
        title: c.title,
        semester: c.semester,
        year: c.year,
        termCode: `${c.semester} ${c.year}`,
        isCurrent:
          currentTerm ? Number(c.term_id) === Number(currentTerm.termId) : false,
        students: studentsByClass.get(cid) || []
      };
    });

    return res.json({ ok: true, currentTerm, courses });
  } catch (err) {
    console.error("[instructor/rosters] error:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

/* =========================================================
   POST /api/instructor/rosters/:classId/grade
========================================================= */
router.post("/rosters/:classId/grade", async (req, res) => {
  const db = req.db;
  const userId = getUserId(req);

  if (!userId)
    return res.status(401).json({ ok: false, error: "Not authenticated" });

  const classId = Number(req.params.classId);
  const { enrollmentId, newGrade } = req.body;

  if (!classId || !enrollmentId || !newGrade) {
    return res
      .status(400)
      .json({ ok: false, error: "Missing required fields." });
  }

  const gradeUpper = newGrade.trim().toUpperCase();
  if (!ALLOWED_GRADES.includes(gradeUpper)) {
    return res.status(400).json({
      ok: false,
      error: "Invalid grade: must be one of " + ALLOWED_GRADES.join(", ")
    });
  }

  try {
    /* Ensure instructor teaches this class */
    const { rows: classCheck } = await db.query(
      `
        SELECT term_id
        FROM class_sections
        WHERE class_id = $1 AND instructor_id = $2
      `,
      [classId, userId]
    );

    if (!classCheck.length) {
      return res
        .status(403)
        .json({ ok: false, error: "Not allowed to change grades for this class." });
    }

    const classTerm = Number(classCheck[0].term_id);
    const currentTerm = await getCurrentTerm(db);

    if (!currentTerm || Number(currentTerm.termId) !== classTerm) {
      return res.status(403).json({
        ok: false,
        error: "Grades may only be changed for the current term."
      });
    }

    /* Get existing grade */
    const { rows: enrRows } = await db.query(
      `
        SELECT grade FROM enrollments 
        WHERE enrollment_id = $1 AND class_id = $2
      `,
      [enrollmentId, classId]
    );

    if (!enrRows.length) {
      return res
        .status(404)
        .json({ ok: false, error: "Enrollment not found." });
    }

    const currGrade = enrRows[0].grade;
    if (currGrade && currGrade.toUpperCase() !== "I") {
      return res.status(400).json({
        ok: false,
        error: "Only incomplete (I) or missing grades may be edited."
      });
    }

    /* Update grade */
    const { rows: updated } = await db.query(
      `
        UPDATE enrollments
        SET grade = $1
        WHERE enrollment_id = $2
        RETURNING grade
      `,
      [gradeUpper, enrollmentId]
    );

    return res.json({ ok: true, grade: updated[0].grade });
  } catch (err) {
    console.error("[update grade error]", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
