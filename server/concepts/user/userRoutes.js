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
import { findRegistrars, searchUsers, findUserBySbuId } from './userModel.js';

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
    const registrarsData = await findRegistrars(req.db);

    const registrars = registrarsData.map((u) => ({
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
    const usersData = await searchUsers(req.db, req.query);

    const users = usersData.map((u) => ({
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
        name: req.query.name ?? null,
        role: req.query.role ?? null,
        major: req.query.major ?? null,
        minor: req.query.minor ?? null,
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
    const u = await findUserBySbuId(req.db, sbu_id);

    if (!u) {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }

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
