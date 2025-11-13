/**
 * @file userModel.js
 * @description Defines the data model for the User concept.
 */

/**
 * Finds all users with the role 'Registrar'.
 * @param {object} db - The database connection object.
 * @returns {Promise<Array>} - A promise that resolves to an array of registrar user objects.
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
 * Searches for users based on the provided criteria.
 * @param {object} db - The database connection object.
 * @param {object} criteria - The search criteria.
 * @param {string} criteria.name - The name to search for (prefix match).
 * @param {string} criteria.role - The role to search for.
 * @param {string} criteria.major - The major to search for.
 * @param {string} criteria.minor - The minor to search for.
 * @returns {Promise<Array>} - A promise that resolves to an array of user objects.
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
 * Finds a user by their SBU ID.
 * @param {object} db - The database connection object.
 * @param {string} sbu_id - The SBU ID of the user to find.
 * @returns {Promise<object|null>} - A promise that resolves to the user object, or null if not found.
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
 * Inserts a user into the database.
 * @param {object} db - The database connection object.
 * @param {object} user - The user object to insert.
 * @param {string} role - The role of the user.
 * @returns {Promise<number|null>} - A promise that resolves to the user_id of the inserted user, or null if skipped.
 */
async function insertUser(db, user, role) {
  const { SBU_ID, first_name, last_name, email, university_entry, direct_admit, AOI, college } = user;

  if (!SBU_ID || !email || !first_name || !last_name) {
    return { error: `Missing fields for SBU_ID=${SBU_ID ?? '(none)'}` };
  }

  // Check for existing
  const check = await db.query(
    `SELECT user_id FROM users WHERE sbu_id = $1`,
    [SBU_ID]
  );

  if (check.rows.length > 0) {
    return { error: `User already exists: SBU_ID=${SBU_ID}` };
  }

  // Insert user
  const r = await db.query(
    `INSERT INTO users (sbu_id, first_name, last_name, email, role, university_entry, direct_admit, aoi, college)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING user_id`,
    [SBU_ID, first_name, last_name, email, role, university_entry, direct_admit, AOI, college]
  );

  return { userId: r.rows[0].user_id };
}

/**
 * Imports users from a YAML file.
 * @param {object} db - The database connection object.
 * @param {object} parsedYaml - The parsed YAML object.
 * @returns {Promise<object>} - A promise that resolves to an object containing the import results.
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

  for (const r of registrars) {
    const result = await insertUser(db, r, 'Registrar');
    if (result.error) {
      results.skipped++;
      results.warnings.push(result.error);
    } else {
      results.inserted++;
    }
  }
  for (const a of academic_advisors) {
    const result = await insertUser(db, a, 'Advisor');
    if (result.error) {
      results.skipped++;
      results.warnings.push(result.error);
    } else {
      results.inserted++;
    }
  }
  for (const i of instructors) {
    const result = await insertUser(db, i, 'Instructor');
    if (result.error) {
      results.skipped++;
      results.warnings.push(result.error);
    } else {
      results.inserted++;
    }
  }
  for (const s of students) {
    const result = await insertUser(db, s, 'Student');
    if (result.error) {
      results.skipped++;
      results.warnings.push(result.error);
    } else {
      results.inserted++;
      const userId = result.userId;

      // Handle majors, minors, etc.
      if (s.majors) {
        for (let i = 0; i < s.majors.length; i++) {
          const major = s.majors[i];
          const degree = s.degrees[i];
          const version = s.major_requirement_versions[i];
          // Assuming a programs table exists
          const programResult = await db.query(
            `SELECT program_id FROM programs WHERE subject = $1 AND degree_type = $2 AND program_type = 'Major'`,
            [major, degree]
          );
          if (programResult.rows.length > 0) {
            const programId = programResult.rows[0].program_id;
            await db.query(
              `INSERT INTO student_programs (student_id, program_id, major_requirement_version)
               VALUES ($1, $2, $3)`,
              [userId, programId, JSON.stringify(version)]
            );
          } else {
            results.warnings.push(`Program not found for major: ${major} ${degree}`);
          }
        }
      }
      // Similar logic for minors, planned_majors, planned_minors, transfer_courses, and classes
    }
  }

  return results;
}
