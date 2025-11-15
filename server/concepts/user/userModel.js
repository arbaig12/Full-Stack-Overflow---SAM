/**
 * @file userModel.js
 * @description This file defines the data model and database interactions for the User concept.
 * It includes functions for retrieving, searching, and importing user data (registrars, advisors, instructors, students).
 */

/**
 * Finds all users who have the 'Registrar' role.
 *
 * @param {import('pg').Pool} db - The database connection pool object.
 * @returns {Promise<Array<object>>} A promise that resolves to an array of registrar user objects.
 * Each object contains basic user information.
 */
export async function findRegistrars(db) {
  const sql = `
    SELECT user_id, sbu_id, first_name, last_name, email, role::text AS role
    FROM users
    WHERE lower(role::text) = lower($1)
    ORDER BY last_name, first_name
  `;
  const { rows } = await db.query(sql, ['Registrar']);
  return rows;
}

/**
 * Searches for users based on various criteria such as name, role, major, and minor.
 * This function constructs a dynamic SQL query to filter users.
 *
 * @param {import('pg').Pool} db - The database connection pool object.
 * @param {object} criteria - The search criteria.
 * @param {string} [criteria.name] - A name (first or last) to search for. Supports prefix matching (case-insensitive).
 * @param {string} [criteria.role] - The role of the user (e.g., 'Student', 'Registrar'). Case-insensitive.
 * @param {string} [criteria.major] - The major subject for student users (case-insensitive).
 * @param {string} [criteria.minor] - The minor subject for student users (case-insensitive).
 * @returns {Promise<Array<object>>} A promise that resolves to an array of user objects matching the criteria.
 */
export async function searchUsers(db, { name, role, major, minor }) {
  let params = [];
  let where = [];

  if (name) {
    params.push(`${name.toLowerCase()}%`);
    where.push(
      `(LOWER(first_name) LIKE $${params.length} OR LOWER(last_name) LIKE $${params.length})`
    );
  }

  if (role) {
    params.push(role);
    where.push(`LOWER(role::text) = LOWER($${params.length})`);
  }

  let baseSql = `
    SELECT
      u.user_id,
      u.sbu_id,
      u.first_name,
      u.last_name,
      u.email,
      u.role::text AS role
    FROM users u
  `;

  // If searching for students with major/minor, join with student_programs and programs tables
  if (
    role &&
    role.toLowerCase() === 'student' &&
    (major || minor)
  ) {
    baseSql = `
      SELECT DISTINCT
        u.user_id,
        u.sbu_id,
        u.first_name,
        u.last_name,
        u.email,
        u.role::text AS role
      FROM users u
      JOIN students s ON s.user_id = u.user_id
      LEFT JOIN student_programs sp ON sp.student_id = s.user_id
      LEFT JOIN programs p ON p.program_id = sp.program_id
    `;

    if (major) {
      params.push(major.toUpperCase());
      where.push(`p.subject = $${params.length}`);
    }

    if (minor) {
      params.push(minor.toUpperCase());
      where.push(`p.subject = $${params.length}`);
    }
  }

  if (where.length > 0) {
    baseSql += ` WHERE ` + where.join(' AND ');
  }

  baseSql += `
    ORDER BY u.last_name, u.first_name
  `;

  const { rows } = await db.query(baseSql, params);
  return rows;
}

/**
 * Finds a single user by their SBU ID.
 *
 * @param {import('pg').Pool} db - The database connection pool object.
 * @param {string} sbu_id - The SBU ID of the user to find.
 * @returns {Promise<object|null>} A promise that resolves to the user object if found, otherwise `null`.
 */
export async function findUserBySbuId(db, sbu_id) {
  const sql = `
    SELECT
      user_id,
      sbu_id,
      first_name,
      last_name,
      email,
      role::text AS role
    FROM users
    WHERE sbu_id = $1
  `;
  const { rows } = await db.query(sql, [sbu_id]);
  return rows[0] || null;
}

/**
 * Inserts a single user into the database.
 * This is an internal helper function used by `importUsers`.
 * It checks for existing users by SBU_ID to prevent duplicates.
 *
 * @param {import('pg').Pool} db - The database connection pool object.
 * @param {object} user - The user object containing details to insert.
 * @param {string} user.SBU_ID - The SBU ID of the user.
 * @param {string} user.first_name - The first name of the user.
 * @param {string} user.last_name - The last name of the user.
 * @param {string} user.email - The email address of the user.
 * @param {string} [user.university_entry] - The university entry term.
 * @param {boolean} [user.direct_admit] - Indicates if the student was a direct admit.
 * @param {string} [user.AOI] - Area of Interest for students.
 * @param {string} [user.college] - The college the user is affiliated with.
 * @param {string} role - The role of the user (e.g., 'Student', 'Registrar').
 * @returns {Promise<{userId: number}|{error: string}>} A promise that resolves to an object
 *   containing the `userId` of the inserted user, or an `error` message if the user already exists
 *   or required fields are missing.
 */
async function insertUser(db, user, role) {
  const { SBU_ID, first_name, last_name, email } = user;

  // Basic validation for required fields
  if (!SBU_ID || !email || !first_name || !last_name) {
    return { error: `Missing required fields for SBU_ID=${SBU_ID ?? '(none)'}` };
  }

  // Check if user with this SBU_ID already exists
  const check = await db.query(
    `SELECT user_id FROM users WHERE sbu_id = $1`,
    [SBU_ID]
  );

  if (check.rows.length > 0) {
    return { error: `User already exists: SBU_ID=${SBU_ID}` };
  }

  // Insert new user into the 'users' table
  const r = await db.query(
    `INSERT INTO users (sbu_id, first_name, last_name, email, role)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING user_id`,
    [SBU_ID, first_name, last_name, email, role]
  );

  return { userId: r.rows[0].user_id };
}

