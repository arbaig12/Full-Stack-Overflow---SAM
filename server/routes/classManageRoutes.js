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
    room: row.building && row.room ? `${row.building} ${row.room}` : '',
    instructorId: row.instructor_id,
    instructorName: row.instructor_id ? `${row.first_name} ${row.last_name}` : '',
    requiresPermission: row.requires_dept_permission,
    notes: row.notes || '',
  };
}

async function fetchSectionById(db, classIdNum) {
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

      COUNT(e.student_id) FILTER (WHERE e.status = 'registered') AS enrolled
    FROM class_sections cs
    JOIN terms t ON t.term_id = cs.term_id
    JOIN courses c ON c.course_id = cs.course_id
    LEFT JOIN rooms r ON r.room_id = cs.room_id
    LEFT JOIN users u ON u.user_id = cs.instructor_id
    LEFT JOIN enrollments e ON e.class_id = cs.class_id
    WHERE cs.class_id = $1
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
    `,
    [classIdNum]
  );

  return sectionRowRes.rows.length ? mapSectionRow(sectionRowRes.rows[0]) : null;
}

router.get('/init', async (req, res) => {
  try {
    const db = req.db;

    const [termsRes, coursesRes, instructorsRes, roomsRes, sectionsRes] =
      await Promise.all([
        db.query(
          `
          SELECT term_id, semester::text AS semester, year
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
          SELECT user_id, first_name, last_name, email
          FROM users
          WHERE role = 'Instructor'
          ORDER BY last_name, first_name
          `
        ),

        db.query(
          `
          SELECT room_id, building, room, capacity
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

    return res.json({ ok: true, terms, courses, instructors, rooms, sections });
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
      allowRoomCapacityIncrease, // ✅ NEW
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
      return res.status(400).json({ ok: false, error: 'termId and courseId must be numeric.' });
    }

    if (!Number.isFinite(capNum) || capNum < 0) {
      return res.status(400).json({ ok: false, error: 'capacity must be a non-negative number.' });
    }

    const termCheck = await db.query('SELECT term_id FROM terms WHERE term_id = $1', [termIdNum]);
    if (termCheck.rows.length === 0) {
      return res.status(400).json({ ok: false, error: `Term ${termIdNum} does not exist.` });
    }

    const courseCheck = await db.query('SELECT course_id FROM courses WHERE course_id = $1', [courseIdNum]);
    if (courseCheck.rows.length === 0) {
      return res.status(400).json({ ok: false, error: `Course ${courseIdNum} does not exist.` });
    }

    let roomIdNum = null;
    if (roomId) {
      roomIdNum = Number(roomId);
      if (!Number.isFinite(roomIdNum)) {
        return res.status(400).json({ ok: false, error: 'roomId must be numeric if provided.' });
      }

      const roomRes = await db.query('SELECT capacity FROM rooms WHERE room_id = $1', [roomIdNum]);
      if (roomRes.rows.length === 0) {
        return res.status(400).json({ ok: false, error: `Room ${roomIdNum} does not exist.` });
      }

      const roomCapacity = Number(roomRes.rows[0].capacity) || 0;

      // ✅ NEW behavior: confirm on UI, then allow bump
      if (capNum > roomCapacity && !allowRoomCapacityIncrease) {
        return res.status(409).json({
          ok: false,
          code: 'ROOM_CAPACITY_EXCEEDED',
          error: `Class capacity (${capNum}) cannot exceed room capacity (${roomCapacity}).`,
          requestedCapacity: capNum,
          roomCapacity,
          roomId: roomIdNum,
        });
      }
    }

    let instructorIdNum = null;
    if (instructorId) {
      instructorIdNum = Number(instructorId);
      if (!Number.isFinite(instructorIdNum)) {
        return res.status(400).json({ ok: false, error: 'instructorId must be numeric if provided.' });
      }

      const instRes = await db.query('SELECT role FROM users WHERE user_id = $1', [instructorIdNum]);
      if (instRes.rows.length === 0) {
        return res.status(400).json({ ok: false, error: `Instructor with id ${instructorIdNum} does not exist.` });
      }
      if (instRes.rows[0].role !== 'Instructor') {
        return res.status(400).json({ ok: false, error: 'Selected user is not an Instructor.' });
      }
    }

    const requiresPerm = Boolean(requiresDeptPermission);

    // ✅ If we are allowed to bump room capacity, do it inside a transaction then insert section.
    await db.query('BEGIN');

    try {
      if (roomIdNum && allowRoomCapacityIncrease) {
        // update only if needed
        await db.query(
          `
          UPDATE rooms
          SET capacity = GREATEST(capacity, $1)
          WHERE room_id = $2
          `,
          [capNum, roomIdNum]
        );
      } else if (roomIdNum) {
        // still enforce in case capacity changed between checks
        const roomRes2 = await db.query('SELECT capacity FROM rooms WHERE room_id = $1', [roomIdNum]);
        const roomCapacity2 = Number(roomRes2.rows[0]?.capacity) || 0;
        if (capNum > roomCapacity2) {
          await db.query('ROLLBACK');
          return res.status(409).json({
            ok: false,
            code: 'ROOM_CAPACITY_EXCEEDED',
            error: `Class capacity (${capNum}) cannot exceed room capacity (${roomCapacity2}).`,
            requestedCapacity: capNum,
            roomCapacity: roomCapacity2,
            roomId: roomIdNum,
          });
        }
      }

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
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
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
          await db.query('ROLLBACK');
          return res.status(409).json({
            ok: false,
            error: 'A section with this term, course, and section number already exists.',
          });
        }
        throw e;
      }

      await db.query('COMMIT');

      const section = await fetchSectionById(db, inserted.class_id);

      return res.status(201).json({
        ok: true,
        classId: inserted.class_id,
        section,
        message: 'Class section created successfully.',
      });
    } catch (e) {
      await db.query('ROLLBACK');
      throw e;
    }
  } catch (e) {
    console.error('[class-manage] POST /sections failed:', e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * ✅ UPDATE an existing section
 * PUT /api/class-manage/sections/:classId
 */
router.put('/sections/:classId', async (req, res) => {
  const db = req.db;

  try {
    const classIdNum = Number(req.params.classId);
    if (!Number.isFinite(classIdNum)) {
      return res.status(400).json({ ok: false, error: 'classId must be numeric.' });
    }

    // Ensure section exists
    const existsRes = await db.query('SELECT class_id FROM class_sections WHERE class_id = $1', [classIdNum]);
    if (existsRes.rows.length === 0) {
      return res.status(404).json({ ok: false, error: `Class section ${classIdNum} not found.` });
    }

    const {
      sectionNum,
      capacity,
      meetingDays,
      meetingTimes,
      roomId,
      instructorId,
      requiresDeptPermission,
      notes,
      allowRoomCapacityIncrease, // ✅ NEW
    } = req.body || {};

    if (!sectionNum) {
      return res.status(400).json({ ok: false, error: 'sectionNum is required.' });
    }

    const capNum = Number(capacity);
    if (!Number.isFinite(capNum) || capNum < 0) {
      return res.status(400).json({ ok: false, error: 'capacity must be a non-negative number.' });
    }

    const meetingDaysStr = String(meetingDays || '').trim();
    if (!meetingDaysStr) {
      return res.status(400).json({ ok: false, error: 'meetingDays is required.' });
    }

    const meetingTimesStr = String(meetingTimes || '').trim();
    if (!meetingTimesStr || !meetingTimesStr.includes('-')) {
      return res.status(400).json({ ok: false, error: 'meetingTimes must look like "HH:MM-HH:MM".' });
    }

    let roomIdNum = null;
    if (roomId) {
      roomIdNum = Number(roomId);
      if (!Number.isFinite(roomIdNum)) {
        return res.status(400).json({ ok: false, error: 'roomId must be numeric if provided.' });
      }

      const roomRes = await db.query('SELECT capacity FROM rooms WHERE room_id = $1', [roomIdNum]);
      if (roomRes.rows.length === 0) {
        return res.status(400).json({ ok: false, error: `Room ${roomIdNum} does not exist.` });
      }

      const roomCapacity = Number(roomRes.rows[0].capacity) || 0;

      if (capNum > roomCapacity && !allowRoomCapacityIncrease) {
        return res.status(409).json({
          ok: false,
          code: 'ROOM_CAPACITY_EXCEEDED',
          error: `Class capacity (${capNum}) cannot exceed room capacity (${roomCapacity}).`,
          requestedCapacity: capNum,
          roomCapacity,
          roomId: roomIdNum,
        });
      }
    }

    let instructorIdNum = null;
    if (instructorId) {
      instructorIdNum = Number(instructorId);
      if (!Number.isFinite(instructorIdNum)) {
        return res.status(400).json({ ok: false, error: 'instructorId must be numeric if provided.' });
      }

      const instRes = await db.query('SELECT role FROM users WHERE user_id = $1', [instructorIdNum]);
      if (instRes.rows.length === 0) {
        return res.status(400).json({ ok: false, error: `Instructor with id ${instructorIdNum} does not exist.` });
      }
      if (instRes.rows[0].role !== 'Instructor') {
        return res.status(400).json({ ok: false, error: 'Selected user is not an Instructor.' });
      }
    }

    const requiresPerm = Boolean(requiresDeptPermission);

    await db.query('BEGIN');

    try {
      if (roomIdNum && allowRoomCapacityIncrease) {
        await db.query(
          `
          UPDATE rooms
          SET capacity = GREATEST(capacity, $1)
          WHERE room_id = $2
          `,
          [capNum, roomIdNum]
        );
      } else if (roomIdNum) {
        // enforce again in case room changed concurrently
        const roomRes2 = await db.query('SELECT capacity FROM rooms WHERE room_id = $1', [roomIdNum]);
        const roomCapacity2 = Number(roomRes2.rows[0]?.capacity) || 0;
        if (capNum > roomCapacity2) {
          await db.query('ROLLBACK');
          return res.status(409).json({
            ok: false,
            code: 'ROOM_CAPACITY_EXCEEDED',
            error: `Class capacity (${capNum}) cannot exceed room capacity (${roomCapacity2}).`,
            requestedCapacity: capNum,
            roomCapacity: roomCapacity2,
            roomId: roomIdNum,
          });
        }
      }

      try {
        await db.query(
          `
          UPDATE class_sections
          SET
            section_num = $1,
            capacity = $2,
            room_id = $3,
            instructor_id = $4,
            meeting_days = $5,
            meeting_times = $6,
            requires_dept_permission = $7,
            notes = $8
          WHERE class_id = $9
          `,
          [
            String(sectionNum).trim(),
            capNum,
            roomIdNum,
            instructorIdNum,
            meetingDaysStr,
            meetingTimesStr,
            requiresPerm,
            String(notes || '').trim(),
            classIdNum,
          ]
        );
      } catch (e) {
        if (e.code === '23505') {
          await db.query('ROLLBACK');
          return res.status(409).json({
            ok: false,
            error: 'A section with this term, course, and section number already exists.',
          });
        }
        throw e;
      }

      await db.query('COMMIT');

      const section = await fetchSectionById(db, classIdNum);

      return res.json({
        ok: true,
        section,
        message: 'Class section updated successfully.',
      });
    } catch (e) {
      await db.query('ROLLBACK');
      throw e;
    }
  } catch (e) {
    console.error('[class-manage] PUT /sections/:classId failed:', e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

export default router;
