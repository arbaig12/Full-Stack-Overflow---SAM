/**
 * @file registrationHoldModel.js
 * @description This file defines the data model and database interactions for the Registration Hold concept.
 * It includes functions for retrieving, placing, and removing registration holds on student accounts.
 */

/**
 * Retrieves all active registration holds for a specific student.
 *
 * @param {import('pg').Pool} db - The database connection pool object.
 * @param {number} studentId - The unique identifier for the student.
 * @returns {Promise<Array<object>>} A promise that resolves to an array of registration hold objects.
 * Each object contains details about a hold placed on the student's account.
 * @example
 * // Returns:
 * // [
 * //   { hold_id: 1, student_id: 101, hold_type: 'Academic', note: 'Outstanding academic probation' },
 * //   { hold_id: 2, student_id: 101, hold_type: 'Financial', note: 'Unpaid tuition fees' }
 * // ]
 */
export async function getStudentHolds(db, studentId) {
  const sql = `
    SELECT
      hold_id,
      student_user_id,
      hold_type,
      note,
      placed_by_user_id,
      placed_at,
      resolved_at,
      resolved_by_user_id
    FROM registration_holds
    WHERE student_user_id = $1
  `;
  const { rows } = await db.query(sql, [studentId]);
  return rows;
}

/**
 * Places a new registration hold on a student's account.
 *
 * @param {import('pg').Pool} db - The database connection pool object.
 * @param {object} hold - The details of the hold to be placed.
 * @param {number} hold.student_id - The ID of the student to place the hold on.
 * @param {string} hold.hold_type - The type of hold (e.g., 'Academic', 'Financial').
 * @param {string} [hold.note] - An optional note providing more details about the hold.
 * @returns {Promise<object>} A promise that resolves to the newly created registration hold object,
 * including its generated `hold_id`.
 */
export async function placeHold(db, hold) {
  const { student_user_id, hold_type, note, placed_by_user_id } = hold;
  const sql = `
    INSERT INTO registration_holds (student_user_id, hold_type, note, placed_by_user_id)
    VALUES ($1, $2, $3, $4)
    RETURNING hold_id, student_user_id, hold_type, note, placed_by_user_id, placed_at
  `;
  const { rows } = await db.query(sql, [student_user_id, hold_type, note, placed_by_user_id]);
  return rows[0];
}

/**
 * Removes an existing registration hold from a student's account.
 *
 * @param {import('pg').Pool} db - The database connection pool object.
 * @param {number} holdId - The unique identifier of the hold to be removed.
 * @returns {Promise<void>} A promise that resolves when the hold has been successfully removed.
 */
export async function removeHold(db, holdId) {
  const sql = `
    DELETE FROM registration_holds
    WHERE hold_id = $1
  `;
  await db.query(sql, [holdId]);
}

/**
 * Resolves an existing registration hold, marking it with a resolution timestamp and the user who resolved it.
 *
 * @param {import('pg').Pool} db - The database connection pool object.
 * @param {number} holdId - The unique identifier of the hold to be resolved.
 * @param {number} resolvedByUserId - The ID of the user who resolved the hold.
 * @returns {Promise<object|null>} A promise that resolves to the updated hold object if found, otherwise `null`.
 */
export async function resolveHold(db, holdId, resolvedByUserId) {
  const sql = `
    UPDATE registration_holds
    SET
      resolved_at = CURRENT_TIMESTAMP,
      resolved_by_user_id = $2
    WHERE hold_id = $1
    RETURNING hold_id, student_user_id, hold_type, note, placed_by_user_id, placed_at, resolved_at, resolved_by_user_id
  `;
  const { rows } = await db.query(sql, [holdId, resolvedByUserId]);
  return rows[0] || null;
}
