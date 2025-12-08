// server/routes/rostersGradingRoutes.js
import express from "express";
const router = express.Router();

const ALLOWED_GRADES = [
  "A+",
  "A",
  "A-",
  "B+",
  "B",
  "B-",
  "C+",
  "C",
  "C-",
  "D+",
  "D",
  "D-",
  "F",
  "P",
  "NP",
  "CR",
  "NC",
  "S",
  "U",
  "I",
];

const getUserId = (req) =>
  req.user?.user_id ?? req.user?.userId ?? req.session?.user?.user_id ?? null;

function normalizeRole(raw) {
  const r = (raw ?? "").toString().trim().toLowerCase();
  if (!r) return null;
  if (r === "instructor" || r === "faculty" || r === "professor" || r === "teacher") return "instructor";
  if (r === "registrar") return "registrar";
  if (r === "student") return "student";
  if (r === "advisor") return "advisor";
  return r;
}

function hasInstructorRoleInReq(req) {
  const r = normalizeRole(req.user?.role);
  if (r === "instructor") return true;

  const roles = Array.isArray(req.user?.roles) ? req.user.roles : [];
  return roles.some((x) => String(x).toUpperCase() === "INSTRUCTOR");
}

async function requireInstructor(db, req, userId) {
  if (hasInstructorRoleInReq(req)) return true;
  if (!userId) return false;

  const { rows } = await db.query(`SELECT role FROM users WHERE user_id = $1`, [userId]);
  const role = normalizeRole(rows?.[0]?.role);
  return role === "instructor";
}

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
    termCode: `${t.semester} ${t.year}`,
  };
}

router.get("/rosters", async (req, res) => {
  const db = req.db;
  const userId = getUserId(req);

  if (!userId) return res.status(401).json({ ok: false, error: "Not authenticated" });

  try {
    const okRole = await requireInstructor(db, req, userId);
    if (!okRole) {
      return res.status(403).json({ ok: false, error: "You must be logged in as an instructor to access rosters." });
    }

    const currentTerm = await getCurrentTerm(db);

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

    if (!classes.length) return res.json({ ok: true, currentTerm, courses: [] });

    const classIds = classes.map((c) => Number(c.class_id));

    const { rows: roster } = await db.query(
      `
        SELECT
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

    const studentsByClass = new Map();
    for (const r of roster) {
      const cid = Number(r.class_id);
      if (!studentsByClass.has(cid)) studentsByClass.set(cid, []);
      studentsByClass.get(cid).push({
        classId: cid,
        studentId: Number(r.student_id),
        name: `${r.first_name} ${r.last_name}`,
        email: r.email,
        grade: r.grade,
        status: r.status,
      });
    }

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
        isCurrent: currentTerm ? Number(c.term_id) === Number(currentTerm.termId) : false,
        students: studentsByClass.get(cid) || [],
      };
    });

    return res.json({ ok: true, currentTerm, courses });
  } catch (err) {
    console.error("[instructor/rosters] error:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

router.post("/rosters/:classId/grade", async (req, res) => {
  const db = req.db;
  const userId = getUserId(req);

  if (!userId) return res.status(401).json({ ok: false, error: "Not authenticated" });

  const classId = Number(req.params.classId);
  const { studentId, newGrade } = req.body;

  if (!classId || !studentId || !newGrade) {
    return res.status(400).json({ ok: false, error: "Missing required fields." });
  }

  const gradeUpper = newGrade.trim().toUpperCase();
  if (!ALLOWED_GRADES.includes(gradeUpper)) {
    return res.status(400).json({
      ok: false,
      error: "Invalid grade: must be one of " + ALLOWED_GRADES.join(", "),
    });
  }

  try {
    const okRole = await requireInstructor(db, req, userId);
    if (!okRole) {
      return res.status(403).json({ ok: false, error: "You must be logged in as an instructor to update grades." });
    }

    const { rows: classCheck } = await db.query(
      `
        SELECT term_id
        FROM class_sections
        WHERE class_id = $1 AND instructor_id = $2
      `,
      [classId, userId]
    );

    if (!classCheck.length) {
      return res.status(403).json({ ok: false, error: "Not allowed to change grades for this class." });
    }

    const classTerm = Number(classCheck[0].term_id);
    const currentTerm = await getCurrentTerm(db);

    if (!currentTerm || Number(currentTerm.termId) !== classTerm) {
      return res.status(403).json({ ok: false, error: "Grades may only be changed for the current term." });
    }

    const { rows: enrRows } = await db.query(
      `
        SELECT grade
        FROM enrollments
        WHERE class_id = $1 AND student_id = $2
      `,
      [classId, studentId]
    );

    if (!enrRows.length) {
      return res.status(404).json({ ok: false, error: "Enrollment not found." });
    }

    const currGrade = enrRows[0].grade;
    if (currGrade && String(currGrade).toUpperCase() !== "I") {
      return res.status(400).json({ ok: false, error: "Only incomplete (I) or missing grades may be edited." });
    }

    const { rows: updated } = await db.query(
      `
        UPDATE enrollments
        SET grade = $1, updated_at = now()
        WHERE class_id = $2 AND student_id = $3
        RETURNING grade
      `,
      [gradeUpper, classId, studentId]
    );

    return res.json({ ok: true, grade: updated[0].grade });
  } catch (err) {
    console.error("[update grade error]", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
