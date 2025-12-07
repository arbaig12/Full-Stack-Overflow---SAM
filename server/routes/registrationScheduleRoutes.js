// server/routes/registrationScheduleRoutes.js
/**
 * Comprehensive Registration System Implementation
 * 
 * This module implements all registration features required by the SAM project:
 * - Registration holds (academic advising, financial)
 * - Waitlist functionality with automatic promotion
 * - Time conflict detection and waivers (instructor + advisor approval)
 * - Prerequisite enforcement and waivers
 * - Corequisite enforcement
 * - Anti-requisite enforcement
 * - Registration window enforcement (by class standing and credit thresholds)
 * - Capacity override (registrar can override full classes)
 * 
 * REQUIRED DATABASE TABLES:
 * 
 * 1. registration_holds
 *    - hold_id (PK)
 *    - student_id (FK to users)
 *    - hold_type (enum: 'academic_advising', 'financial', 'disciplinary', 'other')
 *    - note (TEXT)
 *    - placed_by_user_id (FK to users)
 *    - status (enum: 'active', 'removed')
 *    - placed_at (TIMESTAMP)
 *    - removed_at (TIMESTAMP, nullable)
 * 
 * 2. time_conflict_waivers
 *    - waiver_id (PK)
 *    - student_id (FK to users)
 *    - class_id_1 (FK to class_sections)
 *    - class_id_2 (FK to class_sections)
 *    - instructor_approved (BOOLEAN)
 *    - instructor_approved_by (FK to users, nullable)
 *    - instructor_approved_at (TIMESTAMP, nullable)
 *    - advisor_approved (BOOLEAN)
 *    - advisor_approved_by (FK to users, nullable)
 *    - advisor_approved_at (TIMESTAMP, nullable)
 *    - status (enum: 'pending', 'approved', 'denied')
 *    - requested_at (TIMESTAMP)
 * 
 * 3. prerequisite_waivers
 *    - waiver_id (PK)
 *    - student_id (FK to users)
 *    - course_id (FK to courses)
 *    - waived_course_code (TEXT, e.g., 'CSE 114')
 *    - granted_by_user_id (FK to users)
 *    - status (enum: 'approved', 'denied')
 *    - granted_at (TIMESTAMP)
 * 
 * 4. department_permissions
 *    - permission_id (PK)
 *    - student_id (FK to users)
 *    - course_id (FK to courses)
 *    - granted_by_user_id (FK to users)
 *    - status (enum: 'approved', 'denied')
 *    - granted_at (TIMESTAMP)
 *    - UNIQUE(student_id, course_id)
 * 
 * 5. registration_schedules
 *    - schedule_id (PK)
 *    - term_id (FK to terms)
 *    - class_standing (enum: 'U1', 'U2', 'U3', 'U4')
 *    - credit_threshold (INTEGER, nullable)
 *    - registration_start_date (DATE)
 * 
 * 6. capacity_overrides
 *    - override_id (PK)
 *    - student_id (FK to users)
 *    - class_id (FK to class_sections)
 *    - granted_by_user_id (FK to users)
 *    - granted_at (TIMESTAMP)
 *    - UNIQUE(student_id, class_id)
 * 
 * Note: The enrollments table should have a status column with values:
 * 'registered', 'waitlisted', 'dropped', 'withdrawn', 'completed'
 */
import express from 'express';
import { getCurrentDate } from '../utils/dateWrapper.js';

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

/**
 * Helper to get current logged-in user role.
 */
function getUserRole(req) {
  return req.user?.role ?? null;
}

/**
 * Helper: compute class standing from credits
 * U1: 0-23 credits
 * U2: 24-56 credits
 * U3: 57-84 credits
 * U4: 85+ credits
 */
function computeClassStanding(credits) {
  if (credits >= 85) return 'U4';
  if (credits >= 57) return 'U3';
  if (credits >= 24) return 'U2';
  return 'U1';
}

/**
 * Helper: parse course code from prerequisites text (e.g., "CSE 114" from "CSE 114 or equivalent")
 */
function parseCourseCodes(text) {
  if (!text) return [];
  // Match patterns like "CSE 114", "CSE114", "CSE 114 or CSE 214"
  const matches = text.match(/\b([A-Z]{2,4})\s*(\d{3})\b/g);
  if (!matches) return [];
  return matches.map(m => m.replace(/\s+/, ' ').toUpperCase());
}

/**
 * Grade points mapping
 */
const gradePoints = { 
  'A+': 4.0, A: 4.0, 'A-': 3.7, 
  'B+': 3.3, B: 3.0, 'B-': 2.7,
  'C+': 2.3, C: 2.0, 'C-': 1.7, 
  'D+': 1.3, D: 1.0, 'D-': 0.7, 
  F: 0.0 
};

