// server/routes/studentProfileRoutes.js
import express from "express";
const router = express.Router();

/* -------------------------------------
   GPA POINT MAPPING
-------------------------------------- */
const gradePoints = {
  "A+": 4.0, A: 4.0, "A-": 3.7,
  "B+": 3.3, B: 3.0, "B-": 2.7,
  "C+": 2.3, C: 2.0, "C-": 1.7,
  "D+": 1.3, D: 1.0, "D-": 0.7,
  F: 0.0,
};

function computeGpa(rows) {
  let totalPts = 0;
  let totalCr = 0;

  for (const r of rows) {
    if (!r.grade) continue;

    const gp = gradePoints[r.grade.toUpperCase()];
    if (gp === undefined) continue;

    const credits = Number(r.credits || 0); // uses courses.credits ONLY
    if (!credits) continue;

    totalPts += gp * credits;
    totalCr += credits;
  }

  return totalCr > 0 ? totalPts / totalCr : null;
}

/* -------------------------------------
   Helper: compute class standing
-------------------------------------- */
function computeClassStanding(credits) {
  if (credits >= 84) return "U4";
  if (credits >= 57) return "U3";
  if (credits >= 24) return "U2";
  return "U1";
}

/* -------------------------------------
   MAIN ROUTE
-------------------------------------- */
router.get("/", async (req, res) => {
  try {
    const db = req.db;
    const { userId, role } = req.user || {};

    if (!userId || role !== "Student") {
      return res.status(403).json({ error: "Not authorized" });
    }

    /* -------------------------------------
         1. PERSONAL INFO
    -------------------------------------- */
    const { rows: personalRows } = await db.query(
      `
        SELECT user_id, first_name, last_name, email
        FROM users
        WHERE user_id = $1
      `,
      [userId]
    );

    const personal = personalRows[0];

    /* -------------------------------------
         1b. MAJORS & MINORS
    -------------------------------------- */
    const { rows: programRows } = await db.query(
      `
        SELECT dr.subject, dr.degree_type, dr.program_type
        FROM student_programs sp
        JOIN degree_requirements dr ON dr.id = sp.program_id
        WHERE sp.student_id = $1
      `,
      [userId]
    );

    const declaredMajors = programRows
      .filter((p) => p.program_type === "major")
      .map((p) => `${p.subject} ${p.degree_type}`);

    const declaredMinors = programRows
      .filter((p) => p.program_type === "minor")
      .map((p) => `${p.subject} ${p.degree_type}`);

    /* -------------------------------------
         2. CUMULATIVE GPA + CREDITS
    -------------------------------------- */
    const { rows: allEnrollments } = await db.query(
      `
        SELECT 
          e.grade,
          c.credits,
          t.term_id,
          t.semester,
          t.year
        FROM enrollments e
        JOIN class_sections cs ON cs.class_id = e.class_id
        JOIN courses c ON c.course_id = cs.course_id
        JOIN terms t ON t.term_id = cs.term_id
        WHERE e.student_id = $1
        ORDER BY t.year, t.semester
      `,
      [userId]
    );

    const graded = allEnrollments.filter(
      (e) => e.grade && e.grade.toUpperCase() !== "I"
    );

    const cumulativeCredits = graded.reduce(
      (sum, e) => sum + Number(e.credits || 0),
      0
    );

    const cumulativeGPA = computeGpa(graded);
    const classStanding = computeClassStanding(cumulativeCredits);

    /* -------------------------------------
         3. CURRENT TERM GPA + SCHEDULE
    -------------------------------------- */
    const { rows: stateRows } = await db.query(
      `SELECT current_term_id FROM system_state ORDER BY system_state_id DESC LIMIT 1`
    );

    const currentTermId = stateRows[0]?.current_term_id;

    let termGpa = null;
    let termCredits = 0;
    let schedule = [];

    if (currentTermId) {
      const { rows: termRows } = await db.query(
        `
          SELECT 
            e.grade,
            c.credits,
            cs.section_num,
            c.subject,
            c.course_num,
            c.title,
            cs.meeting_days,
            cs.meeting_times
          FROM enrollments e
          JOIN class_sections cs ON cs.class_id = e.class_id
          JOIN courses c ON c.course_id = cs.course_id
          WHERE e.student_id = $1
            AND cs.term_id = $2
        `,
        [userId, currentTermId]
      );

      schedule = termRows.map((r) => ({
        code: `${r.subject}${r.course_num}`,
        name: r.title,
        time: `${r.meeting_days} ${r.meeting_times}`,
      }));

      const gradedThisTerm = termRows.filter(
        (r) => r.grade && r.grade.toUpperCase() !== "I"
      );

      termGpa = computeGpa(gradedThisTerm);
      termCredits = gradedThisTerm.reduce(
        (sum, r) => sum + Number(r.credits || 0),
        0
      );
    }

    /* -------------------------------------
         FINAL RESPONSE
    -------------------------------------- */
    return res.json({
      personal: {
        name: `${personal.first_name} ${personal.last_name}`,
        studentId: personal.user_id,
        email: personal.email,
        classStanding,
        declaredMajors,
        declaredMinors,
      },
      academic: {
        cumulativeGPA,
        cumulativeCredits,
        termGPA: termGpa,
        termCredits,
        registrationHolds: ["None"],
      },
      schedule,
    });
  } catch (err) {
    console.error("studentProfile error:", err);
    return res.status(500).json({ error: err.message });
  }
});

export default router;
