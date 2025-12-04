// server/routes/registrationScheduleRoutes.js
import express from 'express';

const router = express.Router();

/**
 * Helper to get current logged-in student id.
 */
function getStudentId(req) {
  return (
    req.user?.user_id ??
    req.user?.userId ??
    req.session?.user?.user_id ??
    null
  );
}

/** Build schedule text */
function buildScheduleText(row) {
  const days = row.meeting_days || '';
  const times = row.meeting_times || '';
  const combined = `${days} ${times}`.trim();
  if (combined) return combined;
  if (row.location_text) return row.location_text;
  return 'TBA';
}

/**
 * GET /api/registration/init
 */
router.get('/init', async (req, res) => {
  const studentId = getStudentId(req);
  if (!studentId) {
    return res.status(401).json({ ok: false, error: 'Not authenticated' });
  }

  try {
    // current term
    const systemRes = await req.db.query(`
      SELECT ss.current_term_id,
             t.term_id, t.semester, t.year
      FROM system_state ss
      LEFT JOIN terms t ON t.term_id = ss.current_term_id
      LIMIT 1
    `);

    let currentTerm = null;
    if (systemRes.rows[0]?.term_id) {
      const r = systemRes.rows[0];
      currentTerm = {
        termId: r.term_id,
        semester: r.semester,
        year: r.year
      };
    }

    // all terms
    const termsRes = await req.db.query(`
      SELECT term_id, semester, year
      FROM terms
      ORDER BY year DESC, semester ASC
    `);

    const terms = termsRes.rows.map(t => ({
      termId: t.term_id,
      semester: t.semester,
      year: t.year
    }));

    const sectionsRes = await req.db.query(`
      SELECT
        cs.class_id,
        cs.term_id,
        cs.section_num,
        cs.capacity,
        cs.location_text,
        cs.meeting_days,
        cs.meeting_times,

        c.subject,
        c.course_num,
        c.title AS course_title,
        c.credits,

        t.semester,
        t.year,

        r.building,
        r.room,

        u.first_name AS instructor_first_name,
        u.last_name  AS instructor_last_name,

        (
          SELECT COUNT(*)
          FROM enrollments e
          WHERE e.class_id = cs.class_id
          AND e.status = 'registered'
        ) AS registered_count
      FROM class_sections cs
      JOIN courses c ON c.course_id = cs.course_id
      JOIN terms t ON t.term_id = cs.term_id
      LEFT JOIN rooms r ON r.room_id = cs.room_id
      LEFT JOIN users u ON u.user_id = cs.instructor_id
      ORDER BY t.year DESC, t.semester ASC, c.subject, c.course_num, cs.section_num
    `);

    const sections = sectionsRes.rows.map((row) => {
        const scheduleText = buildScheduleText(row);

        return {
            classId: row.class_id,
            termId: row.term_id,
            termLabel: `${row.semester} ${row.year}`,
            sectionNum: row.section_num,
            capacity: row.capacity,
            enrolledCount: Number(row.enrolled_count) || 0,

            courseCode: `${row.subject} ${row.course_num}`,
            courseTitle: row.course_title,
            credits: Number(row.credits) || 0,

            instructorName:
            row.instructor_first_name || row.instructor_last_name
                ? `${row.instructor_first_name ?? ''} ${
                    row.instructor_last_name ?? ''
                }`.trim()
                : null,

            // NEW: raw fields for conflict logic
            meetingDays: row.meeting_days,
            meetingTimes: row.meeting_times,

            scheduleText,
            roomLabel:
            row.building && row.room ? `${row.building} ${row.room}` : '',
        };
        });

    // student enrollments
    const enrollmentsRes = await req.db.query(`
      SELECT
        e.enrollment_id,
        e.class_id,
        e.student_id,
        e.status,
        e.grade,
        e.grading_basis,
        e.enrolled_at,

        cs.term_id,
        cs.section_num,
        cs.location_text,
        cs.meeting_days,
        cs.meeting_times,

        c.subject,
        c.course_num,
        c.title AS course_title,
        c.credits,

        t.semester,
        t.year,

        r.building,
        r.room,

        u.first_name AS instructor_first_name,
        u.last_name AS instructor_last_name
      FROM enrollments e
      JOIN class_sections cs ON cs.class_id = e.class_id
      JOIN courses c       ON c.course_id = cs.course_id
      JOIN terms t         ON t.term_id = cs.term_id
      LEFT JOIN rooms r    ON r.room_id = cs.room_id
      LEFT JOIN users u    ON u.user_id = cs.instructor_id
      WHERE e.student_id = $1
      ORDER BY t.year DESC, t.semester ASC, c.subject, c.course_num, cs.section_num
    `, [studentId]);

    const enrollments = enrollmentsRes.rows.map((row) => {
        const scheduleText = buildScheduleText(row);

        return {
            enrollmentId: row.enrollment_id,
            classId: row.class_id,
            termId: row.term_id,
            termLabel: `${row.semester} ${row.year}`,
            sectionNum: row.section_num,

            courseCode: `${row.subject} ${row.course_num}`,
            courseTitle: row.course_title,
            credits: Number(row.credits) || 0,

            instructorName:
            row.instructor_first_name || row.instructor_last_name
                ? `${row.instructor_first_name ?? ''} ${
                    row.instructor_last_name ?? ''
                }`.trim()
                : null,

            meetingDays: row.meeting_days,
            meetingTimes: row.meeting_times,

            scheduleText,
            roomLabel:
            row.building && row.room ? `${row.building} ${row.room}` : '',

            status: row.status,
            grade: row.grade,
            gradingBasis: row.grading_basis,
            enrolledAt: row.enrolled_at,
        };
    });

    return res.json({
      ok: true,
      systemState: { currentTerm },
      terms,
      sections,
      enrollments
    });

  } catch (err) {
    console.error('[registration/init]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * POST /api/registration/enroll
 * Body: { classId }
 */
router.post('/enroll', async (req, res) => {
  const studentId = getStudentId(req);

  if (!studentId)
    return res.status(401).json({ ok: false, error: 'Not authenticated' });

  const { classId } = req.body;
  if (!classId)
    return res.status(400).json({ ok: false, error: 'Missing classId' });

  const client = req.db;

  try {
    await client.query('BEGIN');

    // Lock the section
    const secRes = await client.query(`
      SELECT *
      FROM class_sections
      WHERE class_id = $1
      FOR UPDATE
    `, [classId]);

    if (secRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, error: 'Section not found' });
    }

    const secRow = secRes.rows[0];

    // current registered count
    const countRes = await client.query(`
      SELECT COUNT(*) AS registered_count
      FROM enrollments
      WHERE class_id = $1
      AND status = 'registered'
    `, [classId]);

    const registeredCount = Number(countRes.rows[0].registered_count);

    if (registeredCount >= secRow.capacity) {
      await client.query('ROLLBACK');
      return res.status(400).json({ ok: false, error: 'Class is full' });
    }

    // Already registered?
    const existRes = await client.query(`
      SELECT 1
      FROM enrollments
      WHERE class_id = $1 AND student_id = $2
      LIMIT 1
    `, [classId, studentId]);

    if (existRes.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ ok: false, error: 'Already registered' });
    }

    // insert new registration
    const enrollRes = await client.query(`
      INSERT INTO enrollments (class_id, student_id, status, enrolled_at)
      VALUES ($1, $2, 'registered', NOW())
      RETURNING enrollment_id, class_id, student_id, status, grade, grading_basis, enrolled_at
    `, [classId, studentId]);

    const eRow = enrollRes.rows[0];

    // new registered count
    const countAfterRes = await client.query(`
      SELECT COUNT(*) AS registered_count
      FROM enrollments
      WHERE class_id = $1
      AND status = 'registered'
    `, [classId]);
    const newCount = Number(countAfterRes.rows[0].registered_count);

    // Fetch metadata
    const metaRes = await client.query(`
      SELECT
        cs.class_id,
        cs.term_id,
        cs.section_num,
        cs.capacity,
        cs.location_text,
        cs.meeting_days,
        cs.meeting_times,

        c.subject,
        c.course_num,
        c.title AS course_title,
        c.credits,

        t.semester,
        t.year,

        r.building,
        r.room,

        u.first_name AS instructor_first_name,
        u.last_name  AS instructor_last_name
      FROM class_sections cs
      JOIN courses c ON c.course_id = cs.course_id
      JOIN terms t   ON t.term_id = cs.term_id
      LEFT JOIN rooms r ON r.room_id = cs.room_id
      LEFT JOIN users u ON u.user_id = cs.instructor_id
      WHERE cs.class_id = $1
    `, [classId]);

    const row = metaRes.rows[0];

    await client.query('COMMIT');

    const termLabel = `${row.semester} ${row.year}`;
    const instructorName =
      row.instructor_first_name || row.instructor_last_name
        ? `${row.instructor_first_name ?? ''} ${row.instructor_last_name ?? ''}`.trim()
        : null;

    const scheduleText = buildScheduleText(row);
    const roomLabel = row.building && row.room ? `${row.building} ${row.room}` : '';

    return res.json({
        ok: true,
        enrollment: {
            enrollmentId: eRow.enrollment_id,
            classId: eRow.class_id,
            termId: row.term_id,
            termLabel,
            sectionNum: row.section_num,
            courseCode: `${row.subject} ${row.course_num}`,
            courseTitle: row.course_title,
            credits: Number(row.credits),
            instructorName,
            meetingDays: row.meeting_days,
            meetingTimes: row.meeting_times,
            scheduleText,
            roomLabel,
            status: eRow.status,
            grade: eRow.grade,
            gradingBasis: eRow.grading_basis,
            enrolledAt: eRow.enrolled_at
        },
        updatedSection: {
            classId: row.class_id,
            termId: row.term_id,
            termLabel,
            sectionNum: row.section_num,
            capacity: row.capacity,
            enrolledCount: newCount,
            courseCode: `${row.subject} ${row.course_num}`,
            courseTitle: row.course_title,
            credits: Number(row.credits),
            instructorName,
            meetingDays: row.meeting_days,
            meetingTimes: row.meeting_times,
            scheduleText,
            roomLabel
        }
    });
  } catch (err) {
    try { await req.db.query('ROLLBACK'); } catch (_) {}
    console.error('[registration/enroll]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * POST /api/registration/withdraw
 */
router.post('/withdraw', async (req, res) => {
  const studentId = getStudentId(req);
  const { enrollmentId } = req.body;

  if (!studentId)
    return res.status(401).json({ ok: false, error: 'Not authenticated' });

  if (!enrollmentId)
    return res.status(400).json({ ok: false, error: 'Missing enrollmentId' });

  const client = req.db;

  try {
    await client.query('BEGIN');

    const enrRes = await client.query(`
      SELECT enrollment_id, class_id
      FROM enrollments
      WHERE enrollment_id = $1 AND student_id = $2
      LIMIT 1
    `, [enrollmentId, studentId]);

    if (enrRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, error: 'Enrollment not found' });
    }

    const { class_id } = enrRes.rows[0];

    const secRes = await client.query(`
      SELECT *
      FROM class_sections
      WHERE class_id = $1
      FOR UPDATE
    `, [class_id]);

    const secRow = secRes.rows[0];

    await client.query(`
      DELETE FROM enrollments
      WHERE enrollment_id = $1 AND student_id = $2
    `, [enrollmentId, studentId]);

    const countAfterRes = await client.query(`
      SELECT COUNT(*) AS registered_count
      FROM enrollments
      WHERE class_id = $1
      AND status = 'registered'
    `, [class_id]);

    const newCount = Number(countAfterRes.rows[0].registered_count);

    const metaRes = await client.query(`
      SELECT
        cs.class_id,
        cs.term_id,
        cs.section_num,
        cs.capacity,
        cs.location_text,
        cs.meeting_days,
        cs.meeting_times,

        c.subject,
        c.course_num,
        c.title AS course_title,
        c.credits,

        t.semester,
        t.year,

        r.building,
        r.room,

        u.first_name AS instructor_first_name,
        u.last_name  AS instructor_last_name
      FROM class_sections cs
      JOIN courses c ON c.course_id = cs.course_id
      JOIN terms t   ON t.term_id = cs.term_id
      LEFT JOIN rooms r ON r.room_id = cs.room_id
      LEFT JOIN users u ON u.user_id = cs.instructor_id
      WHERE cs.class_id = $1
    `, [class_id]);

    const row = metaRes.rows[0] ?? secRow;

    await client.query('COMMIT');

    const termLabel = `${row.semester} ${row.year}`;
    const instructorName =
      row.instructor_first_name || row.instructor_last_name
        ? `${row.instructor_first_name ?? ''} ${row.instructor_last_name ?? ''}`.trim()
        : null;

    const scheduleText = buildScheduleText(row);
    const roomLabel =
      row.building && row.room ? `${row.building} ${row.room}` : '';

    return res.json({
      ok: true,
      updatedSection: {
        classId: row.class_id,
        termId: row.term_id,
        termLabel,
        sectionNum: row.section_num,
        capacity: row.capacity,
        enrolledCount: newCount,
        courseCode: `${row.subject} ${row.course_num}`,
        courseTitle: row.course_title,
        credits: Number(row.credits),
        instructorName,
        scheduleText,
        roomLabel
      }
    });

  } catch (err) {
    try { await req.db.query('ROLLBACK'); } catch (_) {}
    console.error('[registration/withdraw]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
