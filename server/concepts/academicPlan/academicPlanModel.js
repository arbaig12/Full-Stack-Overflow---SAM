import { getStudentProfile } from '../studentProfile/studentProfileModel.js';
import { getDegreeRequirements, checkDegreeRequirements } from '../degreeRequirement/degreeRequirementModel.js';
import { getCourseInfo } from '../courseCatalog/courseCatalogModel.js';

/**
 * Creates a new academic plan for a student.
 *
 * @param {import('pg').Pool} db - The database connection pool object.
 * @param {number} studentUserId - The ID of the student.
 * @param {string} planName - The name of the academic plan.
 * @param {object} [preferences] - Optional plan preferences (e.g., grad_term_semester, grad_term_year, workload_limits).
 * @returns {Promise<object>} A promise that resolves to the newly created academic plan object.
 */
export async function createAcademicPlan(db, studentUserId, planName, preferences = {}) {
  const { grad_term_semester, grad_term_year, workload_limits } = preferences;
  const sql = `
    INSERT INTO academic_plans (student_user_id, plan_name, grad_term_semester, grad_term_year, workload_limits)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING plan_id, student_user_id, plan_name, created_at, updated_at, grad_term_semester, grad_term_year, workload_limits
  `;
  const { rows } = await db.query(sql, [studentUserId, planName, grad_term_semester, grad_term_year, workload_limits]);
  return rows[0];
}

/**
 * Retrieves an academic plan for a student, including its planned courses.
 *
 * @param {import('pg').Pool} db - The database connection pool object.
 * @param {number} planId - The ID of the academic plan.
 * @returns {Promise<object|null>} A promise that resolves to the academic plan object with its courses, or null if not found.
 */
export async function getAcademicPlan(db, planId) {
  const planSql = `
    SELECT plan_id, student_user_id, plan_name, created_at, updated_at, grad_term_semester, grad_term_year, workload_limits
    FROM academic_plans
    WHERE plan_id = $1
  `;
  const { rows: planRows } = await db.query(planSql, [planId]);
  if (planRows.length === 0) {
    return null;
  }
  const plan = planRows[0];

  const coursesSql = `
    SELECT apc.plan_course_id, apc.course_id, c.subject, c.course_num, c.name, apc.planned_term_semester, apc.planned_term_year
    FROM academic_plan_courses apc
    JOIN courses c ON apc.course_id = c.course_id
    WHERE apc.plan_id = $1
    ORDER BY apc.planned_term_year, apc.planned_term_semester
  `;
  const { rows: coursesRows } = await db.query(coursesSql, [planId]);
  plan.courses = coursesRows;

  return plan;
}

/**
 * Updates an existing academic plan's details and preferences.
 *
 * @param {import('pg').Pool} db - The database connection pool object.
 * @param {number} planId - The ID of the academic plan to update.
 * @param {object} updates - An object containing fields to update (e.g., planName, grad_term_semester, grad_term_year, workload_limits).
 * @returns {Promise<object|null>} A promise that resolves to the updated academic plan object, or null if not found.
 */
export async function updateAcademicPlan(db, planId, updates) {
  const { planName, grad_term_semester, grad_term_year, workload_limits } = updates;
  const fields = [];
  const params = [planId];
  let paramIndex = 1;

  if (planName !== undefined) {
    paramIndex++;
    fields.push(`plan_name = $${paramIndex}`);
    params.push(planName);
  }
  if (grad_term_semester !== undefined) {
    paramIndex++;
    fields.push(`grad_term_semester = $${paramIndex}`);
    params.push(grad_term_semester);
  }
  if (grad_term_year !== undefined) {
    paramIndex++;
    fields.push(`grad_term_year = $${paramIndex}`);
    params.push(grad_term_year);
  }
  if (workload_limits !== undefined) {
    paramIndex++;
    fields.push(`workload_limits = $${paramIndex}`);
    params.push(workload_limits);
  }

  if (fields.length === 0) {
    return getAcademicPlan(db, planId); // No updates, return current plan
  }

  params.push(planId); // Add planId again for the WHERE clause
  const sql = `
    UPDATE academic_plans
    SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
    WHERE plan_id = $${paramIndex + 1}
    RETURNING plan_id, student_user_id, plan_name, created_at, updated_at, grad_term_semester, grad_term_year, workload_limits
  `;
  const { rows } = await db.query(sql, params);
  return rows[0] || null;
}