/**
 * Helper: check if student has completed a course with required grade
 */
async function hasCompletedCourse(db, studentId, courseCode, minGrade = 'D') {
  const [subject, num] = courseCode.split(' ');
  if (!subject || !num) return false;

  const result = await db.query(`
    SELECT e.grade, c.credits
    FROM enrollments e
    JOIN class_sections cs ON cs.class_id = e.class_id
    JOIN courses c ON c.course_id = cs.course_id
    WHERE e.student_id = $1
      AND UPPER(c.subject) = $2
      AND c.course_num = $3
      AND e.status IN ('completed', 'registered')
      AND e.grade IS NOT NULL
      AND e.grade != 'F'
      AND e.grade != 'I'
  `, [studentId, subject.toUpperCase(), num]);

  if (result.rows.length === 0) return false;

  // Check minimum grade requirement if specified
  if (minGrade && minGrade !== 'D') {
    const minPoints = gradePoints[minGrade] ?? 0;
    for (const row of result.rows) {
      const grade = row.grade.toUpperCase();
      if (grade === 'P') return true; // Pass always satisfies
      const points = gradePoints[grade] ?? 0;
      if (points >= minPoints) return true;
    }
    return false;
  }

  return true;
}

/**
 * Helper: check if student has prerequisite waiver
 */
async function hasPrerequisiteWaiver(db, studentId, courseId, prerequisiteCourseCode) {
  const result = await db.query(`
    SELECT 1 FROM prerequisite_waivers
    WHERE student_user_id = $1
      AND course_id = $2
      AND waived_course_code = $3
      AND status = 'approved'
  `, [studentId, courseId, prerequisiteCourseCode]);
  return result.rows.length > 0;
}

/**
 * Helper: check if student has department permission
 */
async function hasDepartmentPermission(db, studentId, courseId) {
  const result = await db.query(`
    SELECT 1 FROM department_permissions
    WHERE student_user_id = $1
      AND course_id = $2
      AND status = 'approved'
  `, [studentId, courseId]);
  return result.rows.length > 0;
}

/**
 * Helper: check registration holds
 * Note: Existing schema uses student_user_id and resolved_at (null = active)
 */
async function checkRegistrationHolds(db, studentId) {
  const result = await db.query(`
    SELECT hold_type, note, placed_by_user_id, placed_at
    FROM registration_holds
    WHERE student_user_id = $1
      AND resolved_at IS NULL
  `, [studentId]);
  return result.rows;
}

/**
 * Helper: check registration window
 */
async function checkRegistrationWindow(db, studentId, termId, classStanding, cumulativeCredits) {
  // Get registration schedule for this term
  const scheduleRes = await db.query(`
    SELECT class_standing, credit_threshold, registration_start_date
    FROM registration_schedules
    WHERE term_id = $1
    ORDER BY 
      CASE class_standing
        WHEN 'U4' THEN 1
        WHEN 'U3' THEN 2
        WHEN 'U2' THEN 3
        WHEN 'U1' THEN 4
      END,
      credit_threshold DESC NULLS LAST
  `, [termId]);

  if (scheduleRes.rows.length === 0) {
    // No registration schedule defined, allow registration
    return { allowed: true };
  }

  const currentDate = getCurrentDate();
  
  // Find matching window
  for (const window of scheduleRes.rows) {
    const matchesStanding = window.class_standing === classStanding;
    const matchesThreshold = !window.credit_threshold || cumulativeCredits >= window.credit_threshold;
    
    if (matchesStanding && matchesThreshold) {
      const startDate = new Date(window.registration_start_date);
      if (currentDate >= startDate) {
        // Check end date from academic calendar
        const calendarRes = await db.query(`
          SELECT late_registration_ends
          FROM academic_calendar
          WHERE term_id = $1
          LIMIT 1
        `, [termId]);
        
        if (calendarRes.rows.length > 0 && calendarRes.rows[0].late_registration_ends) {
          const endDate = new Date(calendarRes.rows[0].late_registration_ends);
          if (currentDate > endDate) {
            return { allowed: false, reason: 'Registration period has ended' };
          }
        }
        
        return { allowed: true };
      } else {
        return { allowed: false, reason: `Registration opens on ${startDate.toLocaleDateString()}` };
      }
    }
  }

  return { allowed: false, reason: 'No registration window found for your class standing' };
}

/**
 * Helper: check time conflicts
 */
