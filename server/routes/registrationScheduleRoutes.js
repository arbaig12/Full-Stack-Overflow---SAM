// server/routes/registrationScheduleRoutes.js
import express from 'express';
import { getCurrentDate } from '../utils/dateWrapper.js';

const router = express.Router();

function getStudentId(req) {
  return (
    req.user?.user_id ??
    req.user?.userId ??
    req.session?.user?.user_id ??
    null
  );
}

function getUserRole(req) {
  return req.user?.role ?? null;
}

function computeClassStanding(credits) {
  if (credits >= 85) return 'U4';
  if (credits >= 57) return 'U3';
  if (credits >= 24) return 'U2';
  return 'U1';
}

function parseCourseCodes(text) {
  if (!text) return [];
  const matches = text.match(/\b([A-Z]{2,4})\s*(\d{3})\b/g);
  if (!matches) return [];
  return matches.map((m) => m.replace(/\s+/, ' ').toUpperCase());
}

/**
 * Parses prerequisite text into requirement groups with OR and AND logic.
 * Semicolons separate AND groups (all must be satisfied).
 * "or" within a group means OR logic (at least one must be satisfied).
 * 
 * @param {string} prerequisitesText - The prerequisite text to parse
 * @returns {Array} Array of requirement groups, each containing:
 *   - minGrade: minimum grade required (e.g., "C", "B-") or null
 *   - courseCodes: array of course codes in this OR group
 */
function parsePrerequisiteGroups(prerequisitesText) {
  if (!prerequisitesText || prerequisitesText.trim() === '') return [];

  // Split by semicolons to get AND groups (different requirement groups)
  const andGroups = prerequisitesText.split(';').map(g => g.trim()).filter(g => g);

  const requirementGroups = [];

  for (const andGroup of andGroups) {
    let groupText = andGroup;
    let minGrade = null;

    // Extract grade requirement (e.g., "C or higher:", "B- or higher:", "C or better:")
    // Pattern: grade letter optionally followed by +/- followed by "or higher:" or "or better:"
    const gradeMatch = groupText.match(/^([A-Z][+-]?)\s+or\s+(higher|better):\s*/i);
    if (gradeMatch) {
      const gradeStr = gradeMatch[1].toUpperCase();
      // Normalize grade: "C" -> "C", "B-" -> "B-", "C+" -> "C+"
      minGrade = gradeStr;
      groupText = groupText.substring(gradeMatch[0].length).trim();
    }

    // Extract all course codes from the remaining text
    const allCourseCodes = parseCourseCodes(groupText);
    
    // If no course codes found, skip this group
    if (allCourseCodes.length === 0) continue;

    // Check if there are OR conditions by looking for "or" between course codes
    // We need to find "or" that is NOT part of "or higher" or "or better"
    // Look for pattern: course code, then "or", then another course code
    // Use a regex that matches "or" not followed by "higher" or "better"
    const hasOrBetweenCourses = /\b([A-Z]{2,4}\s*\d{3})\s+or\s+(?!higher|better)([A-Z]{2,4}\s*\d{3})/i.test(groupText);
    
    // If there's an "or" between courses, it's an OR group (at least one must be satisfied)
    // If there's no "or", treat each course as a separate requirement (all must be satisfied)
    // For simplicity, we'll treat single courses as OR groups with one item
    if (hasOrBetweenCourses) {
      // OR group: at least one course must be satisfied
      requirementGroups.push({
        minGrade,
        courseCodes: allCourseCodes,
      });
    } else if (allCourseCodes.length === 1) {
      // Single course: must be satisfied
      requirementGroups.push({
        minGrade,
        courseCodes: allCourseCodes,
      });
    } else {
      // Multiple courses without "or": all must be satisfied
      // Treat each as a separate requirement group (AND logic)
      for (const courseCode of allCourseCodes) {
        requirementGroups.push({
          minGrade,
          courseCodes: [courseCode],
        });
      }
    }
  }

  return requirementGroups;
}

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
};

async function hasCompletedCourse(db, studentId, courseCode, minGrade = 'D') {
  const [subject, num] = courseCode.split(' ');
  if (!subject || !num) return false;

  const result = await db.query(
    `
    SELECT e.grade
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
  `,
    [studentId, subject.toUpperCase(), num]
  );

  if (result.rows.length === 0) return false;

  if (minGrade && minGrade !== 'D') {
    const minPoints = gradePoints[minGrade] ?? 0;
    for (const row of result.rows) {
      const grade = String(row.grade).toUpperCase();
      if (grade === 'P') return true;
      const points = gradePoints[grade] ?? 0;
      if (points >= minPoints) return true;
    }
    return false;
  }

  return true;
}

async function hasPrerequisiteWaiver(db, studentId, courseId, prerequisiteCourseCode) {
  const result = await db.query(
    `
    SELECT 1 FROM prerequisite_waivers
    WHERE student_user_id = $1
      AND course_id = $2
      AND waived_course_code = $3
      AND status = 'approved'
  `,
    [studentId, courseId, prerequisiteCourseCode]
  );
  return result.rows.length > 0;
}

async function hasDepartmentPermission(db, studentId, courseId) {
  const result = await db.query(
    `
    SELECT 1 FROM department_permissions
    WHERE student_user_id = $1
      AND course_id = $2
      AND status = 'approved'
  `,
    [studentId, courseId]
  );
  return result.rows.length > 0;
}

