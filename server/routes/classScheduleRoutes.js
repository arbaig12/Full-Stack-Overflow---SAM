/**
 * @file classScheduleRoutes.js
 * @description Express routes for class schedule and registration functionality.
 * Handles:
 *   - Viewing available course sections for a term
 *   - Student registration for courses
 *   - Viewing student's enrolled courses
 *   - Course withdrawal
 *   - Waitlist management
 */

import { Router } from 'express';

const router = Router();

/**
 * GET /sections
 * Get all course sections for a given term.
 * Supports filtering by SBC and days-of-week per Section 3.3 requirements.
 * 
 * Query params:
 *   - term_id: Required term ID
 *   - subject: Optional subject filter (e.g., "CSE")
 *   - course_num: Optional course number filter
 *   - instructor_id: Optional instructor filter
 *   - sbc: Optional SBC filter (e.g., "TECH", "WRT", "QPS")
 *   - days: Optional days-of-week filter (comma-separated, e.g., "Tue,Thu,Fri")
 * 
 * @route GET /sections
 * @returns {Object} 200 - List of course sections
 * @returns {Object} 400 - Missing term_id
 * @returns {Object} 500 - Query failure
 */
router.get('/sections', async (req, res) => {
  try {
    const { term_id, subject, course_num, instructor_id, sbc, days } = req.query;

    if (!term_id) {
      return res.status(400).json({ 
        ok: false, 
        error: 'term_id query parameter is required' 
      });
    }

    let sql = `
      SELECT
        cs.class_id,
        cs.section_num,
        cs.capacity,
        cs.location_text,
        cs.requires_dept_permission,
        cs.notes,
        cs.term_id,
        cs.course_id,
        cs.instructor_id,
        c.subject,
        c.course_num,
        c.title,
        c.credits,
        c.description,
        COALESCE(c.sbc, '') AS sbc,
        COALESCE(cs.meeting_days, '') AS meeting_days,
        COALESCE(cs.meeting_times, '') AS meeting_times,
        u.first_name || ' ' || u.last_name AS instructor_name,
        u.email AS instructor_email,
        r.building,
        r.room,
        COUNT(e.student_id) FILTER (WHERE e.status = 'registered') AS enrolled_count
      FROM class_sections cs
      JOIN courses c ON c.course_id = cs.course_id
      LEFT JOIN users u ON u.user_id = cs.instructor_id
      LEFT JOIN rooms r ON r.room_id = cs.room_id
      LEFT JOIN enrollments e ON e.class_id = cs.class_id
      WHERE cs.term_id = $1
    `;

    const params = [term_id];
    let paramIndex = 1;

    if (subject) {
      paramIndex++;
      sql += ` AND c.subject = $${paramIndex}`;
      params.push(subject.toUpperCase());
    }

    if (course_num) {
      paramIndex++;
      sql += ` AND c.course_num = $${paramIndex}`;
      params.push(course_num);
    }

    if (instructor_id) {
      paramIndex++;
      sql += ` AND cs.instructor_id = $${paramIndex}`;
      params.push(instructor_id);
    }

    // SBC filter (Section 3.3 requirement)
    if (sbc) {
      paramIndex++;
      sql += ` AND UPPER(COALESCE(c.sbc, '')) LIKE $${paramIndex}`;
      params.push(`%${sbc.toUpperCase()}%`);
    }

    // Days-of-week filter (Section 3.3 requirement)
    if (days) {
      const dayList = days.split(',').map(d => d.trim().toUpperCase());
      const dayConditions = dayList.map((day, idx) => {
        paramIndex++;
        params.push(`%${day}%`);
        return `UPPER(COALESCE(cs.meeting_days, '')) LIKE $${paramIndex}`;
      });
      sql += ` AND (${dayConditions.join(' OR ')})`;
    }

    sql += `
      GROUP BY cs.class_id, cs.section_num, cs.capacity, cs.location_text,
               cs.requires_dept_permission, cs.notes, cs.term_id, cs.course_id,
               cs.instructor_id, c.subject, c.course_num, c.title, c.credits,
               c.description, c.sbc, cs.meeting_days, cs.meeting_times,
               u.first_name, u.last_name, u.email, r.building, r.room
      ORDER BY c.subject, c.course_num, cs.section_num
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
      description: row.description,
      sbc: row.sbc || '',
      meetingDays: row.meeting_days || '',
      meetingTimes: row.meeting_times || '',
      instructor: row.instructor_id ? {
        id: row.instructor_id,
        name: row.instructor_name,
        email: row.instructor_email
      } : null,
      location: row.location_text || (row.building && row.room ? `${row.building} ${row.room}` : null),
      capacity: row.capacity,
      enrolled: parseInt(row.enrolled_count) || 0,
      available: row.capacity - (parseInt(row.enrolled_count) || 0),
      requiresPermission: row.requires_dept_permission,
      notes: row.notes,
      termId: row.term_id
    }));

    return res.json({ 
      ok: true, 
      count: sections.length,
      sections 
    });
  } catch (e) {
    console.error('[schedule] /sections failed:', e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * GET /sections/:class_id
 * Get detailed information about a specific course section.
 * 
 * @route GET /sections/:class_id
 * @returns {Object} 200 - Section details
 * @returns {Object} 404 - Section not found
 * @returns {Object} 500 - Query failure
 */
router.get('/sections/:class_id', async (req, res) => {
  try {
    const { class_id } = req.params;

    const sql = `
      SELECT
        cs.class_id,
        cs.section_num,
        cs.capacity,
        cs.location_text,
        cs.requires_dept_permission,
        cs.notes,
        cs.term_id,
        cs.course_id,
        cs.instructor_id,
        c.subject,
        c.course_num,
        c.title,
        c.credits,
        c.description,
        COALESCE(c.sbc, '') AS sbc,
        COALESCE(cs.meeting_days, '') AS meeting_days,
        COALESCE(cs.meeting_times, '') AS meeting_times,
        u.first_name || ' ' || u.last_name AS instructor_name,
        u.email AS instructor_email,
        r.building,
        r.room,
        t.semester::text AS semester,
        t.year,
        COUNT(e.student_id) FILTER (WHERE e.status = 'registered') AS enrolled_count
      FROM class_sections cs
      JOIN courses c ON c.course_id = cs.course_id
      JOIN terms t ON t.term_id = cs.term_id
      LEFT JOIN users u ON u.user_id = cs.instructor_id
      LEFT JOIN rooms r ON r.room_id = cs.room_id
      LEFT JOIN enrollments e ON e.class_id = cs.class_id
      WHERE cs.class_id = $1
      GROUP BY cs.class_id, cs.section_num, cs.capacity, cs.location_text,
               cs.requires_dept_permission, cs.notes, cs.term_id, cs.course_id,
               cs.instructor_id, c.subject, c.course_num, c.title, c.credits,
               c.description, c.sbc, cs.meeting_days, cs.meeting_times,
               u.first_name, u.last_name, u.email, r.building, r.room,
               t.semester, t.year
    `;

    const result = await req.db.query(sql, [class_id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        ok: false, 
        error: 'Section not found' 
      });
    }

    const row = result.rows[0];
    const section = {
      classId: row.class_id,
      sectionNumber: row.section_num,
      courseId: row.course_id,
      subject: row.subject,
      courseNum: row.course_num,
      courseCode: `${row.subject}${row.course_num}`,
      title: row.title,
      credits: parseFloat(row.credits),
      description: row.description,
      sbc: row.sbc || '',
      meetingDays: row.meeting_days || '',
      meetingTimes: row.meeting_times || '',
      instructor: row.instructor_id ? {
        id: row.instructor_id,
        name: row.instructor_name,
        email: row.instructor_email
      } : null,
      location: row.location_text || (row.building && row.room ? `${row.building} ${row.room}` : null),
      capacity: row.capacity,
      enrolled: parseInt(row.enrolled_count) || 0,
      available: row.capacity - (parseInt(row.enrolled_count) || 0),
      requiresPermission: row.requires_dept_permission,
      notes: row.notes,
      term: {
        id: row.term_id,
        semester: row.semester,
        year: row.year
      }
    };

    return res.json({ ok: true, section });
  } catch (e) {
    console.error('[schedule] /sections/:class_id failed:', e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * GET /enrollments/:student_id
 * Get all enrollments for a specific student.
 * 
 * Query params:
 *   - term_id: Optional term filter
 *   - status: Optional status filter (registered, waitlisted, etc.)
 * 
 * @route GET /enrollments/:student_id
 * @returns {Object} 200 - List of student enrollments
 * @returns {Object} 500 - Query failure
 */
router.get('/enrollments/:student_id', async (req, res) => {
  try {
    const { student_id } = req.params;
    const { term_id, status } = req.query;

    let sql = `
      SELECT
        e.class_id,
        e.student_id,
        e.status::text AS enrollment_status,
        e.gpnc,
        e.credits,
        e.grade::text AS grade,
        e.added_at,
        e.updated_at,
        cs.section_num,
        cs.term_id,
        c.course_id,
        c.subject,
        c.course_num,
        c.title,
        c.credits AS course_credits,
        u.first_name || ' ' || u.last_name AS instructor_name,
        t.semester::text AS semester,
        t.year
      FROM enrollments e
      JOIN class_sections cs ON cs.class_id = e.class_id
      JOIN courses c ON c.course_id = cs.course_id
      JOIN terms t ON t.term_id = cs.term_id
      LEFT JOIN users u ON u.user_id = cs.instructor_id
      WHERE e.student_id = $1
    `;

    const params = [student_id];
    let paramIndex = 1;

    if (term_id) {
      paramIndex++;
      sql += ` AND cs.term_id = $${paramIndex}`;
      params.push(term_id);
    }

    if (status) {
      paramIndex++;
      sql += ` AND e.status::text = $${paramIndex}`;
      params.push(status);
    }

    sql += ` ORDER BY t.year DESC, t.semester DESC, c.subject, c.course_num`;

    const result = await req.db.query(sql, params);

    const enrollments = result.rows.map(row => ({
      classId: row.class_id,
      studentId: row.student_id,
      sectionNumber: row.section_num,
      courseId: row.course_id,
      subject: row.subject,
      courseNum: row.course_num,
      courseCode: `${row.subject}${row.course_num}`,
      title: row.title,
      credits: parseFloat(row.credits || row.course_credits),
      instructor: row.instructor_name || null,
      term: {
        id: row.term_id,
        semester: row.semester,
        year: row.year
      },
      status: row.enrollment_status,
      grade: row.grade,
      gpnc: row.gpnc,
      addedAt: row.added_at,
      updatedAt: row.updated_at
    }));

    return res.json({ 
      ok: true, 
      count: enrollments.length,
      enrollments 
    });
  } catch (e) {
    console.error('[schedule] /enrollments/:student_id failed:', e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * POST /enrollments
 * Register a student for a course section.
 * 
 * Body:
 *   - student_id: Student's user_id
 *   - class_id: Section to enroll in
 *   - gpnc: Optional boolean for GPNC option
 * 
 * @route POST /enrollments
 * @returns {Object} 200 - Enrollment successful
 * @returns {Object} 400 - Invalid request or validation failure
 * @returns {Object} 409 - Conflict (already enrolled, full, etc.)
 * @returns {Object} 500 - Query failure
 */
router.post('/enrollments', async (req, res) => {
  try {
    const { student_id, class_id, gpnc } = req.body;

    if (!student_id || !class_id) {
      return res.status(400).json({ 
        ok: false, 
        error: 'student_id and class_id are required' 
      });
    }

    // Check if section exists and get details
    const sectionCheck = await req.db.query(
      `SELECT capacity, term_id, course_id FROM class_sections WHERE class_id = $1`,
      [class_id]
    );

    if (sectionCheck.rows.length === 0) {
      return res.status(404).json({ 
        ok: false, 
        error: 'Section not found' 
      });
    }

    const section = sectionCheck.rows[0];

    // Check if already enrolled
    const existingEnrollment = await req.db.query(
      `SELECT class_id FROM enrollments 
       WHERE student_id = $1 AND class_id = $2 
       AND status IN ('registered', 'waitlisted')`,
      [student_id, class_id]
    );

    if (existingEnrollment.rows.length > 0) {
      return res.status(409).json({ 
        ok: false, 
        error: 'Student is already enrolled or waitlisted in this section' 
      });
    }

    // Count current enrollments
    const enrollmentCount = await req.db.query(
      `SELECT COUNT(*) as count FROM enrollments 
       WHERE class_id = $1 AND status = 'registered'`,
      [class_id]
    );

    const enrolled = parseInt(enrollmentCount.rows[0].count) || 0;
    const available = section.capacity - enrolled;

    if (available <= 0) {
      // Add to waitlist
      await req.db.query(
        `INSERT INTO enrollments (student_id, class_id, status, gpnc, credits)
         VALUES ($1, $2, 'waitlisted', $3, (SELECT credits FROM courses WHERE course_id = $4))`,
        [student_id, class_id, gpnc || false, section.course_id]
      );

      return res.status(201).json({ 
        ok: true, 
        message: 'Added to waitlist (section is full)',
        waitlisted: true
      });
    }

    // Insert enrollment
    await req.db.query(
      `INSERT INTO enrollments (student_id, class_id, status, gpnc, credits)
       VALUES ($1, $2, 'registered', $3, (SELECT credits FROM courses WHERE course_id = $4))`,
      [student_id, class_id, gpnc || false, section.course_id]
    );

    return res.status(201).json({ 
      ok: true, 
      message: 'Successfully enrolled in course',
      waitlisted: false
    });
  } catch (e) {
    console.error('[schedule] POST /enrollments failed:', e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * DELETE /enrollments/:student_id/:class_id
 * Withdraw a student from a course.
 * 
 * @route DELETE /enrollments/:student_id/:class_id
 * @returns {Object} 200 - Withdrawal successful
 * @returns {Object} 404 - Enrollment not found
 * @returns {Object} 500 - Query failure
 */
router.delete('/enrollments/:student_id/:class_id', async (req, res) => {
  try {
    const { student_id, class_id } = req.params;

    // Get enrollment details
    const enrollment = await req.db.query(
      `SELECT status FROM enrollments 
       WHERE student_id = $1 AND class_id = $2`,
      [student_id, class_id]
    );

    if (enrollment.rows.length === 0) {
      return res.status(404).json({ 
        ok: false, 
        error: 'Enrollment not found' 
      });
    }

    // Delete enrollment
    await req.db.query(
      `DELETE FROM enrollments WHERE student_id = $1 AND class_id = $2`,
      [student_id, class_id]
    );

    return res.json({ 
      ok: true, 
      message: 'Successfully withdrew from course' 
    });
  } catch (e) {
    console.error('[schedule] DELETE /enrollments failed:', e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

export default router;

