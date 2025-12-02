/**
 * @file studentProfileRoutes.js
 * @description Express routes for student profile and transcript functionality.
 * Handles:
 *   - Get student profile information
 *   - Get student transcript
 *   - Get student's declared programs (majors/minors)
 *   - Get student's course plan
 */

import { Router } from 'express';

const router = Router();

/**
 * GET /students/:student_id/profile
 * Get complete student profile information.
 * 
 * @route GET /students/:student_id/profile
 * @returns {Object} 200 - Student profile
 * @returns {Object} 404 - Student not found
 * @returns {Object} 500 - Query failure
 */
router.get('/students/:student_id/profile', async (req, res) => {
  try {
    const { student_id } = req.params;

    const sql = `
      SELECT
        u.user_id,
        u.sbu_id,
        u.first_name,
        u.last_name,
        u.email,
        u.role::text AS role,
        u.status,
        s.standing::text AS standing,
        s.expected_grad_term_id,
        t_expected.semester::text AS expected_grad_semester,
        t_expected.year AS expected_grad_year,
        s.direct_admit_program_id,
        s.aoi_program_id,
        p_direct.code AS direct_admit_code,
        p_direct.name AS direct_admit_name,
        p_aoi.code AS aoi_code,
        p_aoi.name AS aoi_name
      FROM users u
      JOIN students s ON s.user_id = u.user_id
      LEFT JOIN terms t_expected ON t_expected.term_id = s.expected_grad_term_id
      LEFT JOIN programs p_direct ON p_direct.program_id = s.direct_admit_program_id
      LEFT JOIN programs p_aoi ON p_aoi.program_id = s.aoi_program_id
      WHERE u.user_id = $1 AND lower(u.role::text) = 'student'
    `;

    const result = await req.db.query(sql, [student_id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        ok: false, 
        error: 'Student not found' 
      });
    }

    const row = result.rows[0];
    const profile = {
      userId: row.user_id,
      sbuId: row.sbu_id,
      firstName: row.first_name,
      lastName: row.last_name,
      email: row.email,
      role: row.role.toLowerCase(),
      status: row.status,
      standing: row.standing,
      expectedGraduation: row.expected_grad_term_id ? {
        termId: row.expected_grad_term_id,
        semester: row.expected_grad_semester,
        year: row.expected_grad_year
      } : null,
      directAdmit: row.direct_admit_program_id ? {
        programId: row.direct_admit_program_id,
        code: row.direct_admit_code,
        name: row.direct_admit_name
      } : null,
      areaOfInterest: row.aoi_program_id ? {
        programId: row.aoi_program_id,
        code: row.aoi_code,
        name: row.aoi_name
      } : null
    };

    return res.json({ ok: true, profile });
  } catch (e) {
    console.error('[student] /profile failed:', e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * GET /students/:student_id/transcript
 * Get student's complete transcript (all enrollments with grades).
 * 
 * Query params:
 *   - include_current: Include current/future enrollments (default: true)
 * 
 * @route GET /students/:student_id/transcript
 * @returns {Object} 200 - Transcript data
 * @returns {Object} 500 - Query failure
 */
router.get('/students/:student_id/transcript', async (req, res) => {
  try {
    const { student_id } = req.params;
    const includeCurrent = req.query.include_current !== 'false';

    let sql = `
      SELECT
        e.class_id,
        e.status::text AS enrollment_status,
        e.grade::text AS grade,
        e.gpnc,
        e.credits,
        cs.section_num,
        cs.term_id,
        c.course_id,
        c.subject,
        c.course_num,
        c.title,
        c.credits AS course_credits,
        t.semester::text AS semester,
        t.year
      FROM enrollments e
      JOIN class_sections cs ON cs.class_id = e.class_id
      JOIN courses c ON c.course_id = cs.course_id
      JOIN terms t ON t.term_id = cs.term_id
      WHERE e.student_id = $1
    `;

    const params = [student_id];

    if (!includeCurrent) {
      sql += ` AND e.grade IS NOT NULL`;
    }

    sql += ` ORDER BY t.year DESC, t.semester DESC, c.subject, c.course_num`;

    const result = await req.db.query(sql, params);

    const transcript = result.rows.map(row => ({
      classId: row.class_id,
      sectionNumber: row.section_num,
      courseId: row.course_id,
      subject: row.subject,
      courseNum: row.course_num,
      courseCode: `${row.subject}${row.course_num}`,
      title: row.title,
      credits: parseFloat(row.credits || row.course_credits),
      term: {
        id: row.term_id,
        semester: row.semester,
        year: row.year
      },
      status: row.enrollment_status,
      grade: row.grade,
      gpnc: row.gpnc
    }));

    // Calculate GPA
    const gradePoints = {
      'A+': 4.0, 'A': 4.0, 'A-': 3.7,
      'B+': 3.3, 'B': 3.0, 'B-': 2.7,
      'C+': 2.3, 'C': 2.0, 'C-': 1.7,
      'D+': 1.3, 'D': 1.0, 'D-': 0.7,
      'F': 0.0
    };

    let totalPoints = 0;
    let totalCredits = 0;

    transcript.forEach(course => {
      if (course.grade && gradePoints[course.grade] !== undefined) {
        totalPoints += gradePoints[course.grade] * course.credits;
        totalCredits += course.credits;
      }
    });

    const gpa = totalCredits > 0 ? (totalPoints / totalCredits).toFixed(2) : null;

    return res.json({ 
      ok: true, 
      transcript,
      gpa: gpa ? parseFloat(gpa) : null,
      totalCredits: totalCredits
    });
  } catch (e) {
    console.error('[student] /transcript failed:', e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * GET /students/:student_id/programs
 * Get student's declared majors and minors.
 * 
 * @route GET /students/:student_id/programs
 * @returns {Object} 200 - List of declared programs
 */
router.get('/students/:student_id/programs', async (req, res) => {
  try {
    const { student_id } = req.params;

    const sql = `
      SELECT
        sp.program_id,
        sp.kind::text AS program_kind,
        sp.declared_at,
        p.code,
        p.name,
        p.type::text AS program_type,
        d.department_id,
        d.name AS department_name,
        d.code AS department_code
      FROM student_programs sp
      JOIN programs p ON p.program_id = sp.program_id
      LEFT JOIN departments d ON d.department_id = p.department_id
      WHERE sp.student_id = $1
      ORDER BY sp.declared_at DESC
    `;

    const result = await req.db.query(sql, [student_id]);

    const programs = result.rows.map(row => ({
      programId: row.program_id,
      code: row.code,
      name: row.name,
      type: row.program_type.toLowerCase(),
      kind: row.program_kind,
      declaredAt: row.declared_at,
      department: row.department_id ? {
        id: row.department_id,
        name: row.department_name,
        code: row.department_code
      } : null
    }));

    const majors = programs.filter(p => p.kind === 'MAJOR');
    const minors = programs.filter(p => p.kind === 'MINOR');

    return res.json({ 
      ok: true, 
      programs,
      majors,
      minors
    });
  } catch (e) {
    console.error('[student] /programs failed:', e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

export default router;

