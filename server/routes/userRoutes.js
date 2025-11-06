// server/routes/userRoutes.js
import { Router } from 'express';
const router = Router();

router.get('/registrars', async (req, res) => {
  try {
    const sql = `
      SELECT
        u.user_id,
        u.sbu_id,
        u.first_name,
        u.last_name,
        u.email,
        u.role::text AS role,
        u.status,
        to_char(u.last_login, 'YYYY-MM-DD') AS last_login_fmt
      FROM users u
      WHERE lower(u.role::text) = lower($1)
      ORDER BY u.last_name, u.first_name
    `;
    const r = await req.db.query(sql, ['Registrar']);

    const registrars = r.rows.map(u => ({
      id: u.sbu_id ?? String(u.user_id),
      name: `${u.first_name} ${u.last_name}`,
      email: u.email,
      role: 'registrar',
      status: u.status,                
      lastLogin: u.last_login_fmt,
      department: 'Administration',
    }));

    res.json({ ok: true, users: registrars });
  } catch (e) {
    console.error('[users] /registrars failed:', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.get('/students', async (req, res) => {
  try {
    const sql = `
      SELECT
        u.user_id,
        u.sbu_id,
        u.first_name,
        u.last_name,
        u.email,
        u.role::text AS role,
        u.status,
        to_char(u.last_login, 'YYYY-MM-DD') AS last_login_fmt,
        s.user_id         AS student_user_id,
        s.standing::text  AS standing,              -- enum -> text
        d.name            AS department_name
      FROM users u
      JOIN students s
        ON s.user_id = u.user_id
      /* most recently declared program for this student */
      LEFT JOIN LATERAL (
        SELECT sp.program_id
        FROM student_programs sp
        WHERE sp.student_id = s.user_id           -- FK points to students.user_id
        ORDER BY sp.declared_at DESC NULLS LAST, sp.program_id
        LIMIT 1
      ) sp ON true
      LEFT JOIN programs p
        ON p.program_id = sp.program_id
      LEFT JOIN departments d
        ON d.department_id = p.department_id
      WHERE lower(u.role::text) = 'student'
      ORDER BY u.last_name, u.first_name
    `;
    const r = await req.db.query(sql);

    const students = r.rows.map(u => ({
      id: u.sbu_id ?? String(u.user_id),
      name: `${u.first_name} ${u.last_name}`,
      email: u.email,
      role: 'student',
      status: u.status,
      lastLogin: u.last_login_fmt,
      department: u.department_name ?? null,
      classStanding: u.standing ?? null,          
    }));

    res.json({ ok: true, users: students });
  } catch (e) {
    console.error('[users] /students failed:', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.get('/instructors', async (req, res) => {
  try {
    const sql = `
      SELECT
        u.user_id,
        u.sbu_id,
        u.first_name,
        u.last_name,
        u.email,
        u.role::text AS role,
        COALESCE(u.status, 'active') AS status,
        to_char(u.last_login, 'YYYY-MM-DD') AS last_login_fmt,
        i.department_id,
        d.name AS department_name,
        -- distinct list like 'CSE214', 'CSE101'
        ARRAY_REMOVE(ARRAY_AGG(DISTINCT (c.subject || c.course_num)) 
                     FILTER (WHERE c.course_id IS NOT NULL), NULL) AS courses
      FROM users u
      LEFT JOIN instructors i       ON i.user_id = u.user_id
      LEFT JOIN departments d       ON d.department_id = i.department_id
      LEFT JOIN class_sections cs   ON cs.instructor_id = u.user_id
      LEFT JOIN courses c           ON c.course_id = cs.course_id
      WHERE lower(u.role::text) = 'instructor'
      GROUP BY
        u.user_id, u.sbu_id, u.first_name, u.last_name, u.email,
        u.role, u.status, u.last_login, i.department_id, d.name
      ORDER BY u.last_name, u.first_name
    `;
    const r = await req.db.query(sql);

    const instructors = r.rows.map(u => ({
      id: u.sbu_id ?? String(u.user_id),
      name: `${u.first_name} ${u.last_name}`,
      email: u.email,
      role: 'instructor',
      status: u.status,
      lastLogin: u.last_login_fmt,
      department: u.department_name ?? null,
      courses: Array.isArray(u.courses) ? u.courses.filter(Boolean) : []
    }));

    res.json({ ok: true, users: instructors });
  } catch (e) {
    console.error('[users] /instructors failed:', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.get('/advisors', async (req, res) => {
  try {
    const sql = `
      WITH primary_dept AS (
        SELECT
          s.user_id AS student_id,
          p.department_id,
          d.college_id
        FROM students s
        JOIN users u ON u.user_id = s.user_id
                    AND u.role = 'Student'
                    AND u.status = 'active'
        LEFT JOIN LATERAL (
          SELECT sp.program_id
          FROM student_programs sp
          WHERE sp.student_id = s.user_id
          ORDER BY sp.declared_at DESC NULLS LAST, sp.program_id
          LIMIT 1
        ) sp ON true
        LEFT JOIN programs   p ON p.program_id   = sp.program_id
        LEFT JOIN departments d ON d.department_id = p.department_id
      )
      SELECT
        u.user_id,
        u.sbu_id,
        u.first_name,
        u.last_name,
        u.email,
        u.role::text AS role,
        COALESCE(u.status, 'active') AS status,
        to_char(u.last_login, 'YYYY-MM-DD') AS last_login_fmt,
        a.level::text AS advisor_level,
        a.department_id,
        a.college_id,
        CASE a.level
          WHEN 'university' THEN 'Administration'
          WHEN 'college'    THEN (SELECT c.name FROM colleges c WHERE c.college_id = a.college_id)
          WHEN 'department' THEN (SELECT d.name FROM departments d WHERE d.department_id = a.department_id)
        END AS scope_name,
        COALESCE(
          CASE a.level
            WHEN 'university' THEN (SELECT COUNT(DISTINCT pd.student_id) FROM primary_dept pd)
            WHEN 'college'    THEN (SELECT COUNT(DISTINCT pd.student_id) FROM primary_dept pd WHERE pd.college_id    = a.college_id)
            WHEN 'department' THEN (SELECT COUNT(DISTINCT pd.student_id) FROM primary_dept pd WHERE pd.department_id = a.department_id)
          END, 0
        ) AS advisee_count
      FROM advisors a
      JOIN users u ON u.user_id = a.user_id
      ORDER BY u.last_name, u.first_name;
    `;

    const r = await req.db.query(sql);

    const advisors = r.rows.map(row => ({
      id: row.sbu_id ?? String(row.user_id),
      name: `${row.first_name} ${row.last_name}`,
      email: row.email,
      role: 'advisor',
      status: row.status,
      lastLogin: row.last_login_fmt,
      department: row.scope_name ?? null,  
      advisees: Number(row.advisee_count) 
    }));

    res.json({ ok: true, users: advisors });
  } catch (e) {
    console.error('[users] /advisors failed:', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});


export default router;
