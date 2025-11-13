/**
 * @file registrationHoldModel.js
 * @description Defines the data model for the Registration Hold concept.
 */

/**
 * Retrieves all registration holds for a student.
 * @param {object} db - The database connection object.
 * @param {number} studentId - The ID of the student to retrieve the holds for.
 * @returns {Promise<Array>} - A promise that resolves to an array of registration hold objects.
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
 * Places a registration hold on a student's account.
 * @param {object} db - The database connection object.
 * @param {object} hold - The hold object to create.
 * @returns {Promise<object>} - A promise that resolves to the newly created registration hold object.
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
 * Removes a registration hold from a student's account.
 * @param {object} db - The database connection object.
 * @param {number} holdId - The ID of the hold to remove.
 * @returns {Promise<void>}
 */
export async function removeHold(db, holdId) {
  const sql = `
    DELETE FROM registration_holds
    WHERE hold_id = $1
  `;
  await db.query(sql, [holdId]);
}