async function checkRegistrationHolds(db, studentId) {
  const result = await db.query(
    `
    SELECT hold_type, note, placed_by_user_id, placed_at
    FROM registration_holds
    WHERE student_user_id = $1
      AND resolved_at IS NULL
    `,
    [studentId]
  );
  return result.rows;
}

/**
 * Check if an advisor can place/remove a hold on a student.
 * - University-level advisors: can place holds on any student
 * - College-level advisors: can only place holds on students whose majors are in their college
 * - Department-level advisors: can only place holds on students whose majors are in their department
 * - Registrars: can place any type of hold on any student
 */
export async function canAdvisorPlaceHold(db, advisorId, studentId) {
  try {
    // Registrars can always place holds
    const userCheck = await db.query(
      `SELECT role FROM users WHERE user_id = $1`,
      [advisorId]
    );
    if (userCheck.rows.length > 0 && userCheck.rows[0].role === 'Registrar') {
      return true;
    }

    // Check if advisors table exists and has the user
    let advisorRes;
    try {
      // First try to get advisor info with college_id (if column exists)
      try {
        advisorRes = await db.query(
          `
          SELECT a.level, a.department_id, a.college_id
          FROM advisors a
          WHERE a.user_id = $1
          `,
          [advisorId]
        );
      } catch (colErr) {
        // If college_id column doesn't exist, query without it
        if (colErr.code === '42703') { // Undefined column
          advisorRes = await db.query(
            `
            SELECT a.level, a.department_id
            FROM advisors a
            WHERE a.user_id = $1
            `,
            [advisorId]
          );
        } else {
          throw colErr;
        }
      }
    } catch (tableErr) {
      // If advisors table doesn't exist, be restrictive - deny access
      // Advisors must be properly configured in the advisors table
      console.error('[canAdvisorPlaceHold] Advisors table issue, denying access:', tableErr.message);
      return false;
    }

    // If advisor not in advisors table, deny access
    // Advisors must be properly configured in the advisors table with level and department/college info
    if (advisorRes.rows.length === 0) {
      console.log('[canAdvisorPlaceHold] Advisor not found in advisors table, denying access');
      return false;
    }

    const advisor = advisorRes.rows[0];

    // University-level advisors can place holds on any student
    if (advisor.level === 'university') {
      return true;
    }

    // Get student's majors and their departments/colleges
    const studentMajorsRes = await db.query(
      `
      SELECT p.department_id, d.college_id
      FROM student_programs sp
      JOIN programs p ON p.program_id = sp.program_id
      LEFT JOIN departments d ON d.department_id = p.department_id
      WHERE sp.student_id = $1
        AND p.type = 'MAJOR'
      `,
      [studentId]
    );

    if (studentMajorsRes.rows.length === 0) {
      // Student has no majors - only university-level advisors can place holds
      console.log('[canAdvisorPlaceHold] Student has no majors, denying access');
      return false;
    }

    // Department-level advisors can place holds on students with majors in their department
    if (advisor.level === 'department') {
      const canPlace = studentMajorsRes.rows.some(row => row.department_id === advisor.department_id);
      if (!canPlace) {
        console.log('[canAdvisorPlaceHold] Department-level advisor cannot place hold - student not in their department');
      }
      return canPlace;
    }

    // College-level advisors can place holds on students with majors in their college
    if (advisor.level === 'college') {
      // Get advisor's college_id - prefer direct college_id, fallback to department's college
      let advisorCollegeId = advisor.college_id || null;
      
      // If no direct college_id, try to get it from department
      if (!advisorCollegeId && advisor.department_id) {
        try {
          const collegeRes = await db.query(
            `
            SELECT d.college_id
            FROM departments d
            WHERE d.department_id = $1
            `,
            [advisor.department_id]
          );
          if (collegeRes.rows.length > 0 && collegeRes.rows[0].college_id) {
            advisorCollegeId = collegeRes.rows[0].college_id;
          }
        } catch (colErr) {
          console.log('[canAdvisorPlaceHold] Error getting college from department:', colErr.message);
        }
      }
      
      if (!advisorCollegeId) {
        // If no department_id or can't determine college, deny access
        console.log('[canAdvisorPlaceHold] Cannot determine college for college-level advisor, denying access');
        return false;
      }
      
      const canPlace = studentMajorsRes.rows.some(row => row.college_id === advisorCollegeId);
      if (!canPlace) {
        console.log(`[canAdvisorPlaceHold] College-level advisor (college_id: ${advisorCollegeId}) cannot place hold - student not in their college (student colleges: ${studentMajorsRes.rows.map(r => r.college_id).join(', ')})`);
      } else {
        console.log(`[canAdvisorPlaceHold] College-level advisor (college_id: ${advisorCollegeId}) CAN place hold - student is in their college`);
      }
      return canPlace;
    }

    return false;
  } catch (err) {
    console.error('[canAdvisorPlaceHold] Error:', err);
    // On error, be restrictive - don't allow
    return false;
  }
}

/**
 * Create an audit log entry
 */
async function createAuditLogEntry(db, {
  studentId,
  actionType,
  actionDescription,
  performedBy,
  entityType = null,
  entityId = null,
  note = null
}) {
  try {
    await db.query(
      `INSERT INTO audit_log (student_id, action_type, action_description, performed_by, entity_type, entity_id, performed_at, note)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7)`,
      [studentId, actionType, actionDescription, performedBy, entityType, entityId, note]
    );
  } catch (err) {
    // Log error but don't fail the main operation
    console.error('[createAuditLogEntry] Error:', err);
  }
}

