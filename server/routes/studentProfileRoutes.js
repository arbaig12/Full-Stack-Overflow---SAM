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
         1b. MAJORS & MINORS WITH REQUIREMENT VERSIONS
    -------------------------------------- */
    const { rows: programRows } = await db.query(
      `
        SELECT 
          dr.subject, 
          dr.degree_type, 
          dr.program_type,
          dr.effective_term
        FROM student_programs sp
        JOIN degree_requirements dr ON dr.id = sp.program_id
        WHERE sp.student_id = $1
      `,
      [userId]
    );

    const declaredMajors = programRows
      .filter((p) => p.program_type === "major")
      .map((p) => {
        const effectiveTerm = typeof p.effective_term === 'string' 
          ? JSON.parse(p.effective_term) 
          : p.effective_term;
        const termStr = effectiveTerm 
          ? `${effectiveTerm.semester} ${effectiveTerm.year}` 
          : '';
        return {
          program: `${p.subject} ${p.degree_type}`,
          requirementVersion: termStr
        };
      });

    const declaredMinors = programRows
      .filter((p) => p.program_type === "minor")
      .map((p) => {
        const effectiveTerm = typeof p.effective_term === 'string' 
          ? JSON.parse(p.effective_term) 
          : p.effective_term;
        const termStr = effectiveTerm 
          ? `${effectiveTerm.semester} ${effectiveTerm.year}` 
          : '';
        return {
          program: `${p.subject} ${p.degree_type}`,
          requirementVersion: termStr
        };
      });

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
         2b. TERM-BY-TERM GPA AND CUMULATIVE GPA/CREDITS
    -------------------------------------- */
    // Group enrollments by term
    const enrollmentsByTerm = {};
    for (const e of allEnrollments) {
      const termKey = `${e.semester}_${e.year}`;
      if (!enrollmentsByTerm[termKey]) {
        enrollmentsByTerm[termKey] = {
          semester: e.semester,
          year: e.year,
          enrollments: []
        };
      }
      enrollmentsByTerm[termKey].enrollments.push(e);
    }

    // Calculate term-by-term GPA and cumulative GPA/credits
    const termHistory = [];
    let runningCredits = 0;
    let runningPoints = 0;

    // Sort terms chronologically
    const sortedTerms = Object.values(enrollmentsByTerm).sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year;
      const semOrder = { 'Spring': 1, 'SummerI': 2, 'SummerII': 3, 'Fall': 4 };
      return (semOrder[a.semester] || 99) - (semOrder[b.semester] || 99);
    });

    for (const termData of sortedTerms) {
      const termGraded = termData.enrollments.filter(
        (e) => e.grade && e.grade.toUpperCase() !== "I"
      );
      
      const termGpa = computeGpa(termGraded);
      const termCredits = termGraded.reduce(
        (sum, e) => sum + Number(e.credits || 0),
        0
      );

      // Update running totals for cumulative GPA
      for (const e of termGraded) {
        const gp = gradePoints[e.grade.toUpperCase()];
        if (gp !== undefined) {
          const credits = Number(e.credits || 0);
          runningPoints += gp * credits;
          runningCredits += credits;
        }
      }

      const cumulativeGpaAtTerm = runningCredits > 0 ? runningPoints / runningCredits : null;

      termHistory.push({
        semester: termData.semester,
        year: termData.year,
        termGPA: termGpa,
        termCredits: termCredits,
        cumulativeGPA: cumulativeGpaAtTerm,
        cumulativeCredits: runningCredits
      });
    }

    /* -------------------------------------
         3. CURRENT TERM GPA + SCHEDULE
    -------------------------------------- */
    let currentTermId = null;
    try {
      const { rows: stateRows } = await db.query(
        `SELECT current_term_id FROM system_state ORDER BY system_state_id DESC LIMIT 1`
      );
      currentTermId = stateRows[0]?.current_term_id;
    } catch (err) {
      // If system_state table doesn't exist, try to get most recent term as fallback
      console.log("system_state table not available, using fallback:", err.message);
      try {
        const { rows: fallbackRows } = await db.query(
          `SELECT term_id FROM terms 
           ORDER BY year DESC, 
             CASE semester::text
               WHEN 'Spring' THEN 1
               WHEN 'SummerI' THEN 2
               WHEN 'SummerII' THEN 3
               WHEN 'Fall' THEN 4
             END DESC
           LIMIT 1`
        );
        currentTermId = fallbackRows[0]?.term_id;
      } catch (fallbackErr) {
        console.log("Could not determine current term:", fallbackErr.message);
      }
    }

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
            cs.meeting_times,
            COALESCE(r.building || ' ' || r.room, cs.location_text) AS location,
            t.semester,
            t.year
          FROM enrollments e
          JOIN class_sections cs ON cs.class_id = e.class_id
          JOIN courses c ON c.course_id = cs.course_id
          JOIN terms t ON t.term_id = cs.term_id
          LEFT JOIN rooms r ON r.room_id = cs.room_id
          WHERE e.student_id = $1
            AND cs.term_id = $2
        `,
        [userId, currentTermId]
      );

      schedule = termRows.map((r) => ({
        code: `${r.subject}${r.course_num}`,
        name: r.title,
        time: `${r.meeting_days || ''} ${r.meeting_times || ''}`.trim(),
        location: r.location || 'TBA',
        semester: r.semester,
        year: r.year
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
         4. UNIVERSITY ENTRY (if available in database)
    -------------------------------------- */
    // Note: university_entry may not be stored in database
    // Check if there's a students table with this field
    let universityEntry = null;
    try {
      const { rows: studentRows } = await db.query(
        `SELECT university_entry FROM students WHERE user_id = $1`,
        [userId]
      );
      if (studentRows.length > 0 && studentRows[0].university_entry) {
        universityEntry = typeof studentRows[0].university_entry === 'string'
          ? JSON.parse(studentRows[0].university_entry)
          : studentRows[0].university_entry;
      }
    } catch (err) {
      // Field may not exist, that's okay
      console.log("university_entry field not available:", err.message);
    }

    /* -------------------------------------
         5. TRANSFER COURSES (if available in database)
    -------------------------------------- */
    // Note: transfer_courses may not be stored in database
    let transferCourses = [];
    try {
      const { rows: transferRows } = await db.query(
        `SELECT transfer_courses FROM students WHERE user_id = $1`,
        [userId]
      );
      if (transferRows.length > 0 && transferRows[0].transfer_courses) {
        transferCourses = typeof transferRows[0].transfer_courses === 'string'
          ? JSON.parse(transferRows[0].transfer_courses)
          : transferRows[0].transfer_courses;
        if (!Array.isArray(transferCourses)) transferCourses = [];
      }
    } catch (err) {
      // Field may not exist, that's okay
      console.log("transfer_courses field not available:", err.message);
    }

    /* -------------------------------------
         6. ALL TERM SCHEDULES (for viewing any term)
    -------------------------------------- */
    const { rows: allScheduleRows } = await db.query(
      `
        SELECT 
          c.subject,
          c.course_num,
          c.title,
          cs.meeting_days,
          cs.meeting_times,
          COALESCE(r.building || ' ' || r.room, cs.location_text) AS location,
          t.term_id,
          t.semester,
          t.year
        FROM enrollments e
        JOIN class_sections cs ON cs.class_id = e.class_id
        JOIN courses c ON c.course_id = cs.course_id
        JOIN terms t ON t.term_id = cs.term_id
        LEFT JOIN rooms r ON r.room_id = cs.room_id
        WHERE e.student_id = $1
        ORDER BY t.year, t.semester, c.subject, c.course_num
      `,
      [userId]
    );

    // Group schedules by term
    const schedulesByTerm = {};
    for (const row of allScheduleRows) {
      const termKey = `${row.semester}_${row.year}`;
      if (!schedulesByTerm[termKey]) {
        schedulesByTerm[termKey] = {
          termId: row.term_id,
          semester: row.semester,
          year: row.year,
          classes: []
        };
      }
      schedulesByTerm[termKey].classes.push({
        code: `${row.subject}${row.course_num}`,
        name: row.title,
        time: `${row.meeting_days || ''} ${row.meeting_times || ''}`.trim(),
        location: row.location || 'TBA'
      });
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
        universityEntry: universityEntry 
          ? `${universityEntry.semester} ${universityEntry.year}`
          : null,
      },
      academic: {
        cumulativeGPA,
        cumulativeCredits,
        termGPA: termGpa,
        termCredits,
        termHistory, // Term-by-term GPA and cumulative GPA/credits
        registrationHolds: ["None"],
        transferCourses,
      },
      schedule, // Current term schedule
      schedulesByTerm: Object.values(schedulesByTerm), // All term schedules
    });
  } catch (err) {
    console.error("studentProfile error:", err);
    return res.status(500).json({ error: err.message });
  }
});

export default router;