/**
 * Deletes an academic plan and all its associated courses.
 *
 * @param {import('pg').Pool} db - The database connection pool object.
 * @param {number} planId - The ID of the academic plan to delete.
 * @returns {Promise<void>}
 */
export async function deleteAcademicPlan(db, planId) {
  // ON DELETE CASCADE on academic_plan_courses handles course deletion
  const sql = `
    DELETE FROM academic_plans
    WHERE plan_id = $1
  `;
  await db.query(sql, [planId]);
}

/**
 * Adds a course to an academic plan.
 *
 * @param {import('pg').Pool} db - The database connection pool object.
 * @param {number} planId - The ID of the academic plan.
 * @param {number} courseId - The ID of the course to add.
 * @param {string} plannedTermSemester - The planned semester for the course.
 * @param {number} plannedTermYear - The planned year for the course.
 * @returns {Promise<object>} A promise that resolves to the new academic plan course entry.
 */
export async function addCourseToAcademicPlan(db, planId, courseId, plannedTermSemester, plannedTermYear) {
  const sql = `
    INSERT INTO academic_plan_courses (plan_id, course_id, planned_term_semester, planned_term_year)
    VALUES ($1, $2, $3, $4)
    RETURNING plan_course_id, plan_id, course_id, planned_term_semester, planned_term_year
  `;
  const { rows } = await db.query(sql, [planId, courseId, plannedTermSemester, plannedTermYear]);
  return rows[0];
}

/**
 * Removes a course from an academic plan.
 *
 * @param {import('pg').Pool} db - The database connection pool object.
 * @param {number} planCourseId - The ID of the academic plan course entry to remove.
 * @returns {Promise<void>}
 */
export async function removeCourseFromAcademicPlan(db, planCourseId) {
  const sql = `
    DELETE FROM academic_plan_courses
    WHERE plan_course_id = $1
  `;
  await db.query(sql, [planCourseId]);
}

/**
 * Helper function to check if a student's course matches a target course.
 * @param {object} targetCourse - The course to match (e.g., {subject: 'CSE', course_num: '101', min_grade: 'C'}).
 * @param {object} studentCourse - The student's course (e.g., {subject: 'CSE', course_num: '101', grade: 'A', status: 'completed'}).
 * @returns {boolean} True if the student course matches the target and meets grade requirements.
 */
function courseMatches(targetCourse, studentCourse) {
  if (studentCourse.subject === targetCourse.subject && studentCourse.course_num === targetCourse.course_num) {
    if (targetCourse.min_grade) {
      // For planned courses, assume passing grade for now
      if (studentCourse.status === 'planned') return true;
      // For completed courses, check actual grade
      const gradePoints = { 'A': 4.0, 'A-': 3.7, 'B+': 3.3, 'B': 3.0, 'B-': 2.7, 'C+': 2.3, 'C': 2.0, 'C-': 1.7, 'D+': 1.3, 'D': 1.0, 'F': 0.0 };
      return gradePoints[studentCourse.grade] >= gradePoints[targetCourse.min_grade];
    }
    return true;
  }
  return false;
}

/**
 * Helper function to evaluate a single prerequisite/corequisite/antirequisite rule.
 * @param {object} rule - The rule object (e.g., {type: 'courses', courses: [{subject: 'CSE', course_num: '101'}]}).
 * @param {Array<object>} allStudentCourses - Combined list of completed and planned courses.
 * @param {string} ruleType - 'prereq', 'coreq', or 'antireq' for specific logic.
 * @returns {boolean} True if the rule is satisfied, false otherwise.
 */
