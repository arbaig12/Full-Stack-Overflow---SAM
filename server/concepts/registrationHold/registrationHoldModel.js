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
      student_id,
      hold_type,
      note
    FROM registration_holds
    WHERE student_id = $1
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
  const { student_id, hold_type, note } = hold;
  const sql = `
    INSERT INTO registration_holds (student_id, hold_type, note)
    VALUES ($1, $2, $3)
    RETURNING hold_id, student_id, hold_type, note
  `;
  const { rows } = await db.query(sql, [student_id, hold_type, note]);
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
