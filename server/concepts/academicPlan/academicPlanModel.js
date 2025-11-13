/**
 * @file academicPlanModel.js
 * @description This file defines the data model and database interactions for the Academic Plan concept.
 * It includes functions for creating, retrieving, updating, and managing student academic plans and their courses.
 */

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
 * Placeholder for validating an academic plan against requirements.
 * This function would interact with Course_Catalog, Degree_Requirement, and Student_Profile concepts.
 *
 * @param {import('pg').Pool} db - The database connection pool object.
 * @param {number} planId - The ID of the academic plan to validate.
 * @returns {Promise<object>} A promise that resolves to a validation result object.
 */
export async function validateAcademicPlan(db, planId) {
  console.warn(`[AcademicPlan] validateAcademicPlan for plan ${planId} is a placeholder and needs full implementation.`);
  // TODO: Implement actual validation logic
  return { planId, isValid: true, issues: [] };
}

/**
 * Placeholder for automatically generating an academic plan.
 * This function would interact with Course_Catalog, Degree_Requirement, and Student_Profile concepts.
 *
 * @param {import('pg').Pool} db - The database connection pool object.
 * @param {number} studentUserId - The ID of the student.
 * @param {object} preferences - Student's planning preferences.
 * @returns {Promise<object>} A promise that resolves to a generated academic plan.
 */
export async function autoGenerateAcademicPlan(db, studentUserId, preferences) {
  console.warn(`[AcademicPlan] autoGenerateAcademicPlan for student ${studentUserId} is a placeholder and needs full implementation.`);
  // TODO: Implement actual auto-planning logic
  const newPlan = await createAcademicPlan(db, studentUserId, 'Auto-Generated Plan', preferences);
  return newPlan;
}
