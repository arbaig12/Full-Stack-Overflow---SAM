/**
 * @file rostersGradingRoutes.js
 * @description Express routes for instructor rosters and grading functionality.
 * Handles:
 *   - Get class roster for a section
 *   - Submit grades
 *   - Get all sections taught by an instructor
 */

import { Router } from 'express';

const router = Router();

/**
 * GET /instructors/:instructor_id/sections
 * Get all sections taught by an instructor.
 * 
 * Query params:
 *   - term_id: Optional term filter
 * 
 * @route GET /instructors/:instructor_id/sections
 * @returns {Object} 200 - List of sections
 */
router.get('/instructors/:instructor_id/sections', async (req, res) => {
  try {
    const { instructor_id } = req.params;
    const { term_id } = req.query;

    let sql = `
      SELECT
        cs.class_id,
        cs.section_num,
        cs.capacity,
        cs.location_text,
        cs.term_id,
        c.course_id,
        c.subject,
        c.course_num,
        c.title,
        c.credits,
        t.semester::text AS semester,
        t.year,
        COUNT(e.student_id) FILTER (WHERE e.status = 'registered') AS enrolled_count
      FROM class_sections cs
      JOIN courses c ON c.course_id = cs.course_id
      JOIN terms t ON t.term_id = cs.term_id
      LEFT JOIN enrollments e ON e.class_id = cs.class_id
      WHERE cs.instructor_id = $1
    `;

    const params = [instructor_id];

    if (term_id) {
      params.push(term_id);
      sql += ` AND cs.term_id = $${params.length}`;
    }

    sql += `
      GROUP BY cs.class_id, cs.section_num, cs.capacity, cs.location_text,
               cs.term_id, c.course_id, c.subject, c.course_num, c.title,
               c.credits, t.semester, t.year
      ORDER BY t.year DESC, t.semester DESC, c.subject, c.course_num, cs.section_num
    `;

    const result = await req.db.query(sql, params);

    const sections = result.rows.map(row => ({
      classId: row.class_id,
      sectionNumber: row.section_num,
      courseId: row.course_id,
      subject: row.subject,
      courseNum: row.course_num,
      courseCode: `${row.subject}${row.course_num}`,
      title: row.title,
      credits: parseFloat(row.credits),
      location: row.location_text,
      capacity: row.capacity,
      enrolled: parseInt(row.enrolled_count) || 0,
      term: {
        id: row.term_id,
        semester: row.semester,
        year: row.year
      }
    }));

    return res.json({ 
      ok: true, 
      count: sections.length,
      sections 
    });
  } catch (e) {
    console.error('[rosters] /instructors/:instructor_id/sections failed:', e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * GET /sections/:class_id/roster
 * Get the roster (enrolled students) for a specific section.
 * 
 * @route GET /sections/:class_id/roster
 * @returns {Object} 200 - Roster list
 * @returns {Object} 404 - Section not found
 */
router.get('/sections/:class_id/roster', async (req, res) => {
  try {
    const { class_id } = req.params;

    // Verify section exists
    const sectionCheck = await req.db.query(
      `SELECT class_id, instructor_id FROM class_sections WHERE class_id = $1`,
      [class_id]
    );

    if (sectionCheck.rows.length === 0) {
      return res.status(404).json({ 
        ok: false, 
        error: 'Section not found' 
      });
    }

    // Get roster
    const sql = `
      SELECT
        e.student_id,
        e.status::text AS enrollment_status,
        e.grade::text AS grade,
        e.gpnc,
        e.credits,
        e.added_at,
        u.sbu_id,
        u.first_name,
        u.last_name,
        u.email
      FROM enrollments e
      JOIN users u ON u.user_id = e.student_id
      WHERE e.class_id = $1
        AND e.status = 'registered'
      ORDER BY u.last_name, u.first_name
    `;

    const result = await req.db.query(sql, [class_id]);

    const roster = result.rows.map(row => ({
      studentId: row.student_id,
      sbuId: row.sbu_id,
      firstName: row.first_name,
      lastName: row.last_name,
      email: row.email,
      status: row.enrollment_status,
      grade: row.grade,
      gpnc: row.gpnc,
      credits: parseFloat(row.credits),
      addedAt: row.added_at
    }));

    return res.json({ 
      ok: true, 
      count: roster.length,
      roster 
    });
  } catch (e) {
    console.error('[rosters] /sections/:class_id/roster failed:', e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * PUT /enrollments/:student_id/:class_id/grade
 * Submit or update a grade for a student's enrollment.
 * 
 * Body:
 *   - grade: Grade to assign (A+, A, A-, B+, B, B-, C+, C, C-, D+, D, D-, F, P, NP, etc.)
 * 
 * @route PUT /enrollments/:student_id/:class_id/grade
 * @returns {Object} 200 - Grade updated
 * @returns {Object} 400 - Invalid grade
 * @returns {Object} 404 - Enrollment not found
 */
router.put('/enrollments/:student_id/:class_id/grade', async (req, res) => {
  try {
    const { student_id, class_id } = req.params;
    const { grade } = req.body;

    if (!grade) {
      return res.status(400).json({ 
        ok: false, 
        error: 'grade is required' 
      });
    }

    // Validate grade format
    const validGrades = [
      'A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-',
      'D+', 'D', 'D-', 'F', 'P', 'NP', 'CR', 'NC', 'S', 'U',
      'I', 'IP', 'W', 'WP', 'WF', 'WU', 'AU', 'NR', 'MG', 'DFR'
    ];

    if (!validGrades.includes(grade.toUpperCase())) {
      return res.status(400).json({ 
        ok: false, 
        error: `Invalid grade. Must be one of: ${validGrades.join(', ')}` 
      });
    }

    // Check if enrollment exists
    const enrollmentCheck = await req.db.query(
      `SELECT class_id FROM enrollments 
       WHERE student_id = $1 AND class_id = $2`,
      [student_id, class_id]
    );

    if (enrollmentCheck.rows.length === 0) {
      return res.status(404).json({ 
        ok: false, 
        error: 'Enrollment not found' 
      });
    }

    // Update grade
    await req.db.query(
      `UPDATE enrollments 
       SET grade = $1::grade_mark, updated_at = NOW()
       WHERE student_id = $2 AND class_id = $3`,
      [grade.toUpperCase(), student_id, class_id]
    );

    return res.json({ 
      ok: true, 
      message: 'Grade updated successfully' 
    });
  } catch (e) {
    console.error('[rosters] PUT /grade failed:', e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * POST /sections/:class_id/grades
 * Bulk update grades for multiple students in a section.
 * 
 * Body:
 *   - grades: Array of { student_id, grade }
 * 
 * @route POST /sections/:class_id/grades
 * @returns {Object} 200 - Grades updated
 */
router.post('/sections/:class_id/grades', async (req, res) => {
  try {
    const { class_id } = req.params;
    const { grades } = req.body;

    if (!Array.isArray(grades) || grades.length === 0) {
      return res.status(400).json({ 
        ok: false, 
        error: 'grades must be a non-empty array of { student_id, grade }' 
      });
    }

    const validGrades = [
      'A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-',
      'D+', 'D', 'D-', 'F', 'P', 'NP', 'CR', 'NC', 'S', 'U',
      'I', 'IP', 'W', 'WP', 'WF', 'WU', 'AU', 'NR', 'MG', 'DFR'
    ];

    // Validate all grades
    for (const item of grades) {
      if (!item.student_id || !item.grade) {
        return res.status(400).json({ 
          ok: false, 
          error: 'Each grade entry must have student_id and grade' 
        });
      }

      if (!validGrades.includes(item.grade.toUpperCase())) {
        return res.status(400).json({ 
          ok: false, 
          error: `Invalid grade: ${item.grade}` 
        });
      }
    }

    // Update grades in transaction
    const client = await req.db.connect();
    try {
      await client.query('BEGIN');

      for (const item of grades) {
        await client.query(
          `UPDATE enrollments 
           SET grade = $1::grade_mark, updated_at = NOW()
           WHERE student_id = $2 AND class_id = $3`,
          [item.grade.toUpperCase(), item.student_id, class_id]
        );
      }

      await client.query('COMMIT');

      return res.json({ 
        ok: true, 
        message: `Successfully updated ${grades.length} grades` 
      });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (e) {
    console.error('[rosters] POST /grades failed:', e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

export default router;