async function checkTimeConflict(db, studentId, newClassId, termId) {
  // Get new class meeting times
  const newClassRes = await db.query(`
    SELECT meeting_days, meeting_times
    FROM class_sections
    WHERE class_id = $1
  `, [newClassId]);

  if (newClassRes.rows.length === 0 || !newClassRes.rows[0].meeting_days || !newClassRes.rows[0].meeting_times) {
    return { hasConflict: false }; // No time specified, no conflict
  }

  const newDays = newClassRes.rows[0].meeting_days.split(/[,\s\/]+/).map(d => d.trim().toUpperCase());
  const newTimes = newClassRes.rows[0].meeting_times;

  // Get student's enrolled classes for this term
  const enrolledRes = await db.query(`
    SELECT cs.class_id, cs.meeting_days, cs.meeting_times, c.subject, c.course_num
    FROM enrollments e
    JOIN class_sections cs ON cs.class_id = e.class_id
    JOIN courses c ON c.course_id = cs.course_id
    WHERE e.student_id = $1
      AND cs.term_id = $2
      AND e.status = 'registered'
      AND cs.meeting_days IS NOT NULL
      AND cs.meeting_times IS NOT NULL
  `, [studentId, termId]);

  for (const enrolled of enrolledRes.rows) {
    const enrolledDays = enrolled.meeting_days.split(/[,\s\/]+/).map(d => d.trim().toUpperCase());
    const enrolledTimes = enrolled.meeting_times;

    // Check if days overlap
    const dayOverlap = newDays.some(d => enrolledDays.includes(d));
    if (!dayOverlap) continue;

    // Simple time overlap check (can be enhanced with proper time parsing)
    if (enrolledTimes && newTimes) {
      // If both have times and days overlap, assume conflict
      // (Proper implementation would parse times and check ranges)
      return {
        hasConflict: true,
        conflictingClass: {
          classId: enrolled.class_id,
          courseCode: `${enrolled.subject} ${enrolled.course_num}`
        }
      };
    }
  }

  return { hasConflict: false };
}

/**
 * Helper: check if time conflict waiver exists
 */
async function hasTimeConflictWaiver(db, studentId, classId1, classId2) {
  const result = await db.query(`
    SELECT 1 FROM time_conflict_waivers
    WHERE student_user_id = $1
      AND ((class_id_1 = $2 AND class_id_2 = $3) OR (class_id_1 = $3 AND class_id_2 = $2))
      AND instructor_approved = true
      AND advisor_approved = true
      AND status = 'approved'
  `, [studentId, classId1, classId2]);
  return result.rows.length > 0;
}

/**
 * Helper: check prerequisites
 */
async function checkPrerequisites(db, studentId, courseId, prerequisitesText) {
  if (!prerequisitesText || prerequisitesText.trim() === '') {
    return { satisfied: true };
  }

  // Check for department permission requirement
  if (prerequisitesText.toLowerCase().includes('permission of department')) {
    const hasPermission = await hasDepartmentPermission(db, studentId, courseId);
    if (!hasPermission) {
      return { satisfied: false, reason: 'Department permission required' };
    }
  }

  const courseCodes = parseCourseCodes(prerequisitesText);
  if (courseCodes.length === 0) {
    return { satisfied: true }; // No specific courses mentioned
  }

  // Check each prerequisite
  for (const courseCode of courseCodes) {
    const completed = await hasCompletedCourse(db, studentId, courseCode);
    const waived = await hasPrerequisiteWaiver(db, studentId, courseId, courseCode);
    
    if (!completed && !waived) {
      return { satisfied: false, reason: `Prerequisite not satisfied: ${courseCode}` };
    }
  }

  return { satisfied: true };
}

/**
 * Helper: check corequisites
 */
async function checkCorequisites(db, studentId, courseId, termId, corequisitesText) {
  if (!corequisitesText || corequisitesText.trim() === '') {
    return { satisfied: true };
  }

  const courseCodes = parseCourseCodes(corequisitesText);
  if (courseCodes.length === 0) {
    return { satisfied: true };
  }

  // Check if student is registered for any corequisite in the same term
  for (const courseCode of courseCodes) {
    const [subject, num] = courseCode.split(' ');
    if (!subject || !num) continue;

    const enrolledRes = await db.query(`
      SELECT 1
      FROM enrollments e
      JOIN class_sections cs ON cs.class_id = e.class_id
      JOIN courses c ON c.course_id = cs.course_id
      WHERE e.student_id = $1
        AND cs.term_id = $2
        AND UPPER(c.subject) = $3
        AND c.course_num = $4
        AND e.status = 'registered'
    `, [studentId, termId, subject.toUpperCase(), num]);

    if (enrolledRes.rows.length === 0) {
      return { satisfied: false, reason: `Corequisite required: ${courseCode} must be taken in the same term` };
    }
  }

  return { satisfied: true };
}

/**
 * Helper: check anti-requisites
 */