/**
 * Imports multiple users from a parsed YAML object.
 * This function iterates through different user roles provided in the YAML data
 * and attempts to insert each user, handling duplicates and collecting warnings.
 *
 * @param {import('pg').Pool} db - The database connection pool object.
 * @param {object} parsedYaml - The parsed YAML object containing arrays of users categorized by role.
 * @param {Array<object>} [parsedYaml.registrars] - Array of registrar user objects.
 * @param {Array<object>} [parsedYaml.academic_advisors] - Array of academic advisor user objects.
 * @param {Array<object>} [parsedYaml.instructors] - Array of instructor user objects.
 * @param {Array<object>} [parsedYaml.students] - Array of student user objects.
 * @returns {Promise<object>} A promise that resolves to an object summarizing the import results,
 *   including `inserted` count, `skipped` count, and an array of `warnings` for failed insertions.
 */
export async function importUsers(db, parsedYaml) {
  const {
    registrars = [],
    academic_advisors = [],
    instructors = [],
    students = []
  } = parsedYaml;

  const results = {
    inserted: 0,
    skipped: 0,
    warnings: [],
  };

  // Process Registrars
  for (const r of registrars) {
    const result = await insertUser(db, r, 'Registrar');
    if (result.error) {
      results.skipped++;
      results.warnings.push(result.error);
    } else {
      results.inserted++;
    }
  }
  // Process Academic Advisors
  for (const a of academic_advisors) {
    const result = await insertUser(db, a, 'Advisor');
    if (result.error) {
      results.skipped++;
      results.warnings.push(result.error);
    } else {
      results.inserted++;
    }
  }
  // Process Instructors
  for (const i of instructors) {
    const result = await insertUser(db, i, 'Instructor');
    if (result.error) {
      results.skipped++;
      results.warnings.push(result.error);
    } else {
      results.inserted++;
    }
  }
  // Process Students
  for (const s of students) {
    const result = await insertUser(db, s, 'Student');
    if (result.error) {
      results.skipped++;
      results.warnings.push(result.error);
    } else {
      results.inserted++;
      const userId = result.userId;

      // Handle student-specific data
      if (role === 'Student') {
        let universityEntrySemester = null;
        let universityEntryYear = null;
        if (s.university_entry) {
          const parts = s.university_entry.split(' ');
          if (parts.length === 2) {
            universityEntrySemester = parts[0];
            universityEntryYear = parseInt(parts[1], 10);
          }
        }

        let aoiProgramId = null;
        if (s.AOI) {
          const programResult = await db.query(
            `SELECT program_id FROM programs WHERE subject = $1 AND program_type = 'AOI'`,
            [s.AOI]
          );
          if (programResult.rows.length > 0) {
            aoiProgramId = programResult.rows[0].program_id;
          } else {
            results.warnings.push(`AOI program not found for: ${s.AOI}`);
          }
        }

        let collegeId = null;
        if (s.college) {
          const collegeResult = await db.query(
            `SELECT college_id FROM colleges WHERE code = $1`,
            [s.college]
          );
          if (collegeResult.rows.length > 0) {
            collegeId = collegeResult.rows[0].college_id;
          } else {
            results.warnings.push(`College not found for code: ${s.college}`);
          }
        }

        await db.query(
          `INSERT INTO students (user_id, university_entry_semester, university_entry_year, direct_admit, aoi_program_id, college_id)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [userId, universityEntrySemester, universityEntryYear, s.direct_admit, aoiProgramId, collegeId]
        );
      }

      // Handle student programs (majors, minors)
      if (s.majors) {
        for (let i = 0; i < s.majors.length; i++) {
          const major = s.majors[i];
          const degree = s.degrees[i];
          const version = s.major_requirement_versions[i];
          // Assuming a programs table exists and contains program definitions
          const programResult = await db.query(
            `SELECT program_id FROM programs WHERE subject = $1 AND degree_type = $2 AND program_type = 'Major'`,
            [major, degree]
          );
          if (programResult.rows.length > 0) {
            const programId = programResult.rows[0].program_id;
            await db.query(
              `INSERT INTO student_programs (student_id, program_id, kind, major_requirement_version)
               VALUES ($1, $2, $3, $4)`,
              [userId, programId, 'Major', JSON.stringify(version)]
            );
          } else {
            results.warnings.push(`Program not found for major: ${major} ${degree}`);
          }
        }
      }
      if (s.minors) {
        for (let i = 0; i < s.minors.length; i++) {
          const minor = s.minors[i];
          const version = s.minor_requirement_versions[i];
          const programResult = await db.query(
            `SELECT program_id FROM programs WHERE subject = $1 AND program_type = 'Minor'`,
            [minor]
          );
          if (programResult.rows.length > 0) {
            const programId = programResult.rows[0].program_id;
            await db.query(
              `INSERT INTO student_programs (student_id, program_id, kind, major_requirement_version)
               VALUES ($1, $2, $3, $4)`,
              [userId, programId, 'Minor', JSON.stringify(version)]
            );
          } else {
            results.warnings.push(`Program not found for minor: ${minor}`);
          }
        }
      }
    }
  }
  return results;
}
