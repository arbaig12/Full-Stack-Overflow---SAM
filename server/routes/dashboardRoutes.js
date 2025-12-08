// server/routes/dashboardRoutes.js
import express from 'express';

const router = express.Router();

/**
 * Helper: map letter grades to GPA points.
 * You can tune this to match SBU’s exact scale.
 */
const gradePoints = {
  'A+': 4.0,
  A: 4.0,
  'A-': 3.7,
  'B+': 3.3,
  B: 3.0,
  'B-': 2.7,
  'C+': 2.3,
  C: 2.0,
  'C-': 1.7,
  'D+': 1.3,
  D: 1.0,
  'D-': 0.7,
  F: 0.0,
  // other enum values (P/NP, W, etc.) will be ignored in GPA
};

function computeGpa(enrollments) {
  let totalPoints = 0;
  let totalCredits = 0;

  for (const row of enrollments) {
    if (!row.grade) continue;
    const gp = gradePoints[row.grade];
    if (gp === undefined) continue;

    // credits may come from a "credits" column or from the joined course
    const credits = Number(row.credits || row.course_credits || 0);
    if (!credits) continue;

    totalPoints += gp * credits;
    totalCredits += credits;
  }

  if (totalCredits === 0) return null;
  return totalPoints / totalCredits;
}

/**
 * STUDENT DASHBOARD
 */
async function getStudentDashboard(db, userId) {
  const client = await db.connect();
  try {
    // All enrollments for this student, with course & term info
    const { rows: enrollments } = await client.query(
      `
      SELECT
        e.class_id,
        e.status,
        e.grade,
        e.added_at,
        e.updated_at,

        c.subject,
        c.course_num,
        c.title,
        c.credits AS course_credits,

        cs.section_num,
        t.year,
        t.semester
      FROM enrollments e
      JOIN class_sections cs ON cs.class_id = e.class_id
      JOIN courses c ON c.course_id = cs.course_id
      JOIN terms t ON t.term_id = cs.term_id
      WHERE e.student_id = $1
      ORDER BY e.added_at DESC NULLS LAST, e.updated_at DESC NULLS LAST
      LIMIT 50;
      `,
      [userId]
    );

    // "Currently enrolled" courses (status = 'registered')
    const enrolledCourses = enrollments.filter(
      (e) => e.status === 'registered'
    ).length;

    // Completed credits (status = 'completed')
    const completedEnrollments = enrollments.filter(
      (e) => e.status === 'completed'
    );

    const totalCompletedCredits = completedEnrollments.reduce((sum, e) => {
      const cr = Number(e.credits || e.course_credits || 0);
      return sum + cr;
    }, 0);

    const currentGpa = computeGpa(completedEnrollments);

    // Simple: assume 120 credits to graduate
    const assumedCreditsToGrad = 120;
    const creditsToGraduate = Math.max(
      0,
      assumedCreditsToGrad - totalCompletedCredits
    );

    // Recent activity: last 5 enrollments / grade changes
    const recentActivity = enrollments.slice(0, 5).map((e) => {
      let type = 'enrollment';
      if (e.grade) type = 'grade';

      const courseLabel = `${e.subject} ${e.course_num}-${e.section_num}`;
      const message =
        type === 'grade'
          ? `Received grade ${e.grade} in ${courseLabel}`
          : `Status ${e.status} for ${courseLabel}`;

      return {
        type,
        message,
        time: e.added_at || e.updated_at,
      };
    });

    return {
      role: 'student',
      stats: {
        enrolledCourses,
        totalCompletedCredits,
        currentGpa,
        creditsToGraduate,
      },
      recentActivity,
    };
  } finally {
    client.release();
  }
}

/**
 * INSTRUCTOR DASHBOARD
 */