async function checkAntiRequisites(db, studentId, antiRequisitesText) {
  if (!antiRequisitesText || antiRequisitesText.trim() === '') {
    return { satisfied: true };
  }

  const courseCodes = parseCourseCodes(antiRequisitesText);
  if (courseCodes.length === 0) {
    return { satisfied: true };
  }

  // Check if student has credit for any anti-requisite
  for (const courseCode of courseCodes) {
    const [subject, num] = courseCode.split(' ');
    if (!subject || !num) continue;

    const hasCreditRes = await db.query(`
      SELECT 1
      FROM enrollments e
      JOIN class_sections cs ON cs.class_id = e.class_id
      JOIN courses c ON c.course_id = cs.course_id
      WHERE e.student_id = $1
        AND UPPER(c.subject) = $2
        AND c.course_num = $3
        AND e.status IN ('completed', 'registered')
        AND (e.grade IS NULL OR e.grade IN ('P', 'A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-'))
    `, [studentId, subject.toUpperCase(), num]);

    if (hasCreditRes.rows.length > 0) {
      return { satisfied: false, reason: `Anti-requisite: Cannot take this course if you have credit for ${courseCode}` };
    }
  }

  return { satisfied: true };
}

/**
 * Helper: promote waitlist student to registered
 */
async function promoteWaitlistStudent(db, classId) {
  // Get first student on waitlist (by enrollment_id for FIFO)
  const waitlistRes = await db.query(`
    SELECT e.enrollment_id, e.student_id
    FROM enrollments e
    WHERE e.class_id = $1
      AND e.status = 'waitlisted'
    ORDER BY e.enrolled_at ASC
    LIMIT 1
  `, [classId]);

  if (waitlistRes.rows.length === 0) {
    return null;
  }

  const { enrollment_id, student_id } = waitlistRes.rows[0];

  // Update status to registered
  await db.query(`
    UPDATE enrollments
    SET status = 'registered'
    WHERE enrollment_id = $1
  `, [enrollment_id]);

  return { enrollmentId: enrollment_id, studentId: student_id };
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
 * Enhanced enrollment with all validation checks
 * Body: { classId }
 */
router.post('/enroll', async (req, res) => {
  const studentId = getStudentId(req);
  const userRole = getUserRole(req);

  if (!studentId)
    return res.status(401).json({ ok: false, error: 'Not authenticated' });

  const { classId } = req.body;
  if (!classId)
    return res.status(400).json({ ok: false, error: 'Missing classId' });

  const client = req.db;

  try {
    await client.query('BEGIN');

    // 1. Check registration holds
    const holds = await checkRegistrationHolds(client, studentId);
    if (holds.length > 0) {
      await client.query('ROLLBACK');
      const holdTypes = holds.map(h => h.hold_type).join(', ');
      return res.status(403).json({ 
        ok: false, 
        error: `Registration blocked by holds: ${holdTypes}`,
        holds: holds.map(h => ({ type: h.hold_type, note: h.note }))
      });
    }

    // 2. Get section and course details
    const secRes = await client.query(`
      SELECT 
        cs.*,
        c.course_id,
        c.subject,
        c.course_num,
        c.prerequisites,
        c.corequisites,
        c.anti_requisites,
        c.credits,
        t.term_id,
        t.semester,
        t.year
      FROM class_sections cs
      JOIN courses c ON c.course_id = cs.course_id
      JOIN terms t ON t.term_id = cs.term_id
      WHERE cs.class_id = $1
      FOR UPDATE
    `, [classId]);

    if (secRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, error: 'Section not found' });
    }

    const secRow = secRes.rows[0];
    const termId = secRow.term_id;

    // 3. Check if already registered (including same course different section)
    const sameCourseRes = await client.query(`
      SELECT cs2.class_id, cs2.section_num
      FROM enrollments e
      JOIN class_sections cs2 ON cs2.class_id = e.class_id
      WHERE e.student_id = $1
        AND cs2.course_id = $2
        AND cs2.term_id = $3
        AND e.status = 'registered'
    `, [studentId, secRow.course_id, termId]);

    if (sameCourseRes.rows.length > 0) {
      await client.query('ROLLBACK');
      const existing = sameCourseRes.rows[0];
      return res.status(400).json({ 
        ok: false, 
        error: `Already registered for another section of this course (Section ${existing.section_num})` 
      });
    }

    // 4. Check registration window
    const studentRes = await client.query(`
      SELECT 
        COALESCE(SUM(CASE WHEN e.grade IS NOT NULL AND e.grade != 'I' THEN c.credits ELSE 0 END), 0) AS cumulative_credits
      FROM enrollments e
      JOIN class_sections cs ON cs.class_id = e.class_id
      JOIN courses c ON c.course_id = cs.course_id
      WHERE e.student_id = $1
        AND e.status IN ('completed', 'registered')
    `, [studentId]);

    const cumulativeCredits = Number(studentRes.rows[0]?.cumulative_credits || 0);
    const classStanding = computeClassStanding(cumulativeCredits);
    
    const windowCheck = await checkRegistrationWindow(client, studentId, termId, classStanding, cumulativeCredits);
    if (!windowCheck.allowed) {
      await client.query('ROLLBACK');
      return res.status(403).json({ ok: false, error: windowCheck.reason });
    }

    // 5. Check prerequisites
    const prereqCheck = await checkPrerequisites(client, studentId, secRow.course_id, secRow.prerequisites || '');
    if (!prereqCheck.satisfied) {
      await client.query('ROLLBACK');
      return res.status(400).json({ ok: false, error: prereqCheck.reason });
    }

    // 6. Check corequisites
    const coreqCheck = await checkCorequisites(client, studentId, secRow.course_id, termId, secRow.corequisites || '');
    if (!coreqCheck.satisfied) {
      await client.query('ROLLBACK');
      return res.status(400).json({ ok: false, error: coreqCheck.reason });
    }

    // 7. Check anti-requisites
    const antiReqCheck = await checkAntiRequisites(client, studentId, secRow.anti_requisites || '');
    if (!antiReqCheck.satisfied) {
      await client.query('ROLLBACK');
      return res.status(400).json({ ok: false, error: antiReqCheck.reason });
    }

    // 8. Check time conflicts
    const timeConflict = await checkTimeConflict(client, studentId, classId, termId);
    if (timeConflict.hasConflict) {
      // Check if waiver exists
      const hasWaiver = await hasTimeConflictWaiver(
        client, 
        studentId, 
        classId, 
        timeConflict.conflictingClass.classId
      );
      
      if (!hasWaiver) {
        await client.query('ROLLBACK');
        return res.status(400).json({ 
          ok: false, 
          error: `Time conflict with ${timeConflict.conflictingClass.courseCode}. Time conflict waiver required.` 
        });
      }
    }

    // 9. Check capacity (unless registrar override)
    const countRes = await client.query(`
      SELECT COUNT(*) AS registered_count
      FROM enrollments
      WHERE class_id = $1
      AND status = 'registered'
    `, [classId]);

    const registeredCount = Number(countRes.rows[0].registered_count);
    const isRegistrar = userRole === 'Registrar';
    
    // Check for capacity override
    const overrideRes = await client.query(`
      SELECT 1 FROM capacity_overrides
      WHERE student_user_id = $1 AND class_id = $2
    `, [studentId, classId]);
    const hasCapacityOverride = overrideRes.rows.length > 0;

    if (registeredCount >= secRow.capacity && !isRegistrar && !hasCapacityOverride) {
      // Add to waitlist instead
      const waitlistRes = await client.query(`
        INSERT INTO enrollments (class_id, student_id, status, enrolled_at)
        VALUES ($1, $2, 'waitlisted', NOW())
        RETURNING enrollment_id, class_id, student_id, status, enrolled_at
      `, [classId, studentId]);

      await client.query('COMMIT');

      return res.json({
        ok: true,
        waitlisted: true,
        message: 'Class is full. Added to waitlist.',
        enrollment: {
          enrollmentId: waitlistRes.rows[0].enrollment_id,
          classId: waitlistRes.rows[0].class_id,
          status: 'waitlisted'
        }
      });
    }

    // 10. Insert enrollment
    const enrollRes = await client.query(`
      INSERT INTO enrollments (class_id, student_id, status, enrolled_at)
      VALUES ($1, $2, 'registered', NOW())
      RETURNING enrollment_id, class_id, student_id, status, grade, grading_basis, enrolled_at
    `, [classId, studentId]);

    const eRow = enrollRes.rows[0];

    // 11. Update registered count
    const countAfterRes = await client.query(`
      SELECT COUNT(*) AS registered_count
      FROM enrollments
      WHERE class_id = $1
      AND status = 'registered'
    `, [classId]);
    const newCount = Number(countAfterRes.rows[0].registered_count);

    // 12. Fetch metadata for response
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
    try { await client.query('ROLLBACK'); } catch (_) {}
    console.error('[registration/enroll]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * POST /api/registration/withdraw
 * Enhanced withdrawal with automatic waitlist promotion
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
      SELECT enrollment_id, class_id, status
      FROM enrollments
      WHERE enrollment_id = $1 AND student_id = $2
      LIMIT 1
    `, [enrollmentId, studentId]);

    if (enrRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, error: 'Enrollment not found' });
    }

    const { class_id, status } = enrRes.rows[0];

    // Only withdraw registered enrollments (not waitlisted)
    if (status !== 'registered') {
      await client.query('ROLLBACK');
      return res.status(400).json({ ok: false, error: 'Can only withdraw registered enrollments' });
    }

    const secRes = await client.query(`
      SELECT *
      FROM class_sections
      WHERE class_id = $1
      FOR UPDATE
    `, [class_id]);

    if (secRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, error: 'Section not found' });
    }

    const secRow = secRes.rows[0];

    // Delete enrollment
    await client.query(`
      DELETE FROM enrollments
      WHERE enrollment_id = $1 AND student_id = $2
    `, [enrollmentId, studentId]);

    // Check if we should promote a waitlist student
    const countAfterRes = await client.query(`
      SELECT COUNT(*) AS registered_count
      FROM enrollments
      WHERE class_id = $1
      AND status = 'registered'
    `, [class_id]);

    const newCount = Number(countAfterRes.rows[0].registered_count);

    // If there's space and someone on waitlist, promote them
    let promotedStudent = null;
    if (newCount < secRow.capacity) {
      promotedStudent = await promoteWaitlistStudent(client, class_id);
    }

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
      message: promotedStudent ? 'Withdrawn. Waitlist student automatically promoted.' : 'Withdrawn successfully',
      promotedStudent: promotedStudent ? { studentId: promotedStudent.studentId } : null,
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
    try { await client.query('ROLLBACK'); } catch (_) {}
    console.error('[registration/withdraw]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * POST /api/registration/holds
 * Place a registration hold on a student (Registrar or Advisor only)
 * Body: { studentId, holdType, note }
 */
router.post('/holds', async (req, res) => {
  const userRole = getUserRole(req);
  const userId = req.user?.user_id ?? req.user?.userId ?? null;

  if (!['Registrar', 'Advisor'].includes(userRole)) {
    return res.status(403).json({ ok: false, error: 'Only registrars and advisors can place holds' });
  }

  const { studentId, holdType, note } = req.body;

  if (!studentId || !holdType) {
    return res.status(400).json({ ok: false, error: 'studentId and holdType are required' });
  }

  // Validate hold type
  const validHoldTypes = ['academic_advising', 'financial', 'disciplinary', 'other'];
  if (!validHoldTypes.includes(holdType)) {
    return res.status(400).json({ ok: false, error: `Invalid holdType. Must be one of: ${validHoldTypes.join(', ')}` });
  }

  // Check if advisor can place hold on this student (advisors can only place on their advisees)
  if (userRole === 'Advisor') {
    // TODO: Check advisor-advisee relationship
    // For now, allow all advisors to place holds
  }

  try {
    const result = await req.db.query(`
      INSERT INTO registration_holds (student_user_id, hold_type, note, placed_by_user_id, placed_at)
      VALUES ($1, $2, $3, $4, NOW())
      RETURNING hold_id, student_user_id, hold_type, note, placed_at
    `, [studentId, holdType, note || null, userId]);

    return res.json({
      ok: true,
      hold: result.rows[0]
    });
  } catch (err) {
    console.error('[registration/holds]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * DELETE /api/registration/holds/:holdId
 * Remove a registration hold (Registrar or Advisor only)
 */
router.delete('/holds/:holdId', async (req, res) => {
  const userRole = getUserRole(req);
  const userId = req.user?.user_id ?? req.user?.userId ?? null;
  const { holdId } = req.params;

  if (!['Registrar', 'Advisor'].includes(userRole)) {
    return res.status(403).json({ ok: false, error: 'Only registrars and advisors can remove holds' });
  }

  try {
    const result = await req.db.query(`
      UPDATE registration_holds
      SET resolved_at = NOW(), resolved_by_user_id = $2
      WHERE hold_id = $1 AND resolved_at IS NULL
      RETURNING hold_id, student_user_id, hold_type
    `, [holdId, userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Hold not found or already removed' });
    }

    return res.json({
      ok: true,
      message: 'Hold removed successfully'
    });
  } catch (err) {
    console.error('[registration/holds/:holdId]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * POST /api/registration/time-conflict-waiver/request
 * Request a time conflict waiver (Student)
 * Body: { classId1, classId2 }
 */
router.post('/time-conflict-waiver/request', async (req, res) => {
  const studentId = getStudentId(req);
  if (!studentId) {
    return res.status(401).json({ ok: false, error: 'Not authenticated' });
  }

  const { classId1, classId2 } = req.body;
  if (!classId1 || !classId2) {
    return res.status(400).json({ ok: false, error: 'classId1 and classId2 are required' });
  }

  try {
    const result = await req.db.query(`
      INSERT INTO time_conflict_waivers (student_user_id, class_id_1, class_id_2, status, requested_at)
      VALUES ($1, $2, $3, 'pending', NOW())
      RETURNING waiver_id, student_user_id, class_id_1, class_id_2, status
    `, [studentId, classId1, classId2]);

    return res.json({
      ok: true,
      waiver: result.rows[0],
      message: 'Time conflict waiver requested. Requires approval from both instructors and an advisor.'
    });
  } catch (err) {
    console.error('[registration/time-conflict-waiver/request]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * POST /api/registration/time-conflict-waiver/:waiverId/approve-instructor
 * Approve time conflict waiver as instructor
 * Body: { approved: true/false }
 */
router.post('/time-conflict-waiver/:waiverId/approve-instructor', async (req, res) => {
  const userRole = getUserRole(req);
  const userId = req.user?.user_id ?? req.user?.userId ?? null;
  const { waiverId } = req.params;
  const { approved } = req.body;

  if (userRole !== 'Instructor') {
    return res.status(403).json({ ok: false, error: 'Only instructors can approve instructor portion' });
  }

  try {
    // Check if this instructor teaches one of the classes
    const waiverRes = await req.db.query(`
      SELECT class_id_1, class_id_2
      FROM time_conflict_waivers
      WHERE waiver_id = $1
    `, [waiverId]);

    if (waiverRes.rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Waiver not found' });
    }

    const { class_id_1, class_id_2 } = waiverRes.rows[0];

    const instructorCheck = await req.db.query(`
      SELECT 1 FROM class_sections
      WHERE class_id IN ($1, $2) AND instructor_id = $3
    `, [class_id_1, class_id_2, userId]);

    if (instructorCheck.rows.length === 0) {
      return res.status(403).json({ ok: false, error: 'You are not an instructor for either class' });
    }

    await req.db.query(`
      UPDATE time_conflict_waivers
      SET instructor_approved = $1, instructor_approved_by = $2, instructor_approved_at = NOW()
      WHERE waiver_id = $3
    `, [approved, userId, waiverId]);

    // If both instructor and advisor approved, mark as approved
    if (approved) {
      const checkRes = await req.db.query(`
        SELECT instructor_approved, advisor_approved
        FROM time_conflict_waivers
        WHERE waiver_id = $1
      `, [waiverId]);

      if (checkRes.rows[0].instructor_approved && checkRes.rows[0].advisor_approved) {
        await req.db.query(`
          UPDATE time_conflict_waivers
          SET status = 'approved'
          WHERE waiver_id = $1
        `, [waiverId]);
      }
    }

    return res.json({
      ok: true,
      message: approved ? 'Instructor approval recorded' : 'Instructor approval denied'
    });
  } catch (err) {
    console.error('[registration/time-conflict-waiver/:waiverId/approve-instructor]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * POST /api/registration/time-conflict-waiver/:waiverId/approve-advisor
 * Approve time conflict waiver as advisor
 * Body: { approved: true/false }
 */
router.post('/time-conflict-waiver/:waiverId/approve-advisor', async (req, res) => {
  const userRole = getUserRole(req);
  const userId = req.user?.user_id ?? req.user?.userId ?? null;
  const { waiverId } = req.params;
  const { approved } = req.body;

  if (userRole !== 'Advisor') {
    return res.status(403).json({ ok: false, error: 'Only advisors can approve advisor portion' });
  }

  try {
    await req.db.query(`
      UPDATE time_conflict_waivers
      SET advisor_approved = $1, advisor_approved_by = $2, advisor_approved_at = NOW()
      WHERE waiver_id = $3
    `, [approved, userId, waiverId]);

    // If both instructor and advisor approved, mark as approved
    if (approved) {
      const checkRes = await req.db.query(`
        SELECT instructor_approved, advisor_approved
        FROM time_conflict_waivers
        WHERE waiver_id = $1
      `, [waiverId]);

      if (checkRes.rows[0].instructor_approved && checkRes.rows[0].advisor_approved) {
        await req.db.query(`
          UPDATE time_conflict_waivers
          SET status = 'approved'
          WHERE waiver_id = $1
        `, [waiverId]);
      }
    }

    return res.json({
      ok: true,
      message: approved ? 'Advisor approval recorded' : 'Advisor approval denied'
    });
  } catch (err) {
    console.error('[registration/time-conflict-waiver/:waiverId/approve-advisor]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * POST /api/registration/prerequisite-waiver
 * Grant prerequisite waiver (Advisor or Registrar)
 * Body: { studentId, courseId, waivedCourseCode }
 */
router.post('/prerequisite-waiver', async (req, res) => {
  const userRole = getUserRole(req);
  const userId = req.user?.user_id ?? req.user?.userId ?? null;

  if (!['Advisor', 'Registrar'].includes(userRole)) {
    return res.status(403).json({ ok: false, error: 'Only advisors and registrars can grant prerequisite waivers' });
  }

  const { studentId, courseId, waivedCourseCode } = req.body;

  if (!studentId || !courseId || !waivedCourseCode) {
    return res.status(400).json({ ok: false, error: 'studentId, courseId, and waivedCourseCode are required' });
  }

  try {
    const result = await req.db.query(`
      INSERT INTO prerequisite_waivers (student_user_id, course_id, waived_course_code, granted_by_user_id, status, granted_at)
      VALUES ($1, $2, $3, $4, 'approved', NOW())
      RETURNING waiver_id, student_user_id, course_id, waived_course_code
    `, [studentId, courseId, waivedCourseCode, userId]);

    return res.json({
      ok: true,
      waiver: result.rows[0],
      message: 'Prerequisite waiver granted'
    });
  } catch (err) {
    console.error('[registration/prerequisite-waiver]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * POST /api/registration/department-permission
 * Grant department permission (Advisor)
 * Body: { studentId, courseId }
 */
router.post('/department-permission', async (req, res) => {
  const userRole = getUserRole(req);
  const userId = req.user?.user_id ?? req.user?.userId ?? null;

  if (userRole !== 'Advisor') {
    return res.status(403).json({ ok: false, error: 'Only advisors can grant department permission' });
  }

  const { studentId, courseId } = req.body;

  if (!studentId || !courseId) {
    return res.status(400).json({ ok: false, error: 'studentId and courseId are required' });
  }

  try {
    const result = await req.db.query(`
      INSERT INTO department_permissions (student_user_id, course_id, granted_by_user_id, status, granted_at)
      VALUES ($1, $2, $3, 'approved', NOW())
      ON CONFLICT (student_user_id, course_id) 
      DO UPDATE SET status = 'approved', granted_at = NOW()
      RETURNING permission_id, student_user_id, course_id, status
    `, [studentId, courseId, userId]);

    return res.json({
      ok: true,
      permission: result.rows[0],
      message: 'Department permission granted'
    });
  } catch (err) {
    console.error('[registration/department-permission]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * POST /api/registration/schedule
 * Define registration schedule for a term (Registrar only)
 * Body: { termId, windows: [{ classStanding, creditThreshold, registrationStartDate }] }
 */
router.post('/schedule', async (req, res) => {
  const userRole = getUserRole(req);

  if (userRole !== 'Registrar') {
    return res.status(403).json({ ok: false, error: 'Only registrars can define registration schedules' });
  }

  const { termId, windows } = req.body;

  if (!termId || !windows || !Array.isArray(windows)) {
    return res.status(400).json({ ok: false, error: 'termId and windows array are required' });
  }

  try {
    await req.db.query('BEGIN');

    // Delete existing schedule for this term
    await req.db.query(`
      DELETE FROM registration_schedules
      WHERE term_id = $1
    `, [termId]);

    // Insert new windows
    for (const window of windows) {
      const { classStanding, creditThreshold, registrationStartDate } = window;
      
      if (!classStanding || !registrationStartDate) {
        await req.db.query('ROLLBACK');
        return res.status(400).json({ ok: false, error: 'Each window must have classStanding and registrationStartDate' });
      }

      await req.db.query(`
        INSERT INTO registration_schedules (term_id, class_standing, credit_threshold, registration_start_date)
        VALUES ($1, $2, $3, $4)
      `, [termId, classStanding, creditThreshold || null, registrationStartDate]);
    }

    await req.db.query('COMMIT');

    return res.json({
      ok: true,
      message: `Registration schedule defined for term ${termId}`,
      windows: windows.length
    });
  } catch (err) {
    try { await req.db.query('ROLLBACK'); } catch (_) {}
    console.error('[registration/schedule]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * POST /api/registration/capacity-override
 * Grant capacity override permission (Registrar only)
 * Body: { studentId, classId }
 */
router.post('/capacity-override', async (req, res) => {
  const userRole = getUserRole(req);
  const userId = req.user?.user_id ?? req.user?.userId ?? null;

  if (userRole !== 'Registrar') {
    return res.status(403).json({ ok: false, error: 'Only registrars can grant capacity overrides' });
  }

  const { studentId, classId } = req.body;

  if (!studentId || !classId) {
    return res.status(400).json({ ok: false, error: 'studentId and classId are required' });
  }

  try {
    const result = await req.db.query(`
      INSERT INTO capacity_overrides (student_user_id, class_id, granted_by_user_id, granted_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (student_user_id, class_id) 
      DO UPDATE SET granted_at = NOW()
      RETURNING override_id, student_user_id, class_id
    `, [studentId, classId, userId]);

    return res.json({
      ok: true,
      override: result.rows[0],
      message: 'Capacity override granted. Student can now register even if class is full.'
    });
  } catch (err) {
    console.error('[registration/capacity-override]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
