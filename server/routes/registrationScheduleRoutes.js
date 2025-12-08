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
  console.log('[checkTimeConflict] START - studentId:', studentId, 'newClassId:', newClassId, 'termId:', termId);
  
  const newClassRes = await db.query(
    `
    SELECT meeting_days, meeting_times
    FROM class_sections
    WHERE class_id = $1
  `,
    [newClassId]
  );

  console.log('[checkTimeConflict] New class query result:', {
    rowsCount: newClassRes.rows.length,
    row: newClassRes.rows[0] ? {
      meeting_days: newClassRes.rows[0].meeting_days,
      meeting_days_type: typeof newClassRes.rows[0].meeting_days,
      meeting_days_is_null: newClassRes.rows[0].meeting_days === null,
      meeting_days_is_empty: newClassRes.rows[0].meeting_days === '',
      meeting_times: newClassRes.rows[0].meeting_times,
      meeting_times_type: typeof newClassRes.rows[0].meeting_times,
      meeting_times_is_null: newClassRes.rows[0].meeting_times === null,
      meeting_times_is_empty: newClassRes.rows[0].meeting_times === '',
    } : null
  });

  // Helper function to check if a value is TBA
  const isTBA = (value) => {
    if (!value) return true; // NULL, undefined, empty string
    const str = String(value).trim().toUpperCase();
    return str === 'TBA' || str === '';
  };

  const newMeetingDays = newClassRes.rows[0]?.meeting_days;
  const newMeetingTimes = newClassRes.rows[0]?.meeting_times;
  const newIsTBA = isTBA(newMeetingDays) || isTBA(newMeetingTimes);

  console.log('[checkTimeConflict] New class TBA check:', {
    newMeetingDays,
    newMeetingTimes,
    newIsTBA,
    isTBA_days: isTBA(newMeetingDays),
    isTBA_times: isTBA(newMeetingTimes)
  });

  // Query all enrolled classes (including TBA ones)
  const enrolledRes = await db.query(
    `
    SELECT cs.class_id, cs.meeting_days, cs.meeting_times, c.subject, c.course_num
    FROM enrollments e
    JOIN class_sections cs ON cs.class_id = e.class_id
    JOIN courses c ON c.course_id = cs.course_id
    WHERE e.student_id = $1
      AND cs.term_id = $2
      AND e.status = 'registered'
  `,
    [studentId, termId]
  );

  console.log('[checkTimeConflict] Enrolled classes query result:', {
    rowsCount: enrolledRes.rows.length,
    enrolledClasses: enrolledRes.rows.map(row => ({
      class_id: row.class_id,
      course: `${row.subject} ${row.course_num}`,
      meeting_days: row.meeting_days,
      meeting_days_type: typeof row.meeting_days,
      meeting_days_is_null: row.meeting_days === null,
      meeting_times: row.meeting_times,
      meeting_times_type: typeof row.meeting_times,
      meeting_times_is_null: row.meeting_times === null,
    }))
  });

  // If new class has TBA, conflict with ALL existing enrollments
  if (newIsTBA) {
    console.log('[checkTimeConflict] New class has TBA - checking against all enrolled classes');
    if (enrolledRes.rows.length > 0) {
      const firstConflict = enrolledRes.rows[0];
      console.log('[checkTimeConflict] TBA conflict detected with:', {
        classId: firstConflict.class_id,
        courseCode: `${firstConflict.subject} ${firstConflict.course_num}`
      });
      return {
        hasConflict: true,
        conflictingClass: {
          classId: firstConflict.class_id,
          courseCode: `${firstConflict.subject} ${firstConflict.course_num}`,
        },
      };
    }
  }

  // If new class has known schedule, check against enrolled classes
  if (!newIsTBA && newMeetingDays && newMeetingTimes) {
    const newDays = newMeetingDays
      .split(/[,\s\/]+/)
      .map((d) => d.trim().toUpperCase())
      .filter(d => d && d !== 'TBA');
    const newTimes = newMeetingTimes;

    console.log('[checkTimeConflict] New class has known schedule:', {
      newDays,
      newTimes
    });

    for (const enrolled of enrolledRes.rows) {
      const enrolledMeetingDays = enrolled.meeting_days;
      const enrolledMeetingTimes = enrolled.meeting_times;
      const enrolledIsTBA = isTBA(enrolledMeetingDays) || isTBA(enrolledMeetingTimes);

      console.log('[checkTimeConflict] Checking enrolled class:', {
        classId: enrolled.class_id,
        course: `${enrolled.subject} ${enrolled.course_num}`,
        enrolledMeetingDays,
        enrolledMeetingTimes,
        enrolledIsTBA
      });

      // If enrolled class has TBA, conflict with new class (known schedule)
      if (enrolledIsTBA) {
        console.log('[checkTimeConflict] Enrolled class has TBA - conflict detected');
        return {
          hasConflict: true,
          conflictingClass: {
            classId: enrolled.class_id,
            courseCode: `${enrolled.subject} ${enrolled.course_num}`,
          },
        };
      }

      // Both have known schedules - check for actual overlap
      if (enrolledMeetingDays && enrolledMeetingTimes && newDays.length > 0 && newTimes) {
        const enrolledDays = enrolledMeetingDays
          .split(/[,\s\/]+/)
          .map((d) => d.trim().toUpperCase())
          .filter(d => d && d !== 'TBA');

        console.log('[checkTimeConflict] Both have known schedules, checking overlap:', {
          newDays,
          enrolledDays,
          dayOverlap: newDays.some((d) => enrolledDays.includes(d))
        });

        const dayOverlap = newDays.some((d) => enrolledDays.includes(d));
        if (dayOverlap && enrolledMeetingTimes && newTimes) {
          console.log('[checkTimeConflict] Day overlap detected, checking time overlap');
          // For now, if days overlap and both have times, consider it a conflict
          // (Could add actual time range parsing here if needed)
          console.log('[checkTimeConflict] Conflict detected - day overlap with times');
          return {
            hasConflict: true,
            conflictingClass: {
              classId: enrolled.class_id,
              courseCode: `${enrolled.subject} ${enrolled.course_num}`,
            },
          };
        }
      }
    }
  }

  console.log('[checkTimeConflict] No conflict detected');
  return { hasConflict: false };
}

