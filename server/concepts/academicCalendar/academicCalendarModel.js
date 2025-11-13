/**
 * @file academicCalendarModel.js
 * @description Defines the data model for the Academic Calendar concept.
 */

/**
 * Imports an academic calendar from a YAML file.
 * @param {object} db - The database connection object.
 * @param {object} data - The parsed YAML data.
 * @returns {Promise<object>} - A promise that resolves to an object containing the import results.
 */
export async function importAcademicCalendar(db, data) {
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

  // Check if the term already exists
  const existsQuery = `
    SELECT id FROM academic_calendar
    WHERE (term->>'semester') = $1 AND (term->>'year') = $2
  `;
  const existsResult = await db.query(existsQuery, [term.semester, String(term.year)]);

  if (existsResult.rows.length > 0) {
    return { error: `Academic calendar for ${term.semester} ${term.year} already exists.` };
  }

  // Insert new record
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