async function getInstructorDashboard(db, userId) {
  const client = await db.connect();
  try {
    // Sections taught by this instructor and student counts
    const { rows: sections } = await client.query(
      `
      SELECT
        cs.class_id,
        cs.section_num,
        c.subject,
        c.course_num,
        c.title,
        COUNT(e.*) FILTER (
          WHERE e.status IN ('registered', 'completed', 'waitlisted')
        ) AS enrolled_students,
        COUNT(e.*) FILTER (
          WHERE e.status = 'completed' AND e.grade IS NULL
        ) AS pending_grades
      FROM class_sections cs
      JOIN courses c ON c.course_id = cs.course_id
      LEFT JOIN enrollments e ON e.class_id = cs.class_id
      WHERE cs.instructor_id = $1
      GROUP BY cs.class_id, cs.section_num, c.subject, c.course_num, c.title
      `,
      [userId]
    );

    const teachingCourses = sections.length;
    const totalStudents = sections.reduce(
      (sum, s) => sum + Number(s.enrolled_students || 0),
      0
    );
    const pendingGrades = sections.reduce(
      (sum, s) => sum + Number(s.pending_grades || 0),
      0
    );

    // Recent activity: latest enrollments / grades in these sections
    const { rows: recent } = await client.query(
      `
      SELECT
        e.added_at,
        e.updated_at,
        e.status,
        e.grade,
        u.first_name,
        u.last_name,
        c.subject,
        c.course_num,
        cs.section_num
      FROM enrollments e
      JOIN students s ON s.user_id = e.student_id
      JOIN users u ON u.user_id = s.user_id
      JOIN class_sections cs ON cs.class_id = e.class_id
      JOIN courses c ON c.course_id = cs.course_id
      WHERE cs.instructor_id = $1
      ORDER BY e.added_at DESC NULLS LAST, e.updated_at DESC NULLS LAST
      LIMIT 10;
      `,
      [userId]
    );

    const recentActivity = recent.map((r) => {
      const studentName = `${r.first_name} ${r.last_name}`;
      const courseLabel = `${r.subject} ${r.course_num}-${r.section_num}`;
      let type = 'roster';
      let message = `${studentName} is ${r.status} in ${courseLabel}`;
      if (r.grade) {
        type = 'grade';
        message = `${studentName} received grade ${r.grade} in ${courseLabel}`;
      }

      return {
        type,
        message,
        time: r.added_at,
      };
    });

    return {
      role: 'instructor',
      stats: {
        teachingCourses,
        totalStudents,
        pendingGrades,
      },
      recentActivity,
    };
  } finally {
    client.release();
  }
}

/**
 * ADVISOR DASHBOARD
 * NOTE: no advisor→advisee linking table yet, so these are placeholders.
 */
async function getAdvisorDashboard(db, userId) {
  // TODO: when you add advisor_advisees table, query it here using db.
  return {
    role: 'advisor',
    stats: {
      totalAdvisees: 0,
      pendingApprovals: 0,
      graduatingThisTerm: 0,
      atRiskStudents: 0,
    },
    recentActivity: [],
  };
}

/**
 * REGISTRAR DASHBOARD
 */
async function getRegistrarDashboard(db) {
  const client = await db.connect();
  try {
    const [{ rows: studentCountRows }, { rows: courseCountRows }] =
      await Promise.all([
        client.query(
          `SELECT COUNT(*)::int AS cnt FROM users WHERE role = 'Student';`
        ),
        client.query(`SELECT COUNT(*)::int AS cnt FROM courses;`),
      ]);

    const totalStudents = studentCountRows[0]?.cnt || 0;
    const activeCourses = courseCountRows[0]?.cnt || 0;

    return {
      role: 'registrar',
      stats: {
        totalStudents,
        activeCourses,
        pendingImports: 0, // TODO: wire to import_logs
        systemStatus: 'Online',
      },
      recentActivity: [],
    };
  } finally {
    client.release();
  }
}

/**
 * Main route: GET /api/dashboard
 * Assumes:
 *   - req.db   = Postgres pool (set in index.js)
 *   - req.user = { userId, role } (from auth or a temporary stub)
 */
router.get('/', async (req, res) => {
  try {
    const db = req.db;
    const { userId, role } = req.user || {};

    if (!db) {
      return res
        .status(500)
        .json({ error: 'Database pool not available on request' });
    }

    if (!userId || !role) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    let data;

    switch (role) {
      case 'Student':
        data = await getStudentDashboard(db, userId);
        break;
      case 'Instructor':
        data = await getInstructorDashboard(db, userId);
        break;
      case 'Advisor':
        data = await getAdvisorDashboard(db, userId);
        break;
      case 'Registrar':
        data = await getRegistrarDashboard(db);
        break;
      default:
        data = { role, stats: {}, recentActivity: [] };
    }

    res.json(data);
  } catch (err) {
    console.error('Error in GET /api/dashboard', err);
    res.status(500).json({ error: 'Failed to load dashboard data' });
  }
});

export default router;