async function checkRegistrationWindow(db, studentId, termId, classStanding, cumulativeCredits) {
  const scheduleRes = await db.query(
    `
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
  `,
    [termId]
  );

  if (scheduleRes.rows.length === 0) return { allowed: true };

  const currentDate = getCurrentDate();

  for (const window of scheduleRes.rows) {
    const matchesStanding = window.class_standing === classStanding;
    const matchesThreshold = !window.credit_threshold || cumulativeCredits >= window.credit_threshold;

    if (matchesStanding && matchesThreshold) {
      const startDate = new Date(window.registration_start_date);
      if (currentDate >= startDate) {
        // First get term info (semester and year) from terms table
        const termRes = await db.query(
          `
          SELECT semester, year
          FROM terms
          WHERE term_id = $1
          LIMIT 1
        `,
          [termId]
        );

        if (termRes.rows.length > 0) {
          const term = termRes.rows[0];
          // Query academic_calendar using JSONB term matching
          const calendarRes = await db.query(
            `
            SELECT late_registration_ends
            FROM academic_calendar
            WHERE lower(term->>'semester') = lower($1)
              AND (term->>'year')::int = $2
            LIMIT 1
          `,
            [term.semester, term.year]
          );

          if (calendarRes.rows.length > 0 && calendarRes.rows[0].late_registration_ends) {
            const endDate = new Date(calendarRes.rows[0].late_registration_ends);
            if (currentDate > endDate) return { allowed: false, reason: 'Registration period has ended' };
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

async function checkTimeConflict(db, studentId, newClassId, termId) {
  const newClassRes = await db.query(
    `
    SELECT meeting_days, meeting_times
    FROM class_sections
    WHERE class_id = $1
  `,
    [newClassId]
  );

  if (
    newClassRes.rows.length === 0 ||
    !newClassRes.rows[0].meeting_days ||
    !newClassRes.rows[0].meeting_times
  ) {
    return { hasConflict: false };
  }

  const newDays = newClassRes.rows[0].meeting_days
    .split(/[,\s\/]+/)
    .map((d) => d.trim().toUpperCase());
  const newTimes = newClassRes.rows[0].meeting_times;

  const enrolledRes = await db.query(
    `
    SELECT cs.class_id, cs.meeting_days, cs.meeting_times, c.subject, c.course_num
    FROM enrollments e
    JOIN class_sections cs ON cs.class_id = e.class_id
    JOIN courses c ON c.course_id = cs.course_id
    WHERE e.student_id = $1
      AND cs.term_id = $2
      AND e.status = 'registered'
      AND cs.meeting_days IS NOT NULL
      AND cs.meeting_times IS NOT NULL
  `,
    [studentId, termId]
  );

  for (const enrolled of enrolledRes.rows) {
    const enrolledDays = enrolled.meeting_days
      .split(/[,\s\/]+/)
      .map((d) => d.trim().toUpperCase());
    const enrolledTimes = enrolled.meeting_times;

    const dayOverlap = newDays.some((d) => enrolledDays.includes(d));
    if (!dayOverlap) continue;

    if (enrolledTimes && newTimes) {
      return {
        hasConflict: true,
        conflictingClass: {
          classId: enrolled.class_id,
          courseCode: `${enrolled.subject} ${enrolled.course_num}`,
        },
      };
    }
  }

  return { hasConflict: false };
}

async function hasTimeConflictWaiver(db, studentId, classId1, classId2) {
  const result = await db.query(
    `
    SELECT 1 FROM time_conflict_waivers
    WHERE student_user_id = $1
      AND ((class_id_1 = $2 AND class_id_2 = $3) OR (class_id_1 = $3 AND class_id_2 = $2))
      AND instructor_approved = true
      AND advisor_approved = true
      AND status = 'approved'
  `,
    [studentId, classId1, classId2]
  );
  return result.rows.length > 0;
}

async function checkPrerequisites(db, studentId, courseId, prerequisitesText) {
  if (!prerequisitesText || prerequisitesText.trim() === '') return { satisfied: true };

  if (prerequisitesText.toLowerCase().includes('permission of department')) {
    const hasPermission = await hasDepartmentPermission(db, studentId, courseId);
    if (!hasPermission) return { satisfied: false, reason: 'Department permission required' };
  }

  // Parse prerequisite text into requirement groups
  // Semicolons separate AND groups, "or" separates OR groups within each AND group
  const requirementGroups = parsePrerequisiteGroups(prerequisitesText);
  
  if (requirementGroups.length === 0) return { satisfied: true };

  // Check each requirement group (AND logic - all groups must be satisfied)
  for (const group of requirementGroups) {
    const { minGrade, courseCodes } = group;
    
    // Within each group, check if at least one course is satisfied (OR logic)
    let groupSatisfied = false;
    let unsatisfiedCourses = [];
    
    for (const courseCode of courseCodes) {
      // Check if course is completed with required grade (or waived)
      const completed = await hasCompletedCourse(db, studentId, courseCode, minGrade || 'D');
      const waived = await hasPrerequisiteWaiver(db, studentId, courseId, courseCode);
      
      if (completed || waived) {
        groupSatisfied = true;
        break; // At least one course in OR group is satisfied
      } else {
        unsatisfiedCourses.push(courseCode);
      }
    }
    
    // If no course in this OR group is satisfied, prerequisite check fails
    if (!groupSatisfied) {
      // Format error message based on whether there's a grade requirement
      const gradeText = minGrade ? `${minGrade} or higher: ` : '';
      const coursesText = courseCodes.length === 1 
        ? courseCodes[0] 
        : courseCodes.join(' or ');
      return { 
        satisfied: false, 
        reason: `Prerequisite not satisfied: ${gradeText}${coursesText}` 
      };
    }
  }

  // All requirement groups are satisfied
  return { satisfied: true };
}

async function checkCorequisites(db, studentId, courseId, termId, corequisitesText) {
  if (!corequisitesText || corequisitesText.trim() === '') return { satisfied: true };

  const courseCodes = parseCourseCodes(corequisitesText);
  if (courseCodes.length === 0) return { satisfied: true };

  for (const courseCode of courseCodes) {
    const [subject, num] = courseCode.split(' ');
    if (!subject || !num) continue;

    const enrolledRes = await db.query(
      `
      SELECT 1
      FROM enrollments e
      JOIN class_sections cs ON cs.class_id = e.class_id
      JOIN courses c ON c.course_id = cs.course_id
      WHERE e.student_id = $1
        AND cs.term_id = $2
        AND UPPER(c.subject) = $3
        AND c.course_num = $4
        AND e.status = 'registered'
    `,
      [studentId, termId, subject.toUpperCase(), num]
    );

    if (enrolledRes.rows.length === 0) {
      return { satisfied: false, reason: `Corequisite required: ${courseCode} must be taken in the same term` };
    }
  }

  return { satisfied: true };
}

async function checkAntiRequisites(db, studentId, antiRequisitesText) {
  if (!antiRequisitesText || antiRequisitesText.trim() === '') return { satisfied: true };

  const courseCodes = parseCourseCodes(antiRequisitesText);
  if (courseCodes.length === 0) return { satisfied: true };

  for (const courseCode of courseCodes) {
    const [subject, num] = courseCode.split(' ');
    if (!subject || !num) continue;

    const hasCreditRes = await db.query(
      `
      SELECT 1
      FROM enrollments e
      JOIN class_sections cs ON cs.class_id = e.class_id
      JOIN courses c ON c.course_id = cs.course_id
      WHERE e.student_id = $1
        AND UPPER(c.subject) = $2
        AND c.course_num = $3
        AND e.status IN ('completed', 'registered')
        AND (e.grade IS NULL OR e.grade IN ('P', 'A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-'))
    `,
      [studentId, subject.toUpperCase(), num]
    );

    if (hasCreditRes.rows.length > 0) {
      return { satisfied: false, reason: `Anti-requisite: Cannot take this course if you have credit for ${courseCode}` };
    }
  }

  return { satisfied: true };
}

async function promoteWaitlistStudent(db, classId) {
  const waitlistRes = await db.query(
    `
    SELECT e.student_id
    FROM enrollments e
    WHERE e.class_id = $1
      AND e.status = 'waitlisted'
    ORDER BY e.enrolled_at ASC NULLS LAST
    LIMIT 1
  `,
    [classId]
  );

  if (waitlistRes.rows.length === 0) return null;

  const { student_id } = waitlistRes.rows[0];

  await db.query(
    `
    UPDATE enrollments
    SET status = 'registered'
    WHERE class_id = $1
      AND student_id = $2
      AND status = 'waitlisted'
  `,
    [classId, student_id]
  );

  return { enrollmentId: classId, studentId: student_id };
}

function buildScheduleText(row) {
  const days = row.meeting_days || '';
  const times = row.meeting_times || '';
  const combined = `${days} ${times}`.trim();
  if (combined) return combined;
  if (row.location_text) return row.location_text;
  return 'TBA';
}

router.get('/init', async (req, res) => {
  const studentId = getStudentId(req);
  if (!studentId) return res.status(401).json({ ok: false, error: 'Not authenticated' });

  try {
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
      currentTerm = { termId: r.term_id, semester: r.semester, year: r.year };
    }

    const termsRes = await req.db.query(`
      SELECT term_id, semester, year
      FROM terms
      ORDER BY year DESC, semester ASC
    `);

    const terms = termsRes.rows.map((t) => ({
      termId: t.term_id,
      semester: t.semester,
      year: t.year,
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
        enrolledCount: Number(row.registered_count) || 0,
        courseCode: `${row.subject} ${row.course_num}`,
        courseTitle: row.course_title,
        credits: Number(row.credits) || 0,
        instructorName:
          row.instructor_first_name || row.instructor_last_name
            ? `${row.instructor_first_name ?? ''} ${row.instructor_last_name ?? ''}`.trim()
            : null,
        meetingDays: row.meeting_days,
        meetingTimes: row.meeting_times,
        scheduleText,
        roomLabel: row.building && row.room ? `${row.building} ${row.room}` : '',
      };
    });

    const enrollmentsRes = await req.db.query(
      `
      SELECT
        e.class_id,
        e.student_id,
        e.status,
        e.gpnc,
        e.credits AS enrollment_credits,
        e.grade,
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
    `,
      [studentId]
    );

    const enrollments = enrollmentsRes.rows.map((row) => {
      const scheduleText = buildScheduleText(row);
      return {
        enrollmentId: row.class_id,
        classId: row.class_id,
        termId: row.term_id,
        termLabel: `${row.semester} ${row.year}`,
        sectionNum: row.section_num,
        courseCode: `${row.subject} ${row.course_num}`,
        courseTitle: row.course_title,
        credits: Number(row.credits) || 0,
        instructorName:
          row.instructor_first_name || row.instructor_last_name
            ? `${row.instructor_first_name ?? ''} ${row.instructor_last_name ?? ''}`.trim()
            : null,
        meetingDays: row.meeting_days,
        meetingTimes: row.meeting_times,
        scheduleText,
        roomLabel: row.building && row.room ? `${row.building} ${row.room}` : '',
        status: row.status,
        grade: row.grade,
        gpnc: row.gpnc,
        enrolledAt: row.enrolled_at,
        enrollmentCredits: row.enrollment_credits != null ? Number(row.enrollment_credits) : null,
      };
    });

    return res.json({
      ok: true,
      systemState: { currentTerm },
      terms,
      sections,
      enrollments,
    });
  } catch (err) {
    console.error('[registration/init]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/enroll', async (req, res) => {
  const studentId = getStudentId(req);
  const userRole = getUserRole(req);

  if (!studentId) return res.status(401).json({ ok: false, error: 'Not authenticated' });

  const { classId } = req.body;
  if (!classId) return res.status(400).json({ ok: false, error: 'Missing classId' });

  const client = req.db;

  try {
    await client.query('BEGIN');

    const holds = await checkRegistrationHolds(client, studentId);
    if (holds.length > 0) {
      await client.query('ROLLBACK');
      const holdTypes = holds.map((h) => h.hold_type).join(', ');
      return res.status(403).json({
        ok: false,
        error: `Registration blocked by holds: ${holdTypes}`,
        holds: holds.map((h) => ({ type: h.hold_type, note: h.note })),
      });
    }

    const secRes = await client.query(
      `
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
    `,
      [classId]
    );

    if (secRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, error: 'Section not found' });
    }

    const secRow = secRes.rows[0];
    const termId = secRow.term_id;

    const sameCourseRes = await client.query(
      `
      SELECT cs2.class_id, cs2.section_num
      FROM enrollments e
      JOIN class_sections cs2 ON cs2.class_id = e.class_id
      WHERE e.student_id = $1
        AND cs2.course_id = $2
        AND cs2.term_id = $3
        AND e.status = 'registered'
    `,
      [studentId, secRow.course_id, termId]
    );

    if (sameCourseRes.rows.length > 0) {
      await client.query('ROLLBACK');
      const existing = sameCourseRes.rows[0];
      return res.status(400).json({
        ok: false,
        error: `Already registered for another section of this course (Section ${existing.section_num})`,
      });
    }

    const studentRes = await client.query(
      `
      SELECT
        COALESCE(SUM(CASE WHEN e.grade IS NOT NULL AND e.grade != 'I' THEN c.credits ELSE 0 END), 0) AS cumulative_credits
      FROM enrollments e
      JOIN class_sections cs ON cs.class_id = e.class_id
      JOIN courses c ON c.course_id = cs.course_id
      WHERE e.student_id = $1
        AND e.status IN ('completed', 'registered')
    `,
      [studentId]
    );

    const cumulativeCredits = Number(studentRes.rows[0]?.cumulative_credits || 0);
    const classStanding = computeClassStanding(cumulativeCredits);

    const windowCheck = await checkRegistrationWindow(client, studentId, termId, classStanding, cumulativeCredits);
    if (!windowCheck.allowed) {
      await client.query('ROLLBACK');
      return res.status(403).json({ ok: false, error: windowCheck.reason });
    }

    const prereqCheck = await checkPrerequisites(client, studentId, secRow.course_id, secRow.prerequisites || '');
    if (!prereqCheck.satisfied) {
      await client.query('ROLLBACK');
      return res.status(400).json({ ok: false, error: prereqCheck.reason });
    }

    const coreqCheck = await checkCorequisites(client, studentId, secRow.course_id, termId, secRow.corequisites || '');
    if (!coreqCheck.satisfied) {
      await client.query('ROLLBACK');
      return res.status(400).json({ ok: false, error: coreqCheck.reason });
    }

    const antiReqCheck = await checkAntiRequisites(client, studentId, secRow.anti_requisites || '');
    if (!antiReqCheck.satisfied) {
      await client.query('ROLLBACK');
      return res.status(400).json({ ok: false, error: antiReqCheck.reason });
    }

    const timeConflict = await checkTimeConflict(client, studentId, classId, termId);
    if (timeConflict.hasConflict) {
      const hasWaiver = await hasTimeConflictWaiver(client, studentId, classId, timeConflict.conflictingClass.classId);
      if (!hasWaiver) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          ok: false,
          error: `Time conflict with ${timeConflict.conflictingClass.courseCode}. Time conflict waiver required.`,
        });
      }
    }

    const countRes = await client.query(
      `
      SELECT COUNT(*) AS registered_count
      FROM enrollments
      WHERE class_id = $1
      AND status = 'registered'
    `,
      [classId]
    );

    const registeredCount = Number(countRes.rows[0].registered_count);
    const isRegistrar = userRole === 'Registrar';

    const overrideRes = await client.query(
      `
      SELECT 1 FROM capacity_overrides
      WHERE student_user_id = $1 AND class_id = $2
    `,
      [studentId, classId]
    );
    const hasCapacityOverride = overrideRes.rows.length > 0;

    if (registeredCount >= secRow.capacity && !isRegistrar && !hasCapacityOverride) {
      const waitlistRes = await client.query(
        `
        INSERT INTO enrollments (class_id, student_id, status, enrolled_at)
        VALUES ($1, $2, 'waitlisted', NOW())
        RETURNING class_id, student_id, status, grade, gpnc, credits, enrolled_at
      `,
        [classId, studentId]
      );

      await client.query('COMMIT');

      return res.json({
        ok: true,
        waitlisted: true,
        message: 'Class is full. Added to waitlist.',
        enrollment: {
          enrollmentId: waitlistRes.rows[0].class_id,
          classId: waitlistRes.rows[0].class_id,
          status: 'waitlisted',
          grade: waitlistRes.rows[0].grade,
          gpnc: waitlistRes.rows[0].gpnc,
          enrollmentCredits: waitlistRes.rows[0].credits != null ? Number(waitlistRes.rows[0].credits) : null,
          enrolledAt: waitlistRes.rows[0].enrolled_at,
        },
      });
    }

    const enrollRes = await client.query(
      `
      INSERT INTO enrollments (class_id, student_id, status, enrolled_at)
      VALUES ($1, $2, 'registered', NOW())
      RETURNING class_id, student_id, status, grade, gpnc, credits, enrolled_at
    `,
      [classId, studentId]
    );

    const eRow = enrollRes.rows[0];

    const countAfterRes = await client.query(
      `
      SELECT COUNT(*) AS registered_count
      FROM enrollments
      WHERE class_id = $1
      AND status = 'registered'
    `,
      [classId]
    );
    const newCount = Number(countAfterRes.rows[0].registered_count);

    const metaRes = await client.query(
      `
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
    `,
      [classId]
    );

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
        enrollmentId: eRow.class_id,
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
        gpnc: eRow.gpnc,
        enrollmentCredits: eRow.credits != null ? Number(eRow.credits) : null,
        enrolledAt: eRow.enrolled_at,
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
        roomLabel,
      },
    });
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {}
    console.error('[registration/enroll]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/withdraw', async (req, res) => {
  const studentId = getStudentId(req);
  const { enrollmentId } = req.body;

  if (!studentId) return res.status(401).json({ ok: false, error: 'Not authenticated' });
  if (!enrollmentId) return res.status(400).json({ ok: false, error: 'Missing enrollmentId' });

  const classId = enrollmentId;
  const client = req.db;

  try {
    await client.query('BEGIN');

    const enrRes = await client.query(
      `
      SELECT class_id, status
      FROM enrollments
      WHERE class_id = $1 AND student_id = $2
      LIMIT 1
    `,
      [classId, studentId]
    );

    if (enrRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, error: 'Enrollment not found' });
    }

    const { class_id, status } = enrRes.rows[0];

    if (status !== 'registered') {
      await client.query('ROLLBACK');
      return res.status(400).json({ ok: false, error: 'Can only withdraw registered enrollments' });
    }

    const secRes = await client.query(
      `
      SELECT *
      FROM class_sections
      WHERE class_id = $1
      FOR UPDATE
    `,
      [class_id]
    );

    if (secRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, error: 'Section not found' });
    }

    const secRow = secRes.rows[0];

    await client.query(
      `
      DELETE FROM enrollments
      WHERE class_id = $1 AND student_id = $2
    `,
      [class_id, studentId]
    );

    const countAfterRes = await client.query(
      `
      SELECT COUNT(*) AS registered_count
      FROM enrollments
      WHERE class_id = $1
      AND status = 'registered'
    `,
      [class_id]
    );

    const newCount = Number(countAfterRes.rows[0].registered_count);

    let promotedStudent = null;
    if (newCount < secRow.capacity) {
      promotedStudent = await promoteWaitlistStudent(client, class_id);
    }

    const metaRes = await client.query(
      `
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
    `,
      [class_id]
    );

    const row = metaRes.rows[0] ?? secRow;

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
      message: promotedStudent
        ? 'Withdrawn. Waitlist student automatically promoted.'
        : 'Withdrawn successfully',
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
        roomLabel,
      },
    });
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {}
    console.error('[registration/withdraw]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

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

  const validHoldTypes = ['academic_advising', 'financial', 'disciplinary', 'other'];
  if (!validHoldTypes.includes(holdType)) {
    return res.status(400).json({ ok: false, error: `Invalid holdType. Must be one of: ${validHoldTypes.join(', ')}` });
  }

  try {
    // Check authorization for academic advising holds
    if (holdType === 'academic_advising' && userRole === 'Advisor') {
      console.log('[registration/holds] Checking authorization for advisor:', {
        advisorId: userId,
        studentId: studentId,
        holdType: holdType
      });
      const canPlace = await canAdvisorPlaceHold(req.db, userId, studentId);
      console.log('[registration/holds] Authorization result:', { canPlace, advisorId: userId, studentId });
      if (!canPlace) {
        return res.status(403).json({ 
          ok: false, 
          error: 'You are not authorized to place academic advising holds on this student. Academic advising holds can only be placed on students in your scope (university/college/department).' 
        });
      }
    }

    // Financial holds can only be placed by registrars
    if (holdType === 'financial' && userRole !== 'Registrar') {
      return res.status(403).json({ 
        ok: false, 
        error: 'Only registrars can place financial holds' 
      });
    }

    const result = await req.db.query(
      `
      INSERT INTO registration_holds (student_user_id, hold_type, note, placed_by_user_id, placed_at)
      VALUES ($1, $2, $3, $4, NOW())
      RETURNING hold_id, student_user_id, hold_type, note, placed_at
    `,
      [studentId, holdType, note || null, userId]
    );

    const hold = result.rows[0];
    console.log('[registration/holds] Hold created successfully:', {
      holdId: hold.hold_id,
      studentId: hold.student_user_id,
      holdType: hold.hold_type,
      placedBy: userId
    });

    // Create audit log entry (don't fail the request if this fails)
    const actionDescription = `Registration hold placed: ${holdType}${note ? ` - ${note}` : ''}`;
    try {
      await createAuditLogEntry(req.db, {
        studentId: parseInt(studentId),
        actionType: 'registration_hold_placed',
        actionDescription,
        performedBy: userId,
        entityType: 'registration_hold',
        entityId: hold.hold_id,
        note: note || null
      });
      console.log('[registration/holds] Audit log entry created successfully');
    } catch (auditErr) {
      // Log error but don't fail the request
      console.error('[registration/holds] Failed to create audit log entry (non-fatal):', auditErr);
    }

    return res.json({ ok: true, hold });
  } catch (err) {
    console.error('[registration/holds]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.delete('/holds/:holdId', async (req, res) => {
  const userRole = getUserRole(req);
  const userId = req.user?.user_id ?? req.user?.userId ?? null;
  const { holdId } = req.params;

  if (!['Registrar', 'Advisor'].includes(userRole)) {
    return res.status(403).json({ ok: false, error: 'Only registrars and advisors can remove holds' });
  }

  try {
    // First, get the hold details to check authorization
    const holdRes = await req.db.query(
      `
      SELECT hold_id, student_user_id, hold_type, note
      FROM registration_holds
      WHERE hold_id = $1 AND resolved_at IS NULL
    `,
      [holdId]
    );

    if (holdRes.rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Hold not found or already removed' });
    }

    const hold = holdRes.rows[0];

    // Check authorization for academic advising holds
    if (hold.hold_type === 'academic_advising' && userRole === 'Advisor') {
      const canRemove = await canAdvisorPlaceHold(req.db, userId, hold.student_user_id);
      if (!canRemove) {
        return res.status(403).json({ 
          ok: false, 
          error: 'You are not authorized to remove this academic advising hold. Academic advising holds can only be removed by advisors with authority over this student.' 
        });
      }
    }

    // Financial holds can only be removed by registrars
    if (hold.hold_type === 'financial' && userRole !== 'Registrar') {
      return res.status(403).json({ 
        ok: false, 
        error: 'Only registrars can remove financial holds' 
      });
    }

    // Remove the hold
    const result = await req.db.query(
      `
      UPDATE registration_holds
      SET resolved_at = NOW(), resolved_by_user_id = $2
      WHERE hold_id = $1 AND resolved_at IS NULL
      RETURNING hold_id, student_user_id, hold_type
    `,
      [holdId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Hold not found or already removed' });
    }

    // Create audit log entry
    const actionDescription = `Registration hold removed: ${hold.hold_type}`;
    await createAuditLogEntry(req.db, {
      studentId: hold.student_user_id,
      actionType: 'registration_hold_removed',
      actionDescription,
      performedBy: userId,
      entityType: 'registration_hold',
      entityId: hold.hold_id,
      note: null
    });

    return res.json({ ok: true, message: 'Hold removed successfully' });
  } catch (err) {
    console.error('[registration/holds/:holdId]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/time-conflict-waiver/request', async (req, res) => {
  const studentId = getStudentId(req);
  if (!studentId) return res.status(401).json({ ok: false, error: 'Not authenticated' });

  const { classId1, classId2 } = req.body;
  if (!classId1 || !classId2) {
    return res.status(400).json({ ok: false, error: 'classId1 and classId2 are required' });
  }

  try {
    const result = await req.db.query(
      `
      INSERT INTO time_conflict_waivers (student_user_id, class_id_1, class_id_2, status, requested_at)
      VALUES ($1, $2, $3, 'pending', NOW())
      RETURNING waiver_id, student_user_id, class_id_1, class_id_2, status
    `,
      [studentId, classId1, classId2]
    );

    return res.json({
      ok: true,
      waiver: result.rows[0],
      message: 'Time conflict waiver requested. Requires approval from both instructors and an advisor.',
    });
  } catch (err) {
    console.error('[registration/time-conflict-waiver/request]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/time-conflict-waiver/:waiverId/approve-instructor', async (req, res) => {
  const userRole = getUserRole(req);
  const userId = req.user?.user_id ?? req.user?.userId ?? null;
  const { waiverId } = req.params;
  const { approved } = req.body;

  if (userRole !== 'Instructor') {
    return res.status(403).json({ ok: false, error: 'Only instructors can approve instructor portion' });
  }

  try {
    const waiverRes = await req.db.query(
      `
      SELECT class_id_1, class_id_2
      FROM time_conflict_waivers
      WHERE waiver_id = $1
    `,
      [waiverId]
    );

    if (waiverRes.rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Waiver not found' });
    }

    const { class_id_1, class_id_2 } = waiverRes.rows[0];

    const instructorCheck = await req.db.query(
      `
      SELECT 1 FROM class_sections
      WHERE class_id IN ($1, $2) AND instructor_id = $3
    `,
      [class_id_1, class_id_2, userId]
    );

    if (instructorCheck.rows.length === 0) {
      return res.status(403).json({ ok: false, error: 'You are not an instructor for either class' });
    }

    await req.db.query(
      `
      UPDATE time_conflict_waivers
      SET instructor_approved = $1, instructor_approved_by = $2, instructor_approved_at = NOW()
      WHERE waiver_id = $3
    `,
      [approved, userId, waiverId]
    );

    if (approved) {
      const checkRes = await req.db.query(
        `
        SELECT instructor_approved, advisor_approved
        FROM time_conflict_waivers
        WHERE waiver_id = $1
      `,
        [waiverId]
      );

      if (checkRes.rows[0].instructor_approved && checkRes.rows[0].advisor_approved) {
        await req.db.query(
          `
          UPDATE time_conflict_waivers
          SET status = 'approved'
          WHERE waiver_id = $1
        `,
          [waiverId]
        );
      }
    }

    return res.json({ ok: true, message: approved ? 'Instructor approval recorded' : 'Instructor approval denied' });
  } catch (err) {
    console.error('[registration/time-conflict-waiver/:waiverId/approve-instructor]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/time-conflict-waiver/:waiverId/approve-advisor', async (req, res) => {
  const userRole = getUserRole(req);
  const userId = req.user?.user_id ?? req.user?.userId ?? null;
  const { waiverId } = req.params;
  const { approved } = req.body;

  if (userRole !== 'Advisor') {
    return res.status(403).json({ ok: false, error: 'Only advisors can approve advisor portion' });
  }

  try {
    await req.db.query(
      `
      UPDATE time_conflict_waivers
      SET advisor_approved = $1, advisor_approved_by = $2, advisor_approved_at = NOW()
      WHERE waiver_id = $3
    `,
      [approved, userId, waiverId]
    );

    if (approved) {
      const checkRes = await req.db.query(
        `
        SELECT instructor_approved, advisor_approved
        FROM time_conflict_waivers
        WHERE waiver_id = $1
      `,
        [waiverId]
      );

      if (checkRes.rows[0].instructor_approved && checkRes.rows[0].advisor_approved) {
        await req.db.query(
          `
          UPDATE time_conflict_waivers
          SET status = 'approved'
          WHERE waiver_id = $1
        `,
          [waiverId]
        );
      }
    }

    return res.json({ ok: true, message: approved ? 'Advisor approval recorded' : 'Advisor approval denied' });
  } catch (err) {
    console.error('[registration/time-conflict-waiver/:waiverId/approve-advisor]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

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
    const result = await req.db.query(
      `
      INSERT INTO prerequisite_waivers (student_user_id, course_id, waived_course_code, granted_by_user_id, status, granted_at)
      VALUES ($1, $2, $3, $4, 'approved', NOW())
      RETURNING waiver_id, student_user_id, course_id, waived_course_code
    `,
      [studentId, courseId, waivedCourseCode, userId]
    );

    return res.json({ ok: true, waiver: result.rows[0], message: 'Prerequisite waiver granted' });
  } catch (err) {
    console.error('[registration/prerequisite-waiver]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

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
    const result = await req.db.query(
      `
      INSERT INTO department_permissions (student_user_id, course_id, granted_by_user_id, status, granted_at)
      VALUES ($1, $2, $3, 'approved', NOW())
      ON CONFLICT (student_user_id, course_id)
      DO UPDATE SET status = 'approved', granted_at = NOW()
      RETURNING permission_id, student_user_id, course_id, status
    `,
      [studentId, courseId, userId]
    );

    return res.json({ ok: true, permission: result.rows[0], message: 'Department permission granted' });
  } catch (err) {
    console.error('[registration/department-permission]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

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

    await req.db.query(
      `
      DELETE FROM registration_schedules
      WHERE term_id = $1
    `,
      [termId]
    );

    for (const window of windows) {
      const { classStanding, creditThreshold, registrationStartDate } = window;

      if (!classStanding || !registrationStartDate) {
        await req.db.query('ROLLBACK');
        return res.status(400).json({ ok: false, error: 'Each window must have classStanding and registrationStartDate' });
      }

      await req.db.query(
        `
        INSERT INTO registration_schedules (term_id, class_standing, credit_threshold, registration_start_date)
        VALUES ($1, $2, $3, $4)
      `,
        [termId, classStanding, creditThreshold || null, registrationStartDate]
      );
    }

    await req.db.query('COMMIT');

    return res.json({ ok: true, message: `Registration schedule defined for term ${termId}`, windows: windows.length });
  } catch (err) {
    try {
      await req.db.query('ROLLBACK');
    } catch (_) {}
    console.error('[registration/schedule]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

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
    const result = await req.db.query(
      `
      INSERT INTO capacity_overrides (student_user_id, class_id, granted_by_user_id, granted_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (student_user_id, class_id)
      DO UPDATE SET granted_at = NOW()
      RETURNING override_id, student_user_id, class_id
    `,
      [studentId, classId, userId]
    );

    return res.json({
      ok: true,
      override: result.rows[0],
      message: 'Capacity override granted. Student can now register even if class is full.',
    });
  } catch (err) {
    console.error('[registration/capacity-override]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
