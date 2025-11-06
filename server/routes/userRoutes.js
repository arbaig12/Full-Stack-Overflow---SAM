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
      SELECT user_id, sbu_id, first_name, last_name, email, role::text AS role
      FROM users
      WHERE lower(role::text) = lower($1)
      ORDER BY last_name, first_name
    `;
    const r = await req.db.query(sql, ['Registrar']);

    const registrars = r.rows.map((u) => ({
      id: u.sbu_id ?? String(u.user_id),
      name: `${u.first_name} ${u.last_name}`,
      email: u.email,
      role: 'registrar',
      status: 'active',
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
 *   - name prefix
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

    let useProgramJoin = false;

    if (
      role &&
      role.toLowerCase() === 'student' &&
      (major || minor)
    ) {
      useProgramJoin = true;

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

    const result = await req.db.query(baseSql, params);

    const users = result.rows.map((u) => ({
      id: u.sbu_id ?? String(u.user_id),
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

export default router;
