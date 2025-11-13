/**
 * @file waitlistModel.js
 * @description This file defines the data model and database interactions for the Waitlist concept.
 * It includes functions for adding students to a waitlist, removing them, and retrieving waitlist information.
 */

/**
 * Adds a student to a class's waitlist.
 *
 * @param {import('pg').Pool} db - The database connection pool object.
 * @param {number} studentUserId - The ID of the student to add.
 * @param {number} classSectionId - The ID of the class section.
 * @returns {Promise<object>} A promise that resolves to the new waitlist entry.
 */
export async function addToWaitlist(db, studentUserId, classSectionId) {
  // Determine the next position in the waitlist for this class
  const { rows: [{ next_position }] } = await db.query(
    `SELECT COALESCE(MAX(position), 0) + 1 AS next_position FROM waitlist_entries WHERE class_section_id = $1`,
    [classSectionId]
  );

  const sql = `
    INSERT INTO waitlist_entries (student_user_id, class_section_id, position)
    VALUES ($1, $2, $3)
    RETURNING waitlist_entry_id, student_user_id, class_section_id, position, joined_at
  `;
  const { rows } = await db.query(sql, [studentUserId, classSectionId, next_position]);
  return rows[0];
}

/**
 * Removes a student from a class's waitlist.
 *
 * @param {import('pg').Pool} db - The database connection pool object.
 * @param {number} waitlistEntryId - The ID of the waitlist entry to remove.
 * @returns {Promise<void>}
 */
export async function removeFromWaitlist(db, waitlistEntryId) {
  const sql = `
    DELETE FROM waitlist_entries
    WHERE waitlist_entry_id = $1
  `;
  await db.query(sql, [waitlistEntryId]);
}

/**
 * Retrieves the entire waitlist for a specific class section, ordered by position.
 *
 * @param {import('pg').Pool} db - The database connection pool object.
 * @param {number} classSectionId - The ID of the class section.
 * @returns {Promise<Array<object>>} A promise that resolves to an array of waitlist entries.
 */
export async function getWaitlistByClass(db, classSectionId) {
  const sql = `
    SELECT
      w.waitlist_entry_id,
      w.student_user_id,
      u.first_name,
      u.last_name,
      w.class_section_id,
      w.position,
      w.joined_at
    FROM waitlist_entries w
    JOIN users u ON w.student_user_id = u.user_id
    WHERE w.class_section_id = $1
    ORDER BY w.position ASC
  `;
  const { rows } = await db.query(sql, [classSectionId]);
  return rows;
}

/**
 * Retrieves the student at the top of the waitlist for a specific class section.
 *
 * @param {import('pg').Pool} db - The database connection pool object.
 * @param {number} classSectionId - The ID of the class section.
 * @returns {Promise<object|null>} A promise that resolves to the top waitlist entry, or null if the waitlist is empty.
 */
export async function getNextStudentOnWaitlist(db, classSectionId) {
  const sql = `
    SELECT
      waitlist_entry_id,
      student_user_id,
      class_section_id,
      position,
      joined_at
    FROM waitlist_entries
    WHERE class_section_id = $1
    ORDER BY position ASC
    LIMIT 1
  `;
  const { rows } = await db.query(sql, [classSectionId]);
  return rows[0] || null;
}
