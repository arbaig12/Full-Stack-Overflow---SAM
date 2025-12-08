/**
 * @file userRoutes.js
 * @description Express routes for searching and exporting users in SAM.
 * Implements assignment Section 2:
 *   2.1 (handled in importRoutes.js)
 *   2.2 Search users
 *   2.3 Export selected user data as YAML
 */

import { Router } from 'express';
import yaml from 'js-yaml';

const router = Router();

/**
 * GET /registrars
 * Returns all users with role registrar.
 *
 * @route GET /registrars
 * @returns {Object} 200 - List of registrar user objects
 * @returns {Object} 500 - Query failure
 */
router.get('/registrars', async (req, res) => {
  try {
    const sql = `
      SELECT
        u.user_id,
        u.sbu_id,
        u.first_name,
        u.last_name,
        u.email,
        u.role::text AS role,
        'active' AS status
      FROM users u
      WHERE lower(u.role::text) = lower($1)
      ORDER BY u.last_name, u.first_name
    `;
    const r = await req.db.query(sql, ['Registrar']);

    const registrars = r.rows.map((u) => ({
      id: u.sbu_id ?? String(u.user_id),
      name: `${u.first_name} ${u.last_name}`,
      email: u.email,
      role: 'registrar',
      status: u.status,                
      lastLogin: null,
      department: 'Administration',
    }));

    return res.json({ ok: true, users: registrars });
  } catch (e) {
    console.error('[users] /registrars failed:', e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * GET /search
 * Search users by:
 *   - name (searches first_name and last_name, supports last name specifically)
 *   - role
 *   - (If student) optional major/minor
 *
 * @route GET /search
 * @returns {Object} 200 - Search results
 * @returns {Object} 500 - Query failure
 */
router.get('/search', async (req, res) => {
  try {
    const { name, role, major, minor } = req.query;

    let params = [];
    let where = [];
    let baseSql = '';

    // Name search: supports searching by first name, last name, or both
    // If name contains a space, treat as "first last", otherwise search both
    if (name) {
      const nameLower = name.toLowerCase().trim();
      if (nameLower.includes(' ')) {
        // If space found, split and search first and last name separately
        const parts = nameLower.split(/\s+/);
        if (parts.length >= 2) {
          params.push(`${parts[0]}%`);
          params.push(`${parts[parts.length - 1]}%`);
          where.push(
            `(LOWER(first_name) LIKE $${params.length - 1} AND LOWER(last_name) LIKE $${params.length})`
          );
        } else {
          // Single word with space, search both fields
          params.push(`${nameLower}%`);
          where.push(
            `(LOWER(first_name) LIKE $${params.length} OR LOWER(last_name) LIKE $${params.length})`
          );
        }
      } else {
        // Single word: search both first and last name
        params.push(`${nameLower}%`);
        where.push(
          `(LOWER(first_name) LIKE $${params.length} OR LOWER(last_name) LIKE $${params.length})`
        );
      }
    }

    // Handle major/minor search for students
    // When both are specified, find students who have BOTH a major matching major AND a minor matching minor
    const isStudentMajorMinorSearch = 
      role &&
      role.toLowerCase() === 'student' &&
      (major || minor);

    // Add role filter only if not doing student major/minor search (which already filters by student role)
    if (role && !isStudentMajorMinorSearch) {
      params.push(role);
      where.push(`LOWER(u.role::text) = LOWER($${params.length})`);
    }

    // Initialize baseSql - default to basic user query
    baseSql = `
      SELECT
        u.user_id,
        u.sbu_id,
        u.first_name,
        u.last_name,
        u.email,
        u.role::text AS role
      FROM users u
    `;

    // Handle major/minor search for students
    if (isStudentMajorMinorSearch) {
      // Extract subject from program code (format: "SUBJECT-DEGREE" or "SUBJECT-Minor")
      // Also check department code as fallback
      if (major && minor) {
        // Both major and minor: use subqueries to find students with both
        params.push(major.toUpperCase());
        params.push(minor.toUpperCase());
        
        const majorSubjectParam = params.length - 1;
        const minorSubjectParam = params.length;

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
          WHERE LOWER(u.role::text) = 'student'
            AND EXISTS (
              -- Student has a MAJOR program matching the major subject
              SELECT 1
              FROM student_programs sp_major
              JOIN programs p_major ON p_major.program_id = sp_major.program_id
              LEFT JOIN departments d_major ON d_major.department_id = p_major.department_id
              WHERE sp_major.student_id = s.user_id
                AND p_major.type = 'MAJOR'
                AND (
                  SPLIT_PART(p_major.code, '-', 1) = $${majorSubjectParam}
                  OR d_major.code = $${majorSubjectParam}
                )
            )
            AND EXISTS (
              -- Student has a MINOR program matching the minor subject
              SELECT 1
              FROM student_programs sp_minor
              JOIN programs p_minor ON p_minor.program_id = sp_minor.program_id
              LEFT JOIN departments d_minor ON d_minor.department_id = p_minor.department_id
              WHERE sp_minor.student_id = s.user_id
                AND p_minor.type = 'MINOR'
                AND (
                  SPLIT_PART(p_minor.code, '-', 1) = $${minorSubjectParam}
                  OR d_minor.code = $${minorSubjectParam}
                )
            )
        `;
      } else if (major) {
        // Only major specified
        params.push(major.toUpperCase());
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
          JOIN student_programs sp ON sp.student_id = s.user_id
          JOIN programs p ON p.program_id = sp.program_id
          LEFT JOIN departments d ON d.department_id = p.department_id
          WHERE LOWER(u.role::text) = 'student'
            AND p.type = 'MAJOR'
            AND (
              SPLIT_PART(p.code, '-', 1) = $${params.length}
              OR d.code = $${params.length}
            )
        `;
      } else if (minor) {
        // Only minor specified
        params.push(minor.toUpperCase());
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
          JOIN student_programs sp ON sp.student_id = s.user_id
          JOIN programs p ON p.program_id = sp.program_id
          LEFT JOIN departments d ON d.department_id = p.department_id
          WHERE LOWER(u.role::text) = 'student'
            AND p.type = 'MINOR'
            AND (
              SPLIT_PART(p.code, '-', 1) = $${params.length}
              OR d.code = $${params.length}
            )
        `;
      } else {
        // No major/minor, just role filter
        baseSql = `
          SELECT
            u.user_id,
            u.sbu_id,
            u.first_name,
            u.last_name,
            u.email,
            u.role::text AS role
          FROM users u
        `;
      }
    } else {
      // No major/minor search needed
      baseSql = `
        SELECT
          u.user_id,
          u.sbu_id,
          u.first_name,
          u.last_name,
          u.email,
          u.role::text AS role
        FROM users u
      `;
    }

    // Add WHERE clause conditions
    if (where.length > 0) {
      // If baseSql already has WHERE (from major/minor logic), use AND
      if (baseSql.includes('WHERE')) {
        baseSql += ` AND ` + where.join(' AND ');
      } else {
        baseSql += ` WHERE ` + where.join(' AND ');
      }
    }

    baseSql += `
      ORDER BY u.last_name, u.first_name
    `;

    // Safety check: ensure baseSql is defined
    if (!baseSql || baseSql.trim() === '') {
      console.error('[users] /search: baseSql is empty or undefined', { name, role, major, minor, isStudentMajorMinorSearch });
      return res.status(500).json({ ok: false, error: 'Search query construction failed' });
    }

    const result = await req.db.query(baseSql, params);

    const users = result.rows.map((u) => ({
      id: u.sbu_id ?? String(u.user_id),
      userId: u.user_id, // Include user_id for API calls
      name: `${u.first_name} ${u.last_name}`,
      email: u.email,
      role: u.role.toLowerCase(),
    }));

    return res.json({
      ok: true,
      count: users.length,
      users,
      appliedFilters: {
        name: name ?? null,
        role: role ?? null,
        major: major ?? null,
        minor: minor ?? null,
      },
    });
  } catch (e) {
    console.error('[users] /search failed:', e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * GET /:sbu_id/export
 * Exports a YAML file describing the selected user.
 *
 * Implements Section 2.3:
 *   "A registrar can download a yaml file, in the format defined by users1.yaml,
 *    containing data about a selected user."
 *
 * Behavior:
 *   - Looks up the user by SBU ID
 *   - Outputs only user fields (no schedule imports, etc.)
 *   - If user does not exist → 404
 *
 * @route GET /:sbu_id/export
 * @returns {YAML} 200 - YAML describing user
 * @returns {Object} 404 - User not found
 * @returns {Object} 500 - Query failure
 */
router.get('/:sbu_id/export', async (req, res) => {
  try {
    const { sbu_id } = req.params;

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
    const result = await req.db.query(sql, [sbu_id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }

    const u = result.rows[0];

    // Format matching users1.yaml structure
    const yamlObj = {
      users: [
        {
          sbu_id: u.sbu_id,
          first_name: u.first_name,
          last_name: u.last_name,
          email: u.email,
          role: u.role.toLowerCase(),
        }
      ]
    };

    const yamlText = yaml.dump(yamlObj);

    res.setHeader('Content-Type', 'application/x-yaml');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="user_${u.sbu_id}.yaml"`
    );

    return res.status(200).send(yamlText);
  } catch (e) {
    console.error('[users] /export failed:', e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

router.get('/students', async (req, res) => {
  try {
    const sql = `
      SELECT
        u.user_id,
        u.sbu_id,
        u.first_name,
        u.last_name,
        u.email,
        u.role::text AS role,
        'active' AS status,
        s.user_id         AS student_user_id,
        s.standing::text  AS standing,              -- enum -> text
        d.name            AS department_name
      FROM users u
      LEFT JOIN students s
        ON s.user_id = u.user_id
      /* most recently declared program for this student */
      LEFT JOIN LATERAL (
        SELECT sp.program_id
        FROM student_programs sp
        WHERE sp.student_id = s.user_id           -- FK points to students.user_id
        ORDER BY sp.declared_at DESC NULLS LAST, sp.program_id
        LIMIT 1
      ) sp ON true
      LEFT JOIN programs p
        ON p.program_id = sp.program_id
      LEFT JOIN departments d
        ON d.department_id = p.department_id
      WHERE lower(u.role::text) = 'student'
      ORDER BY u.last_name, u.first_name
    `;
    const r = await req.db.query(sql);

    const students = r.rows.map(u => ({
      id: u.sbu_id ?? String(u.user_id),
      userId: u.user_id, // Include user_id for API calls
      name: `${u.first_name} ${u.last_name}`,
      email: u.email,
      role: 'student',
      status: u.status,
      lastLogin: null,
      department: u.department_name ?? null,
      classStanding: u.standing ?? null,          
    }));

    res.json({ ok: true, users: students });
  } catch (e) {
    console.error('[users] /students failed:', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.get('/instructors', async (req, res) => {
  try {
    const sql = `
      SELECT
        u.user_id,
        u.sbu_id,
        u.first_name,
        u.last_name,
        u.email,
        u.role::text AS role,
        'active' AS status,
        i.department_id,
        d.name AS department_name,
        -- distinct list like 'CSE214', 'CSE101'
        ARRAY_REMOVE(ARRAY_AGG(DISTINCT (c.subject || c.course_num)) 
                     FILTER (WHERE c.course_id IS NOT NULL), NULL) AS courses
      FROM users u
      LEFT JOIN instructors i       ON i.user_id = u.user_id
      LEFT JOIN departments d       ON d.department_id = i.department_id
      LEFT JOIN class_sections cs   ON cs.instructor_id = u.user_id
      LEFT JOIN courses c           ON c.course_id = cs.course_id
      WHERE lower(u.role::text) = 'instructor'
      GROUP BY
        u.user_id, u.sbu_id, u.first_name, u.last_name, u.email,
        u.role, i.department_id, d.name
      ORDER BY u.last_name, u.first_name
    `;
    const r = await req.db.query(sql);

    const instructors = r.rows.map(u => ({
      id: u.sbu_id ?? String(u.user_id),
      name: `${u.first_name} ${u.last_name}`,
      email: u.email,
      role: 'instructor',
      status: u.status,
      lastLogin: null,
      department: u.department_name ?? null,
      courses: Array.isArray(u.courses) ? u.courses.filter(Boolean) : []
    }));

    res.json({ ok: true, users: instructors });
  } catch (e) {
    console.error('[users] /instructors failed:', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.get('/advisors', async (req, res) => {
  try {
    // Simplified query - just get users with advisor role
    // We'll add advisor-specific details later if the tables exist
    const sql = `
      SELECT
        u.user_id,
        u.sbu_id,
        u.first_name,
        u.last_name,
        u.email,
        u.role::text AS role,
        'active' AS status
      FROM users u
      WHERE lower(u.role::text) = lower($1)
      ORDER BY u.last_name, u.first_name
    `;

    const r = await req.db.query(sql, ['Advisor']);

    const advisors = r.rows.map(row => ({
      id: row.sbu_id ?? String(row.user_id),
      name: `${row.first_name} ${row.last_name}`,
      email: row.email,
      role: 'advisor',
      status: row.status,
      lastLogin: null,
      department: null,  // Will be populated when advisor tables are set up
      advisees: 0  // Will be populated when advisor tables are set up
    }));

    res.json({ ok: true, users: advisors });
  } catch (e) {
    console.error('[users] /advisors failed:', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});


/**
 * DELETE /api/user-management/users
 * Delete all users from the database.
 * WARNING: This is a destructive operation for demo/testing purposes only.
 * Also deletes related data: advisors, student_programs, enrollments, etc.
 * 
 * @route DELETE /users
 * @returns {Object} 200 - Success message with count of deleted users
 * @returns {Object} 500 - Query failure
 */
router.delete('/users', async (req, res) => {
  try {
    const db = req.db;
    
    console.log('[user-management] DELETE /users - Starting deletion...');
    
    // Get count before deletion for response
    const countResult = await db.query('SELECT COUNT(*) as count FROM users');
    const count = parseInt(countResult.rows[0]?.count) || 0;
    
    console.log(`[user-management] DELETE /users - Found ${count} users to delete`);
    
    if (count === 0) {
      return res.json({
        ok: true,
        message: 'No users to delete.',
        deleted: 0,
      });
    }

    // Delete related records first to avoid foreign key constraint violations
    // Delete in order of dependency
    
    // Delete audit logs first (references users via performed_by)
    try {
      await db.query('DELETE FROM audit_log');
      console.log('[user-management] DELETE /users - Deleted audit_log entries');
    } catch (err) {
      console.log('[user-management] DELETE /users - audit_log table may not exist:', err.message);
    }
    
    // Delete advisor metadata
    try {
      await db.query('DELETE FROM advisors');
      console.log('[user-management] DELETE /users - Deleted advisors table entries');
    } catch (err) {
      console.log('[user-management] DELETE /users - Advisors table may not exist:', err.message);
    }
    
    // Delete student programs (majors/minors)
    try {
      await db.query('DELETE FROM student_programs');
      console.log('[user-management] DELETE /users - Deleted student_programs');
    } catch (err) {
      console.log('[user-management] DELETE /users - student_programs table may not exist:', err.message);
    }
    
    // Delete enrollments
    try {
      await db.query('DELETE FROM enrollments');
      console.log('[user-management] DELETE /users - Deleted enrollments');
    } catch (err) {
      console.log('[user-management] DELETE /users - enrollments table may not exist:', err.message);
    }
    
    // Delete registration holds
    try {
      await db.query('DELETE FROM registration_holds');
      console.log('[user-management] DELETE /users - Deleted registration_holds');
    } catch (err) {
      console.log('[user-management] DELETE /users - registration_holds table may not exist:', err.message);
    }
    
    // Delete waivers
    try {
      await db.query('DELETE FROM waivers');
      console.log('[user-management] DELETE /users - Deleted waivers');
    } catch (err) {
      console.log('[user-management] DELETE /users - waivers table may not exist:', err.message);
    }
    
    // Delete audit logs (optional - you might want to keep these)
    // Uncomment if you want to delete audit logs too:
    // try {
    //   await db.query('DELETE FROM audit_logs');
    //   console.log('[user-management] DELETE /users - Deleted audit_logs');
    // } catch (err) {
    //   console.log('[user-management] DELETE /users - audit_logs table may not exist:', err.message);
    // }
    
    // Now delete all users
    const deleteResult = await db.query('DELETE FROM users');
    
    console.log(`[user-management] DELETE /users - Deleted ${deleteResult.rowCount || count} users`);
    
    // Verify deletion
    const verifyResult = await db.query('SELECT COUNT(*) as count FROM users');
    const remaining = parseInt(verifyResult.rows[0]?.count) || 0;
    
    if (remaining > 0) {
      console.warn(`[user-management] DELETE /users - Warning: ${remaining} users still remain after deletion`);
    }
    
    return res.json({
      ok: true,
      message: `Deleted ${count} user(s) and related data from the database.`,
      deleted: count,
      remaining: remaining
    });
  } catch (err) {
    console.error('[user-management] DELETE /users failed:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
