/**
 * @file academicCalendarModel.js
 * @description This file defines the data model and database interactions for the Academic Calendar concept.
 * It includes functions for importing and managing academic calendar data.
 */

/**
 * Imports a new academic calendar for a specific term into the database from parsed YAML data.
 *
 * This function enforces the business rule that a calendar for a given term can only be imported once.
 * It checks for the existence of the term before attempting to insert the new calendar data.
 *
 * @param {import('pg').Pool} db - The database connection pool object.
 * @param {object} data - The parsed YAML data representing the academic calendar.
 * @param {object} data.academic_calendar - The main calendar object.
 * @param {{semester: string, year: number}} data.academic_calendar.term - The term for the calendar.
 * @param {string} [data.academic_calendar.major_and_minor_changes_end] - The deadline for major/minor changes.
 * @param {string} [data.academic_calendar.waitlist] - The date waitlists are purged.
 * @param {string} [data.academic_calendar.waitlist_process_ends] - The date the waitlist process ends.
 * @param {string} [data.academic_calendar.late_registration_ends] - The deadline for late registration.
 * @param {string} [data.academic_calendar.GPNC_selection_ends] - The deadline for GPNC selection.
 * @param {string} [data.academic_calendar.course_withdrawal_ends] - The deadline for course withdrawal.
 * @param {string} [data.academic_calendar.major_and_minor_changes_begin] - The start date for major/minor changes.
 * @param {string} [data.academic_calendar.advanced_registration_begins] - The start date for advanced registration.
 * @param {string} [data.academic_calendar.semester_end] - The end date of the semester.
 * @returns {Promise<{id: number, term: {semester: string, year: number}}|{error: string}>} A promise that resolves to an object containing the new calendar's ID and term if successful, or an error object if validation fails or the term already exists.
 */
export async function importAcademicCalendar(db, data) {
  // Validate the basic structure of the input data
  if (!data.academic_calendar || !data.academic_calendar.term) {
    return { error: "YAML must include academic_calendar with a term field" };
  }

  const {
    term,
    major_and_minor_changes_end,
    waitlist,
    waitlist_process_ends,
    late_registration_ends,
    GPNC_selection_ends,
    course_withdrawal_ends,
    major_and_minor_changes_begin,
    advanced_registration_begins,
    semester_end,
  } = data.academic_calendar;

  if (!term.semester || !term.year) {
    return { error: "Term must include semester and year" };
  }

  // Business Rule: Prohibit changes by allowing import at most once.
  // Check if a calendar for this term already exists in the database.
  const existsQuery = `
    SELECT id FROM academic_calendar
    WHERE (term->>'semester') = $1 AND (term->>'year') = $2
  `;
  const existsResult = await db.query(existsQuery, [term.semester, String(term.year)]);

  if (existsResult.rows.length > 0) {
    return { error: `Academic calendar for ${term.semester} ${term.year} already exists.` };
  }

  // If no existing calendar is found, insert the new record.
  const insertQuery = `
    INSERT INTO academic_calendar (
      term,
      major_and_minor_changes_end,
      waitlist,
      waitlist_process_ends,
      late_registration_ends,
      GPNC_selection_ends,
      course_withdrawal_ends,
      major_and_minor_changes_begin,
      advanced_registration_begins,
      semester_end
    )
    VALUES (
      $1::jsonb,
      $2, $3, $4, $5, $6, $7, $8, $9, $10
    )
    RETURNING id
  `;

  const values = [
    JSON.stringify(term),
    major_and_minor_changes_end || null,
    waitlist || null,
    waitlist_process_ends || null,
    late_registration_ends || null,
    GPNC_selection_ends || null,
    course_withdrawal_ends || null,
    major_and_minor_changes_begin || null,
    advanced_registration_begins || null,
    semester_end || null,
  ];

  const result = await db.query(insertQuery, values);

  return { id: result.rows[0].id, term };
}