async function hasTimeConflictWaiver(db, studentId, classId1, classId2) {
  const result = await db.query(
    `
    SELECT 1 FROM time_conflict_waivers
    WHERE student_user_id = $1
      AND ((class_id_1 = $2 AND class_id_2 = $3) OR (class_id_1 = $3 AND class_id_2 = $2))
      AND instructor_1_approved = true
      AND instructor_2_approved = true
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

/**
 * Extract building and room from location text
 * (used to clean location_text that may contain instructor names)
 * Examples: "MELVILLE LBRW4550" -> {building: "MELVILLE", room: "LBRW4550"}
 *           "HUMANITIES 1006Ryan Kaufman" -> {building: "HUMANITIES", room: "1006"}
 */
function extractBuildingRoomFromText(locationText) {
  if (!locationText) return { building: null, room: null };
  let s = String(locationText).trim();
  if (!s) return { building: null, room: null };

  // Handle special case: "TBATBA" followed by instructor name - no real location
  if (/^TBATBA/i.test(s)) {
    return { building: null, room: null };
  }

  // Remove "TBA" if it's at the start or end
  s = s.replace(/^TBA\s+/i, '').replace(/\s+TBA$/i, '').trim();
  if (!s || s.toUpperCase() === 'TBA') return { building: null, room: null };

  // Remove "TBA" if it's concatenated at the end (e.g., "4530TBA" -> "4530")
  s = s.replace(/TBA$/i, '').trim();
  if (!s) return { building: null, room: null };

  // Split by spaces first
  const tokens = s.split(/\s+/).filter(Boolean);
  if (tokens.length < 2) return { building: null, room: null };
  
  // Look for room number pattern: alphanumeric with digits, 1-8 chars
  // Room can be concatenated with instructor (e.g., "1006Ryan", "143Hyun-Kyung", "S235SMichael") or separate
  for (let idx = 1; idx < tokens.length; idx++) {
    let tok = tokens[idx];
    
    // Remove "TBA" if concatenated at end of token
    tok = tok.replace(/TBA$/i, '');
    if (!tok) continue;
    
    // Check if this token contains a room number (has digits)
    if (/\d/.test(tok)) {
      // Pattern 1: Room concatenated with instructor name
      // Match: room number (alphanumeric with digits) followed by capital letter + lowercase (name start)
      // Examples: "1006Ryan", "143Hyun", "S235SMichael", "001William", "CENTR103Alan"
      const concatMatch = tok.match(/^([A-Z0-9]*\d+[A-Z0-9]*?)([A-Z][a-z].*)$/);
      if (concatMatch) {
        let room = concatMatch[1];
        // If room ends with a single letter and next part is instructor name, remove trailing letter
        // (e.g., "S235S" + "Michael" -> room should be "S235", not "S235S")
        if (/[A-Z]$/.test(room) && room.length > 1 && concatMatch[2]) {
          const withoutLast = room.slice(0, -1);
          if (/\d/.test(withoutLast) && withoutLast.length >= 1) {
            room = withoutLast;
          }
        }
        // Verify room has digits and is reasonable length (1-8 chars)
        if (/\d/.test(room) && room.length >= 1 && room.length <= 8) {
          return {
            building: tokens.slice(0, idx).join(" ").trim(),
            room: room
          };
        }
      }
      
      // Pattern 2: Room is a standalone token (e.g., "1006", "317", "001", "S235", "LBRW4550")
      // Must be alphanumeric, 1-10 chars, contains digits
      // Remove trailing single letter if it looks suspicious (e.g., "S235S" -> "S235")
      let cleanTok = tok;
      if (/[A-Z]$/.test(cleanTok) && cleanTok.length > 4 && /\d/.test(cleanTok)) {
        const withoutLast = cleanTok.slice(0, -1);
        if (/\d/.test(withoutLast) && withoutLast.length >= 1 && withoutLast.length <= 10) {
          cleanTok = withoutLast;
        }
      }
      if (/^[A-Z0-9]{1,10}$/i.test(cleanTok) && cleanTok.length <= 10) {
        return {
          building: tokens.slice(0, idx).join(" ").trim(),
          room: cleanTok
        };
      }
    }
  }
  
  return { building: null, room: null };
}

/**
 * Extract instructor name from query result row.
 * Checks junction table instructors array first, then falls back to direct columns.
 */
function extractInstructorName(row, hasJunctionTable) {
  let instructorName = null;
  
  // First, try to get from junction table if available
  if (hasJunctionTable && row.instructors) {
    try {
      const instructors = typeof row.instructors === 'string' 
        ? JSON.parse(row.instructors) 
        : row.instructors;
      if (Array.isArray(instructors) && instructors.length > 0) {
        const firstInstructor = instructors[0];
        if (firstInstructor.first_name || firstInstructor.last_name) {
          instructorName = `${firstInstructor.first_name || ''} ${firstInstructor.last_name || ''}`.trim();
        }
      }
    } catch (e) {
      // If JSON parse fails, fall through to direct columns
    }
  }
  
  // Fallback to direct instructor columns
  if (!instructorName && (row.instructor_first_name || row.instructor_last_name)) {
    instructorName = `${row.instructor_first_name ?? ''} ${row.instructor_last_name ?? ''}`.trim();
  }
  
  return instructorName || null;
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

    // Check if class_section_instructors junction table exists
    const tableCheck = await req.db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'class_section_instructors'
      ) AS table_exists
    `);
    const hasJunctionTable = tableCheck.rows[0]?.table_exists === true;

    // Query sections - use junction table if available, otherwise fallback to cs.instructor_id
    const sectionsSql = hasJunctionTable ? `
      SELECT
        cs.class_id,
        cs.term_id,
        cs.section_num,
        cs.capacity,
        cs.location_text,
        cs.meeting_days,
        cs.meeting_times,
        cs.instructor_id,

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

        COALESCE(
          JSON_AGG(
            JSON_BUILD_OBJECT(
              'id', u_instr.user_id,
              'first_name', u_instr.first_name,
              'last_name', u_instr.last_name
            )
          ) FILTER (WHERE u_instr.user_id IS NOT NULL),
          '[]'::json
        ) AS instructors,

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
      LEFT JOIN class_section_instructors csi ON csi.class_id = cs.class_id
      LEFT JOIN users u_instr ON u_instr.user_id = csi.instructor_id
      GROUP BY cs.class_id, cs.term_id, cs.section_num, cs.capacity, cs.location_text,
               cs.meeting_days, cs.meeting_times, cs.instructor_id,
               c.subject, c.course_num, c.title, c.credits,
               t.semester, t.year, r.building, r.room,
               u.first_name, u.last_name
      ORDER BY t.year DESC, t.semester ASC, c.subject, c.course_num, cs.section_num
    ` : `
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
    `;

    const sectionsRes = await req.db.query(sectionsSql);

    const sections = sectionsRes.rows.map((row) => {
      const scheduleText = buildScheduleText(row);
      const instructorName = extractInstructorName(row, hasJunctionTable);

      // Prefer building+room over location_text, but use location_text as fallback
      let roomLabel = '';
      if (row.building && row.room) {
        roomLabel = `${row.building} ${row.room}`;
      } else if (row.location_text) {
        const { building, room } = extractBuildingRoomFromText(row.location_text);
        if (building && room) {
          roomLabel = `${building} ${room}`;
        } else {
          // If extraction failed, use location_text as-is if it doesn't look like TBA
          if (row.location_text && !/^TBA/i.test(row.location_text)) {
            roomLabel = row.location_text;
          }
        }
      }

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
        instructorName,
        meetingDays: row.meeting_days,
        meetingTimes: row.meeting_times,
        scheduleText,
        roomLabel,
      };
    });

    // Query enrollments - use junction table if available, otherwise fallback to cs.instructor_id
    const enrollmentsSql = hasJunctionTable ? `
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
        cs.instructor_id,

        c.subject,
        c.course_num,
        c.title AS course_title,
        c.credits,

        t.semester,
        t.year,

        r.building,
        r.room,

        u.first_name AS instructor_first_name,
        u.last_name AS instructor_last_name,

        COALESCE(
          JSON_AGG(
            JSON_BUILD_OBJECT(
              'id', u_instr.user_id,
              'first_name', u_instr.first_name,
              'last_name', u_instr.last_name
            )
          ) FILTER (WHERE u_instr.user_id IS NOT NULL),
          '[]'::json
        ) AS instructors
      FROM enrollments e
      JOIN class_sections cs ON cs.class_id = e.class_id
      JOIN courses c       ON c.course_id = cs.course_id
      JOIN terms t         ON t.term_id = cs.term_id
      LEFT JOIN rooms r    ON r.room_id = cs.room_id
      LEFT JOIN users u    ON u.user_id = cs.instructor_id
      LEFT JOIN class_section_instructors csi ON csi.class_id = cs.class_id
      LEFT JOIN users u_instr ON u_instr.user_id = csi.instructor_id
      WHERE e.student_id = $1
      GROUP BY e.class_id, e.student_id, e.status, e.gpnc, e.credits, e.grade, e.enrolled_at,
               cs.term_id, cs.section_num, cs.location_text, cs.meeting_days, cs.meeting_times, cs.instructor_id,
               c.subject, c.course_num, c.title, c.credits,
               t.semester, t.year, r.building, r.room,
               u.first_name, u.last_name
      ORDER BY t.year DESC, t.semester ASC, c.subject, c.course_num, cs.section_num
    ` : `
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
    `;

    const enrollmentsRes = await req.db.query(enrollmentsSql, [studentId]);

    const enrollments = enrollmentsRes.rows.map((row) => {
      const scheduleText = buildScheduleText(row);
      const instructorName = extractInstructorName(row, hasJunctionTable);

      // Prefer building+room over location_text, but use location_text as fallback
      // Match the logic used in the sections endpoint
      const roomLabel = (() => {
        if (row.building && row.room) {
          return `${row.building} ${row.room}`;
        }
        // Fallback to location_text, but clean it if it looks like it contains an instructor name
        if (row.location_text) {
          const { building, room } = extractBuildingRoomFromText(row.location_text);
          if (building && room) {
            return `${building} ${room}`;
          }
          return row.location_text;
        }
        return null;
      })();

      return {
        enrollmentId: row.class_id,
        classId: row.class_id,
        termId: row.term_id,
        termLabel: `${row.semester} ${row.year}`,
        sectionNum: row.section_num,
        courseCode: `${row.subject} ${row.course_num}`,
        courseTitle: row.course_title,
        credits: Number(row.credits) || 0,
        instructorName,
        meetingDays: row.meeting_days,
        meetingTimes: row.meeting_times,
        scheduleText,
        roomLabel,
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

  // Check if class_section_instructors junction table exists
  const tableCheck = await client.query(`
    SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = 'class_section_instructors'
    ) AS table_exists
  `);
  const hasJunctionTable = tableCheck.rows[0]?.table_exists === true;

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

    console.log('[enroll] Section details from database:', {
      class_id: secRow.class_id,
      course: `${secRow.subject} ${secRow.course_num}`,
      section_num: secRow.section_num,
      term_id: termId,
      meeting_days: secRow.meeting_days,
      meeting_days_type: typeof secRow.meeting_days,
      meeting_days_is_null: secRow.meeting_days === null,
      meeting_days_value: JSON.stringify(secRow.meeting_days),
      meeting_times: secRow.meeting_times,
      meeting_times_type: typeof secRow.meeting_times,
      meeting_times_is_null: secRow.meeting_times === null,
      meeting_times_value: JSON.stringify(secRow.meeting_times),
    });

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

    console.log('[enroll] About to check time conflict for:', {
      studentId,
      classId,
      termId,
      course: `${secRow.subject} ${secRow.course_num}`,
      section: secRow.section_num,
      meeting_days: secRow.meeting_days,
      meeting_times: secRow.meeting_times
    });

    const timeConflict = await checkTimeConflict(client, studentId, classId, termId);
    
    console.log('[enroll] Time conflict check result:', {
      hasConflict: timeConflict.hasConflict,
      conflictingClass: timeConflict.conflictingClass
    });

    if (timeConflict.hasConflict) {
      const hasWaiver = await hasTimeConflictWaiver(client, studentId, classId, timeConflict.conflictingClass.classId);
      console.log('[enroll] Time conflict waiver check:', {
        hasWaiver,
        classId1: classId,
        classId2: timeConflict.conflictingClass.classId
      });
      if (!hasWaiver) {
        await client.query('ROLLBACK');
        console.log('[enroll] Time conflict detected, no waiver - blocking enrollment');
        return res.status(400).json({
          ok: false,
          error: `Time conflict with ${timeConflict.conflictingClass.courseCode}. Time conflict waiver required.`,
          timeConflict: {
            newClassId: classId,
            conflictingClassId: timeConflict.conflictingClass.classId,
            conflictingCourseCode: timeConflict.conflictingClass.courseCode,
          },
        });
      }
      console.log('[enroll] Time conflict detected but waiver exists - allowing enrollment');
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

      const eRow = waitlistRes.rows[0];

      const metaResSql = hasJunctionTable ? `
        SELECT
          cs.class_id,
          cs.term_id,
          cs.section_num,
          cs.capacity,
          cs.location_text,
          cs.meeting_days,
          cs.meeting_times,
          cs.instructor_id,

          c.subject,
          c.course_num,
          c.title AS course_title,
          c.credits,

          t.semester,
          t.year,

          r.building,
          r.room,

          u.first_name AS instructor_first_name,
          u.last_name AS instructor_last_name,

          COALESCE(
            JSON_AGG(
              JSON_BUILD_OBJECT(
                'id', u_instr.user_id,
                'first_name', u_instr.first_name,
                'last_name', u_instr.last_name
              )
            ) FILTER (WHERE u_instr.user_id IS NOT NULL),
            '[]'::json
          ) AS instructors
        FROM class_sections cs
        JOIN courses c ON c.course_id = cs.course_id
        JOIN terms t   ON t.term_id = cs.term_id
        LEFT JOIN rooms r ON r.room_id = cs.room_id
        LEFT JOIN users u ON u.user_id = cs.instructor_id
        LEFT JOIN class_section_instructors csi ON csi.class_id = cs.class_id
        LEFT JOIN users u_instr ON u_instr.user_id = csi.instructor_id
        WHERE cs.class_id = $1
        GROUP BY cs.class_id, cs.term_id, cs.section_num, cs.capacity, cs.location_text,
                 cs.meeting_days, cs.meeting_times, cs.instructor_id,
                 c.subject, c.course_num, c.title, c.credits,
                 t.semester, t.year, r.building, r.room,
                 u.first_name, u.last_name
      ` : `
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
          u.last_name AS instructor_last_name
        FROM class_sections cs
        JOIN courses c ON c.course_id = cs.course_id
        JOIN terms t   ON t.term_id = cs.term_id
        LEFT JOIN rooms r ON r.room_id = cs.room_id
        LEFT JOIN users u ON u.user_id = cs.instructor_id
        WHERE cs.class_id = $1
      `;

      const metaRes = await client.query(metaResSql, [classId]);

      const row = metaRes.rows[0] ?? secRow;

      await client.query('COMMIT');

      const termLabel = `${row.semester} ${row.year}`;
      const instructorName = extractInstructorName(row, hasJunctionTable);

      const scheduleText = buildScheduleText(row);
      
      // Prefer building+room over location_text, but use location_text as fallback
      let roomLabel = '';
      if (row.building && row.room) {
        roomLabel = `${row.building} ${row.room}`;
      } else if (row.location_text) {
        const { building, room } = extractBuildingRoomFromText(row.location_text);
        if (building && room) {
          roomLabel = `${building} ${room}`;
        } else {
          // If extraction failed, use location_text as-is if it doesn't look like TBA
          if (row.location_text && !/^TBA/i.test(row.location_text)) {
            roomLabel = row.location_text;
          }
        }
      }

      return res.json({
        ok: true,
        waitlisted: true,
        message: 'Class is full. Added to waitlist.',
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
          status: 'waitlisted',
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
          enrolledCount: registeredCount,
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

    const metaResSql = hasJunctionTable ? `
      SELECT
        cs.class_id,
        cs.term_id,
        cs.section_num,
        cs.capacity,
        cs.location_text,
        cs.meeting_days,
        cs.meeting_times,
        cs.instructor_id,

        c.subject,
        c.course_num,
        c.title AS course_title,
        c.credits,

        t.semester,
        t.year,

        r.building,
        r.room,

        u.first_name AS instructor_first_name,
        u.last_name AS instructor_last_name,

        COALESCE(
          JSON_AGG(
            JSON_BUILD_OBJECT(
              'id', u_instr.user_id,
              'first_name', u_instr.first_name,
              'last_name', u_instr.last_name
            )
          ) FILTER (WHERE u_instr.user_id IS NOT NULL),
          '[]'::json
        ) AS instructors
      FROM class_sections cs
      JOIN courses c ON c.course_id = cs.course_id
      JOIN terms t   ON t.term_id = cs.term_id
      LEFT JOIN rooms r ON r.room_id = cs.room_id
      LEFT JOIN users u ON u.user_id = cs.instructor_id
      LEFT JOIN class_section_instructors csi ON csi.class_id = cs.class_id
      LEFT JOIN users u_instr ON u_instr.user_id = csi.instructor_id
      WHERE cs.class_id = $1
      GROUP BY cs.class_id, cs.term_id, cs.section_num, cs.capacity, cs.location_text,
               cs.meeting_days, cs.meeting_times, cs.instructor_id,
               c.subject, c.course_num, c.title, c.credits,
               t.semester, t.year, r.building, r.room,
               u.first_name, u.last_name
    ` : `
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
        u.last_name AS instructor_last_name
      FROM class_sections cs
      JOIN courses c ON c.course_id = cs.course_id
      JOIN terms t   ON t.term_id = cs.term_id
      LEFT JOIN rooms r ON r.room_id = cs.room_id
      LEFT JOIN users u ON u.user_id = cs.instructor_id
      WHERE cs.class_id = $1
    `;

    const metaRes = await client.query(metaResSql, [classId]);

    const row = metaRes.rows[0];

    await client.query('COMMIT');

    const termLabel = `${row.semester} ${row.year}`;
    const instructorName = extractInstructorName(row, hasJunctionTable);

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

  // Check if class_section_instructors junction table exists
  const tableCheck = await client.query(`
    SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = 'class_section_instructors'
    ) AS table_exists
  `);
  const hasJunctionTable = tableCheck.rows[0]?.table_exists === true;

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

    const metaResSql = hasJunctionTable ? `
      SELECT
        cs.class_id,
        cs.term_id,
        cs.section_num,
        cs.capacity,
        cs.location_text,
        cs.meeting_days,
        cs.meeting_times,
        cs.instructor_id,

        c.subject,
        c.course_num,
        c.title AS course_title,
        c.credits,

        t.semester,
        t.year,

        r.building,
        r.room,

        u.first_name AS instructor_first_name,
        u.last_name AS instructor_last_name,

        COALESCE(
          JSON_AGG(
            JSON_BUILD_OBJECT(
              'id', u_instr.user_id,
              'first_name', u_instr.first_name,
              'last_name', u_instr.last_name
            )
          ) FILTER (WHERE u_instr.user_id IS NOT NULL),
          '[]'::json
        ) AS instructors
      FROM class_sections cs
      JOIN courses c ON c.course_id = cs.course_id
      JOIN terms t   ON t.term_id = cs.term_id
      LEFT JOIN rooms r ON r.room_id = cs.room_id
      LEFT JOIN users u ON u.user_id = cs.instructor_id
      LEFT JOIN class_section_instructors csi ON csi.class_id = cs.class_id
      LEFT JOIN users u_instr ON u_instr.user_id = csi.instructor_id
      WHERE cs.class_id = $1
      GROUP BY cs.class_id, cs.term_id, cs.section_num, cs.capacity, cs.location_text,
               cs.meeting_days, cs.meeting_times, cs.instructor_id,
               c.subject, c.course_num, c.title, c.credits,
               t.semester, t.year, r.building, r.room,
               u.first_name, u.last_name
    ` : `
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
        u.last_name AS instructor_last_name
      FROM class_sections cs
      JOIN courses c ON c.course_id = cs.course_id
      JOIN terms t   ON t.term_id = cs.term_id
      LEFT JOIN rooms r ON r.room_id = cs.room_id
      LEFT JOIN users u ON u.user_id = cs.instructor_id
      WHERE cs.class_id = $1
    `;

    const metaRes = await client.query(metaResSql, [class_id]);

    const row = metaRes.rows[0] ?? secRow;

    await client.query('COMMIT');

    const termLabel = `${row.semester} ${row.year}`;
    const instructorName = extractInstructorName(row, hasJunctionTable);

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

    // Advisors can place all types of holds (financial, disciplinary, other, and academic_advising if authorized)

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

    // Advisors can remove all types of holds (financial, disciplinary, other, and academic_advising if authorized)

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
    // Check if class_section_instructors junction table exists
    const tableCheck = await req.db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'class_section_instructors'
      ) AS table_exists
    `);
    const hasJunctionTable = tableCheck.rows[0]?.table_exists === true;

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

    // Determine which specific class this instructor teaches
    // Check both junction table and direct instructor_id column
    let isInstructor1 = false;
    let isInstructor2 = false;

    if (hasJunctionTable) {
      const instructor1Check = await req.db.query(
        `
        SELECT 1 FROM class_section_instructors
        WHERE class_id = $1 AND instructor_id = $2
      `,
        [class_id_1, userId]
      );
      const instructor2Check = await req.db.query(
        `
        SELECT 1 FROM class_section_instructors
        WHERE class_id = $1 AND instructor_id = $2
      `,
        [class_id_2, userId]
      );
      isInstructor1 = instructor1Check.rows.length > 0;
      isInstructor2 = instructor2Check.rows.length > 0;
    }

    // Fallback: check direct instructor_id column if junction table doesn't exist or no match found
    if (!isInstructor1 && !isInstructor2) {
      const instructor1Check = await req.db.query(
        `
        SELECT 1 FROM class_sections
        WHERE class_id = $1 AND instructor_id = $2
      `,
        [class_id_1, userId]
      );
      const instructor2Check = await req.db.query(
        `
        SELECT 1 FROM class_sections
        WHERE class_id = $1 AND instructor_id = $2
      `,
        [class_id_2, userId]
      );
      isInstructor1 = instructor1Check.rows.length > 0;
      isInstructor2 = instructor2Check.rows.length > 0;
    }

    if (!isInstructor1 && !isInstructor2) {
      return res.status(403).json({ ok: false, error: 'You are not an instructor for either class' });
    }

    // Update the appropriate instructor approval field
    if (isInstructor1) {
      await req.db.query(
        `
        UPDATE time_conflict_waivers
        SET instructor_1_approved = $1, instructor_1_approved_by = $2, instructor_1_approved_at = NOW()
        WHERE waiver_id = $3
      `,
        [approved, userId, waiverId]
      );
    } else if (isInstructor2) {
      await req.db.query(
        `
        UPDATE time_conflict_waivers
        SET instructor_2_approved = $1, instructor_2_approved_by = $2, instructor_2_approved_at = NOW()
        WHERE waiver_id = $3
      `,
        [approved, userId, waiverId]
      );
    }

    // Check if all approvals are in place (both instructors + advisor)
    if (approved) {
      const checkRes = await req.db.query(
        `
        SELECT instructor_1_approved, instructor_2_approved, advisor_approved
        FROM time_conflict_waivers
        WHERE waiver_id = $1
      `,
        [waiverId]
      );

      if (checkRes.rows[0].instructor_1_approved && 
          checkRes.rows[0].instructor_2_approved && 
          checkRes.rows[0].advisor_approved) {
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
    // First, get the student_user_id from the waiver to validate advisor permissions
    const waiverRes = await req.db.query(
      `
      SELECT student_user_id
      FROM time_conflict_waivers
      WHERE waiver_id = $1
    `,
      [waiverId]
    );

    if (waiverRes.rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Waiver not found' });
    }

    const studentId = waiverRes.rows[0].student_user_id;

    // Validate that the advisor can approve for this student (similar to canAdvisorPlaceHold logic)
    const canApprove = await canAdvisorPlaceHold(req.db, userId, studentId);
    if (!canApprove) {
      return res.status(403).json({ 
        ok: false, 
        error: 'You do not have permission to approve waivers for this student. Only advisors for the student\'s department/college or university-level advisors can approve.' 
      });
    }

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
        SELECT instructor_1_approved, instructor_2_approved, advisor_approved
        FROM time_conflict_waivers
        WHERE waiver_id = $1
      `,
        [waiverId]
      );

      if (checkRes.rows[0].instructor_1_approved && 
          checkRes.rows[0].instructor_2_approved && 
          checkRes.rows[0].advisor_approved) {
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

// GET endpoint for instructors to view pending time conflict waivers
router.get('/time-conflict-waiver/pending-instructor', async (req, res) => {
  const userRole = getUserRole(req);
  const userId = req.user?.user_id ?? req.user?.userId ?? null;

  if (userRole !== 'Instructor') {
    return res.status(403).json({ ok: false, error: 'Only instructors can view instructor pending waivers' });
  }

  try {
    // Check if class_section_instructors junction table exists
    const tableCheck = await req.db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'class_section_instructors'
      ) AS table_exists
    `);
    const hasJunctionTable = tableCheck.rows[0]?.table_exists === true;

    // Query waivers where:
    // 1. Status is 'pending'
    // 2. The instructor teaches one of the classes (class_id_1 or class_id_2)
    // 3. The instructor hasn't approved yet (instructor_1_approved is false if they teach class_id_1, instructor_2_approved is false if they teach class_id_2)
    const query = hasJunctionTable ? `
      SELECT DISTINCT
        tcw.waiver_id,
        tcw.student_user_id,
        tcw.class_id_1,
        tcw.class_id_2,
        tcw.instructor_1_approved,
        tcw.instructor_2_approved,
        tcw.advisor_approved,
        tcw.status,
        tcw.requested_at,
        -- Student info
        u_student.first_name AS student_first_name,
        u_student.last_name AS student_last_name,
        u_student.email AS student_email,
        -- Class 1 info
        c1.subject AS class1_subject,
        c1.course_num AS class1_course_num,
        c1.title AS class1_title,
        cs1.section_num AS class1_section_num,
        cs1.meeting_days AS class1_meeting_days,
        cs1.meeting_times AS class1_meeting_times,
        t1.semester AS class1_semester,
        t1.year AS class1_year,
        -- Class 2 info
        c2.subject AS class2_subject,
        c2.course_num AS class2_course_num,
        c2.title AS class2_title,
        cs2.section_num AS class2_section_num,
        cs2.meeting_days AS class2_meeting_days,
        cs2.meeting_times AS class2_meeting_times,
        t2.semester AS class2_semester,
        t2.year AS class2_year,
        -- Determine which class this instructor teaches
        CASE 
          WHEN EXISTS (SELECT 1 FROM class_section_instructors csi1 WHERE csi1.class_id = tcw.class_id_1 AND csi1.instructor_id = $1) THEN 1
          WHEN EXISTS (SELECT 1 FROM class_section_instructors csi2 WHERE csi2.class_id = tcw.class_id_2 AND csi2.instructor_id = $1) THEN 2
          ELSE NULL
        END AS instructor_class_number,
        CASE 
          WHEN EXISTS (SELECT 1 FROM class_section_instructors csi1 WHERE csi1.class_id = tcw.class_id_1 AND csi1.instructor_id = $1) THEN NOT tcw.instructor_1_approved
          WHEN EXISTS (SELECT 1 FROM class_section_instructors csi2 WHERE csi2.class_id = tcw.class_id_2 AND csi2.instructor_id = $1) THEN NOT tcw.instructor_2_approved
          ELSE FALSE
        END AS needs_approval
      FROM time_conflict_waivers tcw
      JOIN users u_student ON u_student.user_id = tcw.student_user_id
      JOIN class_sections cs1 ON cs1.class_id = tcw.class_id_1
      JOIN courses c1 ON c1.course_id = cs1.course_id
      JOIN terms t1 ON t1.term_id = cs1.term_id
      JOIN class_sections cs2 ON cs2.class_id = tcw.class_id_2
      JOIN courses c2 ON c2.course_id = cs2.course_id
      JOIN terms t2 ON t2.term_id = cs2.term_id
      WHERE tcw.status = 'pending'
        AND (
          (EXISTS (SELECT 1 FROM class_section_instructors csi1 WHERE csi1.class_id = tcw.class_id_1 AND csi1.instructor_id = $1) AND NOT tcw.instructor_1_approved)
          OR
          (EXISTS (SELECT 1 FROM class_section_instructors csi2 WHERE csi2.class_id = tcw.class_id_2 AND csi2.instructor_id = $1) AND NOT tcw.instructor_2_approved)
        )
      ORDER BY tcw.requested_at DESC
    ` : `
      SELECT DISTINCT
        tcw.waiver_id,
        tcw.student_user_id,
        tcw.class_id_1,
        tcw.class_id_2,
        tcw.instructor_1_approved,
        tcw.instructor_2_approved,
        tcw.advisor_approved,
        tcw.status,
        tcw.requested_at,
        -- Student info
        u_student.first_name AS student_first_name,
        u_student.last_name AS student_last_name,
        u_student.email AS student_email,
        -- Class 1 info
        c1.subject AS class1_subject,
        c1.course_num AS class1_course_num,
        c1.title AS class1_title,
        cs1.section_num AS class1_section_num,
        cs1.meeting_days AS class1_meeting_days,
        cs1.meeting_times AS class1_meeting_times,
        t1.semester AS class1_semester,
        t1.year AS class1_year,
        -- Class 2 info
        c2.subject AS class2_subject,
        c2.course_num AS class2_course_num,
        c2.title AS class2_title,
        cs2.section_num AS class2_section_num,
        cs2.meeting_days AS class2_meeting_days,
        cs2.meeting_times AS class2_meeting_times,
        t2.semester AS class2_semester,
        t2.year AS class2_year,
        -- Determine which class this instructor teaches
        CASE 
          WHEN cs1.instructor_id = $1 THEN 1
          WHEN cs2.instructor_id = $1 THEN 2
          ELSE NULL
        END AS instructor_class_number,
        CASE 
          WHEN cs1.instructor_id = $1 THEN NOT tcw.instructor_1_approved
          WHEN cs2.instructor_id = $1 THEN NOT tcw.instructor_2_approved
          ELSE FALSE
        END AS needs_approval
      FROM time_conflict_waivers tcw
      JOIN users u_student ON u_student.user_id = tcw.student_user_id
      JOIN class_sections cs1 ON cs1.class_id = tcw.class_id_1
      JOIN courses c1 ON c1.course_id = cs1.course_id
      JOIN terms t1 ON t1.term_id = cs1.term_id
      JOIN class_sections cs2 ON cs2.class_id = tcw.class_id_2
      JOIN courses c2 ON c2.course_id = cs2.course_id
      JOIN terms t2 ON t2.term_id = cs2.term_id
      WHERE tcw.status = 'pending'
        AND (
          (cs1.instructor_id = $1 AND NOT tcw.instructor_1_approved)
          OR
          (cs2.instructor_id = $1 AND NOT tcw.instructor_2_approved)
        )
      ORDER BY tcw.requested_at DESC
    `;

    const result = await req.db.query(query, [userId]);

    const waivers = result.rows.map(row => ({
      waiverId: row.waiver_id,
      studentId: row.student_user_id,
      studentName: `${row.student_first_name} ${row.student_last_name}`,
      studentEmail: row.student_email,
      class1: {
        classId: row.class_id_1,
        courseCode: `${row.class1_subject} ${row.class1_course_num}`,
        courseTitle: row.class1_title,
        sectionNum: row.class1_section_num,
        meetingDays: row.class1_meeting_days,
        meetingTimes: row.class1_meeting_times,
        term: `${row.class1_semester} ${row.class1_year}`,
      },
      class2: {
        classId: row.class_id_2,
        courseCode: `${row.class2_subject} ${row.class2_course_num}`,
        courseTitle: row.class2_title,
        sectionNum: row.class2_section_num,
        meetingDays: row.class2_meeting_days,
        meetingTimes: row.class2_meeting_times,
        term: `${row.class2_semester} ${row.class2_year}`,
      },
      instructorClassNumber: row.instructor_class_number,
      instructor1Approved: row.instructor_1_approved,
      instructor2Approved: row.instructor_2_approved,
      advisorApproved: row.advisor_approved,
      status: row.status,
      requestedAt: row.requested_at,
    }));

    return res.json({ ok: true, waivers });
  } catch (err) {
    console.error('[registration/time-conflict-waiver/pending-instructor]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET endpoint for advisors to view pending time conflict waivers
router.get('/time-conflict-waiver/pending-advisor', async (req, res) => {
  const userRole = getUserRole(req);
  const userId = req.user?.user_id ?? req.user?.userId ?? null;

  if (userRole !== 'Advisor') {
    return res.status(403).json({ ok: false, error: 'Only advisors can view advisor pending waivers' });
  }

  try {
    // Get all pending waivers where advisor hasn't approved yet
    // Then filter by advisor scope using canAdvisorPlaceHold logic
    const query = `
      SELECT
        tcw.waiver_id,
        tcw.student_user_id,
        tcw.class_id_1,
        tcw.class_id_2,
        tcw.instructor_1_approved,
        tcw.instructor_2_approved,
        tcw.advisor_approved,
        tcw.status,
        tcw.requested_at,
        -- Student info
        u_student.first_name AS student_first_name,
        u_student.last_name AS student_last_name,
        u_student.email AS student_email,
        -- Class 1 info
        c1.subject AS class1_subject,
        c1.course_num AS class1_course_num,
        c1.title AS class1_title,
        cs1.section_num AS class1_section_num,
        cs1.meeting_days AS class1_meeting_days,
        cs1.meeting_times AS class1_meeting_times,
        t1.semester AS class1_semester,
        t1.year AS class1_year,
        -- Class 2 info
        c2.subject AS class2_subject,
        c2.course_num AS class2_course_num,
        c2.title AS class2_title,
        cs2.section_num AS class2_section_num,
        cs2.meeting_days AS class2_meeting_days,
        cs2.meeting_times AS class2_meeting_times,
        t2.semester AS class2_semester,
        t2.year AS class2_year
      FROM time_conflict_waivers tcw
      JOIN users u_student ON u_student.user_id = tcw.student_user_id
      JOIN class_sections cs1 ON cs1.class_id = tcw.class_id_1
      JOIN courses c1 ON c1.course_id = cs1.course_id
      JOIN terms t1 ON t1.term_id = cs1.term_id
      JOIN class_sections cs2 ON cs2.class_id = tcw.class_id_2
      JOIN courses c2 ON c2.course_id = cs2.course_id
      JOIN terms t2 ON t2.term_id = cs2.term_id
      WHERE tcw.status = 'pending'
        AND NOT tcw.advisor_approved
      ORDER BY tcw.requested_at DESC
    `;

    const result = await req.db.query(query);

    // Filter waivers by advisor scope
    const filteredWaivers = [];
    for (const row of result.rows) {
      const canApprove = await canAdvisorPlaceHold(req.db, userId, row.student_user_id);
      if (canApprove) {
        filteredWaivers.push({
          waiverId: row.waiver_id,
          studentId: row.student_user_id,
          studentName: `${row.student_first_name} ${row.student_last_name}`,
          studentEmail: row.student_email,
          class1: {
            classId: row.class_id_1,
            courseCode: `${row.class1_subject} ${row.class1_course_num}`,
            courseTitle: row.class1_title,
            sectionNum: row.class1_section_num,
            meetingDays: row.class1_meeting_days,
            meetingTimes: row.class1_meeting_times,
            term: `${row.class1_semester} ${row.class1_year}`,
          },
          class2: {
            classId: row.class_id_2,
            courseCode: `${row.class2_subject} ${row.class2_course_num}`,
            courseTitle: row.class2_title,
            sectionNum: row.class2_section_num,
            meetingDays: row.class2_meeting_days,
            meetingTimes: row.class2_meeting_times,
            term: `${row.class2_semester} ${row.class2_year}`,
          },
          instructor1Approved: row.instructor_1_approved,
          instructor2Approved: row.instructor_2_approved,
          advisorApproved: row.advisor_approved,
          status: row.status,
          requestedAt: row.requested_at,
        });
      }
    }

    return res.json({ ok: true, waivers: filteredWaivers });
  } catch (err) {
    console.error('[registration/time-conflict-waiver/pending-advisor]', err);
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
