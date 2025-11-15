/**
 * @file classScheduleModel.js
 * @description This file defines the data model and database interactions for the Class Schedule concept.
 * It includes functions for importing, editing, and searching class schedule data.
 */

/**
 * SQL Table Schema for class_schedule:
 *
 * CREATE TABLE class_schedule (
 *   id SERIAL PRIMARY KEY,
 *   term JSONB NOT NULL, -- { semester: 'Fall', year: 2025 }
 *   class_data JSONB NOT NULL, -- Array of class objects
 *   created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
 *   updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
 * );
 *
 * Example class_data structure:
 * [
 *   {
 *     course_ref: { subject: 'CSE', number: 416 },
 *     section_num: '01',
 *     instructor: 'John Doe',
 *     meetings: [{ day: 'Mon', start: '10:00', end: '10:50', room_id: 'LGT-101' }],
 *     capacity: 120,
 *     room_id: 'LGT-101'
 *   }
 * ]
 */

/**
 * Imports a new class schedule for a specific term into the database.
 * If a schedule for the same term already exists, it will be replaced.
 *
 * @param {import('pg').Pool} db - The database connection pool object.
 * @param {{semester: string, year: number}} term - The term for which the schedule is being imported.
 * @param {Array<object>} classes - An array of class objects to be imported.
 * @param {object} roomCapacities - A mapping from room_id to its capacity.
 * @returns {Promise<{term: {semester: string, year: number}, importedCount: number}|{error: string}>}
 */
export async function importClassSchedule(db, term, classes, roomCapacities) {
  if (!term || !term.semester || !term.year) {
    return { error: "Term must include semester and year." };
  }
  if (!Array.isArray(classes)) {
    return { error: "Classes must be an array." };
  }

  try {
    await db.query('BEGIN');

    // Drop old data for that term
    const deleteQuery = `
      DELETE FROM class_schedule
      WHERE (term->>'semester') = $1 AND (term->>'year')::int = $2;
    `;
    await db.query(deleteQuery, [term.semester, term.year]);

    // Prepare class data, setting capacity
    const classesWithCapacity = classes.map(cls => {
      const capacity = roomCapacities[cls.room_id] || 20; // Default to 20 if room_id not found
      return { ...cls, capacity };
    });

    const insertQuery = `
      INSERT INTO class_schedule (term, class_data)
      VALUES ($1::jsonb, $2::jsonb)
      RETURNING id;
    `;
    const result = await db.query(insertQuery, [JSON.stringify(term), JSON.stringify(classesWithCapacity)]);

    await db.query('COMMIT');
    return { term, importedCount: classesWithCapacity.length };
  } catch (error) {
    await db.query('ROLLBACK');
    console.error('Error importing class schedule:', error);
    return { error: 'Failed to import class schedule due to a database error.' };
  }
}

/**
 * Edits the capacity for a specific class within a term's schedule.
 *
 * @param {import('pg').Pool} db - The database connection pool object.
 * @param {{semester: string, year: number}} term - The term of the class.
 * @param {string} courseSubject - The subject of the course (e.g., 'CSE').
 * @param {number} courseNumber - The number of the course (e.g., 416).
 * @param {string} sectionNum - The section number of the class (e.g., '01').
 * @param {number} newCapacity - The new capacity for the class.
 * @returns {Promise<{success: boolean, message?: string}|{error: string}>}
 */
export async function editClassCapacity(db, term, courseSubject, courseNumber, sectionNum, newCapacity) {
  if (!term || !term.semester || !term.year) {
    return { error: "Term must include semester and year." };
  }
  if (typeof newCapacity !== 'number' || newCapacity < 0) {
    return { error: "New capacity must be a non-negative number." };
  }

  try {
    const updateQuery = `
      UPDATE class_schedule
      SET
        class_data = (
          SELECT jsonb_agg(
            CASE
              WHEN (elem->'course_ref'->>'subject' = $4 AND (elem->'course_ref'->>'number')::int = $5 AND elem->>'section_num' = $6)
              THEN jsonb_set(elem, '{capacity}', $7::jsonb)
              ELSE elem
            END
          )
          FROM jsonb_array_elements(class_data) AS elem
        ),
        updated_at = CURRENT_TIMESTAMP
      WHERE (term->>'semester') = $1 AND (term->>'year')::int = $2
      RETURNING id;
    `;
    const result = await db.query(updateQuery, [
      term.semester,
      term.year,
      newCapacity, // This is $3 in the jsonb_set, but $3 is not used in the outer query.
      courseSubject,
      courseNumber,
      sectionNum,
      newCapacity // This is $7 in the jsonb_set
    ]);

    if (result.rows.length === 0) {
      return { success: false, message: "Class schedule for the specified term not found, or class not updated." };
    }
    return { success: true, message: "Class capacity updated successfully." };
  } catch (error) {
    console.error('Error editing class capacity:', error);
    return { error: 'Failed to edit class capacity due to a database error.' };
  }
}

/**
 * Searches the class schedule based on various criteria.
 *
 * @param {import('pg').Pool} db - The database connection pool object.
 * @param {{semester: string, year: number}} term - The term to search within.
 * @param {object} filters - An object containing search filters (e.g., subject, day, instructor).
 * @returns {Promise<{classes: Array<object>}|{error: string}>}
 */
export async function searchClassSchedule(db, term, filters) {
  if (!term || !term.semester || !term.year) {
    return { error: "Term must include semester and year." };
  }

  try {
    let query = `
      SELECT class_data
      FROM class_schedule
      WHERE (term->>'semester') = $1 AND (term->>'year')::int = $2;
    `;
    const result = await db.query(query, [term.semester, term.year]);

    if (result.rows.length === 0) {
      return { classes: [] };
    }

    let allClasses = result.rows[0].class_data;

    // Apply filters
    if (filters) {
      if (filters.subject) {
        allClasses = allClasses.filter(cls => cls.course_ref && cls.course_ref.subject && cls.course_ref.subject.toLowerCase() === filters.subject.toLowerCase());
      }
      if (filters.number) {
        allClasses = allClasses.filter(cls => cls.course_ref && cls.course_ref.number && cls.course_ref.number === filters.number);
      }
      if (filters.instructor) {
        allClasses = allClasses.filter(cls => cls.instructor && cls.instructor.toLowerCase().includes(filters.instructor.toLowerCase()));
      }
      if (filters.day) {
        allClasses = allClasses.filter(cls => cls.meetings && cls.meetings.some(meeting => meeting.day && meeting.day.toLowerCase() === filters.day.toLowerCase()));
      }
      // Add more filters as needed (e.g., time, room_id)
    }

    return { classes: allClasses };
  } catch (error) {
    console.error('Error searching class schedule:', error);
    return { error: 'Failed to search class schedule due to a database error.' };
  }
}