function evaluateRule(rule, allStudentCourses, ruleType) {
  if (rule.type === 'courses' && rule.courses) {
    // For 'AND' logic (all courses in the rule must be satisfied)
    return rule.courses.every(reqCourse =>
      allStudentCourses.some(studentCourse => courseMatches(reqCourse, studentCourse))
    );
  } else if (rule.type === 'min_standing' && rule.standing) {
    // This would require student's current/projected standing, which is complex.
    // For now, assume it's not met if it's a planned course and standing isn't explicitly checked.
    // Or, if studentProfile has a standing, check against that.
    // Placeholder: always return true for now, or integrate with studentProfile.class_standing
    return true;
  } else if (rule.type === 'permission_of_instructor') {
    // Cannot validate automatically, assume not met unless explicitly waived.
    return false;
  }
  // Add more rule types as needed (e.g., 'choice', 'credits', 'sbc')
  return true; // Default to true for unknown rule types to avoid blocking
}

/**
 * Validates an academic plan against requirements.
 * This function interacts with Course_Catalog, Degree_Requirement, and Student_Profile concepts.
 *
 * @param {import('pg').Pool} db - The database connection pool object.
 * @param {number} planId - The ID of the academic plan to validate.
 * @returns {Promise<object>} A promise that resolves to a validation result object.
 */
export async function validateAcademicPlan(db, planId) {
  const issues = [];
  let isValid = true;

  // 1. Retrieve Academic Plan
  const academicPlan = await getAcademicPlan(db, planId);
  if (!academicPlan) {
    issues.push({ type: 'error', message: `Academic Plan with ID ${planId} not found.` });
    return { planId, isValid: false, issues };
  }

  // 2. Retrieve Student Profile
  const studentProfile = await getStudentProfile(db, academicPlan.student_user_id);
  if (!studentProfile) {
    issues.push({ type: 'error', message: `Student Profile for user ID ${academicPlan.student_user_id} not found.` });
    return { planId, isValid: false, issues };
  }

  const studentTranscript = studentProfile.classes || []; // Completed courses
  const declaredPrograms = studentProfile.academic_programs || []; // Declared majors/minors

  // Combine completed and planned courses for comprehensive checks
  // For planned courses, assume a passing grade for prerequisite checks
  const allStudentCourses = [
    ...studentTranscript.map(c => ({ ...c, status: 'completed' })),
    ...academicPlan.courses.map(c => ({ ...c, status: 'planned', grade: 'C' })) // Assume 'C' for planned
  ];

  // 3. Validate Workload Limits
  const workloadLimits = academicPlan.workload_limits;
  if (workloadLimits) {
    const termWorkloads = {};
    for (const course of academicPlan.courses) {
      const termKey = `${course.planned_term_semester} ${course.planned_term_year}`;
      termWorkloads[termKey] = (termWorkloads[termKey] || 0) + (course.credits || 3); // Assuming 3 credits if not specified
    }

    for (const termKey in termWorkloads) {
      if (workloadLimits[termKey] && termWorkloads[termKey] > workloadLimits[termKey]) {
        issues.push({
          type: 'warning',
          message: `Workload for ${termKey} (${termWorkloads[termKey]} credits) exceeds limit (${workloadLimits[termKey]} credits).`
        });
        isValid = false;
      }
    }
  }

  // 4. Validate Prerequisites, Corequisites, and Anti-requisites for Planned Courses
  for (const plannedCourse of academicPlan.courses) {
    const courseDetails = await getCourseInfo(db, { subject: plannedCourse.subject, courseNum: plannedCourse.course_num }, `${plannedCourse.planned_term_semester} ${plannedCourse.planned_term_year}`);

    if (!courseDetails) {
      issues.push({
        type: 'error',
        message: `Course ${plannedCourse.subject} ${plannedCourse.course_num} in plan not found in catalog for term ${plannedCourse.planned_term_semester} ${plannedCourse.planned_term_year}.`
      });
      isValid = false;
      continue;
    }

    // Prerequisite checks
    if (courseDetails.prereq_rules && courseDetails.prereq_rules.length > 0) {
      const prereqsMet = courseDetails.prereq_rules.every(rule => evaluateRule(rule, allStudentCourses, 'prereq'));
      if (!prereqsMet) {
        issues.push({
          type: 'error',
          message: `Prerequisites not met for ${plannedCourse.subject} ${plannedCourse.course_num}.`,
          details: courseDetails.prereq_rules
        });
        isValid = false;
      }
    }

    // Corequisite checks (simplified: assume coreqs must be taken concurrently or before)
    if (courseDetails.coreq_rules && courseDetails.coreq_rules.length > 0) {
      const coreqsMet = courseDetails.coreq_rules.every(rule => evaluateRule(rule, allStudentCourses, 'coreq'));
      if (!coreqsMet) {
        issues.push({
          type: 'error',
          message: `Corequisites not met for ${plannedCourse.subject} ${plannedCourse.course_num}.`,
          details: courseDetails.coreq_rules
        });
        isValid = false;
      }
    }

    // Anti-requisite checks
    if (courseDetails.anti_req_rules && courseDetails.anti_req_rules.length > 0) {
      const antireqsViolated = courseDetails.anti_req_rules.some(rule => evaluateRule(rule, allStudentCourses, 'antireq'));
      if (antireqsViolated) {
        issues.push({
          type: 'error',
          message: `Anti-requisite violation for ${plannedCourse.subject} ${plannedCourse.course_num}.`,
          details: courseDetails.anti_req_rules
        });
        isValid = false;
      }
    }
  }

  // 5. Validate Degree Requirements
  for (const program of declaredPrograms) {
    const degreeRequirements = await getDegreeRequirements(db, program.subject, program.degree_type);
    if (!degreeRequirements) {
      issues.push({
        type: 'warning',
        message: `Degree requirements for declared program ${program.subject} ${program.degree_type} not found.`
      });
      continue;
    }

    const degreeValidationResult = await checkDegreeRequirements(db, studentProfile.user_id, degreeRequirements, studentTranscript, academicPlan.courses, null);

    if (degreeValidationResult.status === 'unsatisfied') {
      issues.push({
        type: 'error',
        message: `Degree requirements for ${program.subject} ${program.degree_type} are not satisfied by the plan.`,
        details: degreeValidationResult.details
      });
      isValid = false;
    } else if (degreeValidationResult.status === 'pending') {
      issues.push({
        type: 'warning',
        message: `Degree requirements for ${program.subject} ${program.degree_type} are pending with the current plan.`,
        details: degreeValidationResult.details
      });
    }
  }

  // 6. Time Conflict Validation (Placeholder)
  // This would involve fetching class schedule data for planned courses and checking for overlaps.
  issues.push({ type: 'info', message: 'Time conflict validation is not yet implemented.' });

  return { planId, isValid, issues };
}

