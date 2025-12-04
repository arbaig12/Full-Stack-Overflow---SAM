// server/routes/classManageRoutes.js
import express from 'express';

const router = express.Router();


function mapSectionRow(row) {
  return {
    classId: row.class_id,
    termId: row.term_id,
    term: `${row.term_semester} ${row.term_year}`,
    courseId: row.course_id,
    courseCode: `${row.subject}${row.course_num}`,
    courseTitle: row.course_title,
    sectionNum: row.section_num,
    capacity: Number(row.capacity) || 0,
    enrolled: Number(row.enrolled) || 0,
    meetingDays: row.meeting_days || '',
    meetingTimes: row.meeting_times || '',
    roomId: row.room_id,
    room:
      row.building && row.room
        ? `${row.building} ${row.room}`
        : '',
    instructorId: row.instructor_id,
    instructorName: row.instructor_id
      ? `${row.first_name} ${row.last_name}`
      : '',
    requiresPermission: row.requires_dept_permission,
    notes: row.notes || '',
  };
}


router.get('/init', async (req, res) => {
  try {
    const db = req.db;

    const [termsRes, coursesRes, instructorsRes, roomsRes, sectionsRes] =
      await Promise.all([
        // All terms
        db.query(
          `
          SELECT
            term_id,
            semester::text AS semester,
            year
          FROM terms
          ORDER BY year DESC, semester ASC
          `
        ),

        db.query(
          `
          SELECT
            c.course_id,
            c.subject,
            c.course_num,
            c.title,
            c.catalog_term_id,
            t.semester::text AS catalog_semester,
            t.year AS catalog_year
          FROM courses c
          JOIN terms t ON t.term_id = c.catalog_term_id
          ORDER BY c.subject, c.course_num
          `
        ),

        db.query(
          `
          SELECT
            user_id,
            first_name,
            last_name,
            email
          FROM users
          WHERE role = 'Instructor'
          ORDER BY last_name, first_name
          `
        ),

        db.query(
          `
          SELECT
            room_id,
            building,
            room,
            capacity
          FROM rooms
          ORDER BY building, room
          `
        ),

        db.query(
          `
          SELECT
            cs.class_id,
            cs.course_id,
            cs.term_id,
            cs.section_num,
            cs.capacity,
            cs.meeting_days,
            cs.meeting_times,
            cs.requires_dept_permission,
            cs.notes,
            cs.room_id,
            cs.instructor_id,

            t.semester::text AS term_semester,
            t.year AS term_year,

            c.subject,
            c.course_num,
            c.title AS course_title,

            r.building,
            r.room,
            r.capacity AS room_capacity,

            u.first_name,
            u.last_name,
            COALESCE(u.email, '') AS email,

            -- only count registered enrollments
            COUNT(e.student_id) FILTER (WHERE e.status = 'registered') AS enrolled
          FROM class_sections cs
          JOIN terms t ON t.term_id = cs.term_id
          JOIN courses c ON c.course_id = cs.course_id
          LEFT JOIN rooms r ON r.room_id = cs.room_id
          LEFT JOIN users u ON u.user_id = cs.instructor_id
          LEFT JOIN enrollments e ON e.class_id = cs.class_id
          GROUP BY
            cs.class_id,
            cs.course_id,
            cs.term_id,
            cs.section_num,
            cs.capacity,
            cs.meeting_days,
            cs.meeting_times,
            cs.requires_dept_permission,
            cs.notes,
            cs.room_id,
            cs.instructor_id,
            t.semester,
            t.year,
            c.subject,
            c.course_num,
            c.title,
            r.building,
            r.room,
            r.capacity,
            u.first_name,
            u.last_name,
            u.email
          ORDER BY
            t.year DESC,
            t.semester ASC,
            c.subject,
            c.course_num,
            cs.section_num
          `
        ),
      ]);

    const terms = termsRes.rows.map((t) => ({
      termId: t.term_id,
      semester: t.semester,
      year: t.year,
    }));

    const courses = coursesRes.rows.map((c) => ({
      courseId: c.course_id,
      subject: c.subject,
      courseNum: c.course_num,
      courseCode: `${c.subject}${c.course_num}`,
      title: c.title,
      catalogTermId: c.catalog_term_id,
      catalogTerm: {
        termId: c.catalog_term_id,
        semester: c.catalog_semester,
        year: c.catalog_year,
      },
    }));

    const instructors = instructorsRes.rows.map((u) => ({
      userId: u.user_id,
      firstName: u.first_name,
      lastName: u.last_name,
      email: u.email,
    }));

    const rooms = roomsRes.rows.map((r) => ({
      roomId: r.room_id,
      building: r.building,
      room: r.room,
      capacity: Number(r.capacity) || 0,
    }));

    const sections = sectionsRes.rows.map(mapSectionRow);

    return res.json({
      ok: true,
      terms,
      courses,
      instructors,
      rooms,
      sections,
    });
  } catch (e) {
    console.error('[class-manage] GET /init failed:', e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});


router.post('/sections', async (req, res) => {
  const db = req.db;
  try {
    const {
      termId,
      courseId,
      sectionNum,
      capacity,
      meetingDays,
      meetingTimes,
      roomId,
      instructorId,
      requiresDeptPermission,
      notes,
    } = req.body || {};

    if (!termId || !courseId || !sectionNum) {
      return res.status(400).json({
        ok: false,
        error: 'termId, courseId, and sectionNum are required.',
      });
    }

    const termIdNum = Number(termId);
    const courseIdNum = Number(courseId);
    const capNum = Number(capacity);

    if (!Number.isFinite(termIdNum) || !Number.isFinite(courseIdNum)) {
      return res.status(400).json({
        ok: false,
        error: 'termId and courseId must be numeric.',
      });
    }

    if (!Number.isFinite(capNum) || capNum < 0) {
      return res.status(400).json({
        ok: false,
        error: 'capacity must be a non-negative number.',
      });
    }

    const termCheck = await db.query(
      'SELECT term_id FROM terms WHERE term_id = $1',
      [termIdNum]
    );
    if (termCheck.rows.length === 0) {
      return res
        .status(400)
        .json({ ok: false, error: `Term ${termIdNum} does not exist.` });
    }

    const courseCheck = await db.query(
      'SELECT course_id, subject, course_num FROM courses WHERE course_id = $1',
      [courseIdNum]
    );
    if (courseCheck.rows.length === 0) {
      return res.status(400).json({
        ok: false,
        error: `Course ${courseIdNum} does not exist.`,
      });
    }

    let roomIdNum = null;
    if (roomId) {
      roomIdNum = Number(roomId);
      if (!Number.isFinite(roomIdNum)) {
        return res
          .status(400)
          .json({ ok: false, error: 'roomId must be numeric if provided.' });
      }

      const roomRes = await db.query(
        'SELECT capacity FROM rooms WHERE room_id = $1',
        [roomIdNum]
      );
      if (roomRes.rows.length === 0) {
        return res
          .status(400)
          .json({ ok: false, error: `Room ${roomIdNum} does not exist.` });
      }

      const roomCapacity = Number(roomRes.rows[0].capacity) || 0;
      if (capNum > roomCapacity) {
        return res.status(400).json({
          ok: false,
          error: `Class capacity (${capNum}) cannot exceed room capacity (${roomCapacity}).`,
        });
      }
    }

    let instructorIdNum = null;
    if (instructorId) {
      instructorIdNum = Number(instructorId);
      if (!Number.isFinite(instructorIdNum)) {
        return res.status(400).json({
          ok: false,
          error: 'instructorId must be numeric if provided.',
        });
      }

      const instRes = await db.query(
        `
        SELECT role
        FROM users
        WHERE user_id = $1
        `,
        [instructorIdNum]
      );

      if (instRes.rows.length === 0) {
        return res.status(400).json({
          ok: false,
          error: `Instructor with id ${instructorIdNum} does not exist.`,
        });
      }

      if (instRes.rows[0].role !== 'Instructor') {
        return res.status(400).json({
          ok: false,
          error: 'Selected user is not an Instructor.',
        });
      }
    }

    const requiresPerm = Boolean(requiresDeptPermission);

    let inserted;
    try {
      const insertRes = await db.query(
        `
        INSERT INTO class_sections (
          course_id,
          term_id,
          section_num,
          capacity,
          room_id,
          instructor_id,
          meeting_days,
          meeting_times,
          requires_dept_permission,
          notes
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10
        )
        RETURNING class_id
        `,
        [
          courseIdNum,
          termIdNum,
          String(sectionNum).trim(),
          capNum,
          roomIdNum,
          instructorIdNum,
          (meetingDays || '').trim(),
          (meetingTimes || '').trim(),
          requiresPerm,
          (notes || '').trim(),
        ]
      );
      inserted = insertRes.rows[0];
    } catch (e) {
      if (e.code === '23505') {
        return res.status(409).json({
          ok: false,
          error:
            'A section with this term, course, and section number already exists.',
        });
      }
      throw e;
    }

    const newClassId = inserted.class_id;

    const sectionRowRes = await db.query(
      `
      SELECT
        cs.class_id,
        cs.course_id,
        cs.term_id,
        cs.section_num,
        cs.capacity,
        cs.meeting_days,
        cs.meeting_times,
        cs.requires_dept_permission,
        cs.notes,
        cs.room_id,
        cs.instructor_id,

        t.semester::text AS term_semester,
        t.year AS term_year,

        c.subject,
        c.course_num,
        c.title AS course_title,

        r.building,
        r.room,
        r.capacity AS room_capacity,

        u.first_name,
        u.last_name,
        COALESCE(u.email, '') AS email,

        0 AS enrolled  -- no enrollments yet
      FROM class_sections cs
      JOIN terms t ON t.term_id = cs.term_id
      JOIN courses c ON c.course_id = cs.course_id
      LEFT JOIN rooms r ON r.room_id = cs.room_id
      LEFT JOIN users u ON u.user_id = cs.instructor_id
      WHERE cs.class_id = $1
      `,
      [newClassId]
    );

    const section = sectionRowRes.rows.length
      ? mapSectionRow(sectionRowRes.rows[0])
      : null;

    return res.status(201).json({
      ok: true,
      classId: newClassId,
      section,
      message: 'Class section created successfully.',
    });
  } catch (e) {
    console.error('[class-manage] POST /sections failed:', e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

export default router;
