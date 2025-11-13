/**
 * @file waiverModel.js
 * @description This file defines the data model and database interactions for the Waiver concept.
 * It includes functions for retrieving, creating, and revoking academic waivers for students.
 */

/**
 * Retrieves all academic waivers associated with a specific student.
 *
 * @param {import('pg').Pool} db - The database connection pool object.
 * @param {number} studentId - The unique identifier for the student.
 * @returns {Promise<Array<object>>} A promise that resolves to an array of waiver objects.
 * Each object contains details about a waiver granted to the student.
 * @example
 * // Returns:
 * // [
 * //   { waiver_id: 1, student_id: 101, waiver_type: 'Prerequisite', note: 'Waived CSE 101 for transfer credit' },
 * //   { waiver_id: 2, student_id: 101, waiver_type: 'Time Conflict', note: 'Approved time conflict for MAT 125/PHY 131' }
 * // ]
 */
export async function getStudentWaivers(db, studentId) {
  const sql = `
    SELECT
      waiver_id,
      student_id,
      waiver_type,
      note
    FROM waivers
    WHERE student_id = $1
  `;
  const { rows } = await db.query(sql, [studentId]);
  return rows;
}

/**
 * Creates a new academic waiver for a student.
 *
 * @param {import('pg').Pool} db - The database connection pool object.
 * @param {object} waiver - The details of the waiver to be created.
 * @param {number} waiver.student_id - The ID of the student for whom the waiver is granted.
 * @param {string} waiver.waiver_type - The type of waiver (e.g., 'Prerequisite', 'Time Conflict', 'Degree Requirement').
 * @param {string} [waiver.note] - An optional note providing more details about the waiver.
 * @returns {Promise<object>} A promise that resolves to the newly created waiver object,
 * including its generated `waiver_id`.
 */
export async function createWaiver(db, waiver) {
  const { student_id, waiver_type, note } = waiver;
  const sql = `
    INSERT INTO waivers (student_id, waiver_type, note)
    VALUES ($1, $2, $3)
    RETURNING waiver_id, student_id, waiver_type, note
  `;
  const { rows } = await db.query(sql, [student_id, waiver_type, note]);
  return rows[0];
}

/**
 * Revokes (deletes) an existing academic waiver.
 *
 * @param {import('pg').Pool} db - The database connection pool object.
 * @param {number} waiverId - The unique identifier of the waiver to be revoked.
 * @returns {Promise<void>} A promise that resolves when the waiver has been successfully revoked.
 */
export async function revokeWaiver(db, waiverId) {
  const sql = `
    DELETE FROM waivers
    WHERE waiver_id = $1
  `;
  await db.query(sql, [waiverId]);
}