/**
 * Automatically generates an academic plan for a student.
 * This function interacts with Course_Catalog, Degree_Requirement, and Student_Profile concepts.
 *
 * @param {import('pg').Pool} db - The database connection pool object.
 * @param {number} studentUserId - The ID of the student.
 * @param {object} preferences - Student's planning preferences.
 * @returns {Promise<object>} A promise that resolves to a generated academic plan.
 */
export async function autoGenerateAcademicPlan(db, studentUserId, preferences) {
  console.warn(`[AcademicPlan] autoGenerateAcademicPlan for student ${studentUserId} is being implemented.`);
  const issues = [];

  // 1. Fetch Student Data
  const studentProfile = await getStudentProfile(db, studentUserId);
  if (!studentProfile) {
    throw new Error(`Student Profile for user ID ${studentUserId} not found.`);
  }

  const studentTranscript = studentProfile.classes || [];
  const declaredPrograms = studentProfile.academic_programs || [];
  const { grad_term_semester, grad_term_year, workload_limits } = preferences;

  // 2. Create a new academic plan
  const newPlan = await createAcademicPlan(db, studentUserId, 'Auto-Generated Plan', preferences);
  const plannedCourses = [];
  const currentPlannedCredits = {}; // Track credits per term for workload limits

  // Helper to get next term
  const getNextTerm = (semester, year) => {
    if (semester === 'Fall') return { semester: 'Spring', year: year + 1 };
    if (semester === 'Spring') return { semester: 'Summer', year: year };
    if (semester === 'Summer') return { semester: 'Fall', year: year };
    return { semester: 'Fall', year: year }; // Default
  };

  let currentTerm = getNextTerm(new Date().getMonth() < 6 ? 'Spring' : 'Fall', new Date().getFullYear()); // Start from next logical term

  // 3. Identify Unsatisfied Requirements
  const unsatisfiedRequiredCourses = new Set();
  for (const program of declaredPrograms) {
    const degreeRequirements = await getDegreeRequirements(db, program.subject, program.degree_type);
    if (!degreeRequirements) {
      issues.push({
        type: 'warning',
        message: `Degree requirements for declared program ${program.subject} ${program.degree_type} not found during auto-planning.`
      });
      continue;
    }
    const degreeValidationResult = await checkDegreeRequirements(db, studentUserId, degreeRequirements, studentTranscript, [], null);

    if (degreeValidationResult.details && degreeValidationResult.details.requiredCourses) {
      for (const reqCourse of degreeValidationResult.details.requiredCourses) {
        if (!reqCourse.satisfied) {
          unsatisfiedRequiredCourses.add(`${reqCourse.subject} ${reqCourse.number}`);
        }
      }
    }
  }

  // 4. Greedy Course Selection (Simplified)
  for (const courseSignature of unsatisfiedRequiredCourses) {
    const [subject, courseNum] = courseSignature.split(' ');
    const courseDetails = await getCourseInfo(db, { subject, courseNum }, `${currentTerm.semester} ${currentTerm.year}`);

    if (courseDetails) {
      const courseCredits = courseDetails.credits || 3; // Extract credits, default to 3

      // Check workload limits
      const termKey = `${currentTerm.semester} ${currentTerm.year}`;
      if (!currentPlannedCredits[termKey]) {
        currentPlannedCredits[termKey] = 0;
      }

      if (workload_limits && workload_limits[termKey] && (currentPlannedCredits[termKey] + courseCredits > workload_limits[termKey])) {
        issues.push({
          type: 'warning',
          message: `Skipped ${subject} ${courseNum} for ${termKey} due to workload limit.`
        });
        // Try next term
        currentTerm = getNextTerm(currentTerm.semester, currentTerm.year);
        // Re-evaluate for the new term (simple retry, could be more sophisticated)
        if (workload_limits && workload_limits[`${currentTerm.semester} ${currentTerm.year}`] && (currentPlannedCredits[`${currentTerm.semester} ${currentTerm.year}`] || 0) + courseCredits > workload_limits[`${currentTerm.semester} ${currentTerm.year}`]) {
            issues.push({
                type: 'warning',
                message: `Skipped ${subject} ${courseNum} for ${termKey} and next term due to workload limit.`
            });
            continue; // Skip this course if it can't fit even in the next term
        }
      }

      // Add course to planned courses
      plannedCourses.push({
        plan_id: newPlan.plan_id,
        course_id: courseDetails.course_id, // Use course_id from courseDetails
        planned_term_semester: currentTerm.semester,
        planned_term_year: currentTerm.year,
      });
      currentPlannedCredits[termKey] += courseCredits;

      // Move to the next term for the next course to distribute workload
      currentTerm = getNextTerm(currentTerm.semester, currentTerm.year);
    } else {
      issues.push({
        type: 'warning',
        message: `Required course ${courseSignature} not found in catalog for auto-planning.`
      });
    }
  }

  // 5. Save and Return Plan
  for (const course of plannedCourses) {
    await addCourseToAcademicPlan(db, course.plan_id, course.course_id, course.planned_term_semester, course.planned_term_year);
  }

  // Re-fetch the plan to include all newly added courses
  const finalPlan = await getAcademicPlan(db, newPlan.plan_id);
  return { plan: finalPlan, issues };
}
