/**
 * @file userRoutes.js
 * @description This file defines the Express router for the User concept, focusing on
 * user search and data export functionalities. It implements parts of Section 2
 * of the project requirements.
 * @requires express - Fast, unopinionated, minimalist web framework for Node.js.
 * @requires js-yaml - Library to dump JavaScript objects into YAML strings.
 * @requires ./userModel.js - The model functions for the User concept.
 */

import { Router } from 'express';
import yaml from 'js-yaml';
import { findRegistrars, searchUsers, findUserBySbuId } from './userModel.js';

const router = Router();

/**
 * @route GET /api/users/registrars
 * @description Retrieves a list of all users with the 'Registrar' role.
 * The data is mapped to a UI-friendly format.
 *
 * @returns {object} 200 - A success response with an array of registrar user objects.
 * @returns {object} 500 - An error response if the database query fails.
 */
router.get('/registrars', async (req, res) => {
  try {
    const registrarsData = await findRegistrars(req.db);

    // Map database results to a more presentable format for the UI
    const registrars = registrarsData.map((u) => ({
      id: u.sbu_id ?? String(u.user_id), // Prefer SBU ID, fallback to internal user_id
      name: `${u.first_name} ${u.last_name}`,
      email: u.email,
      role: 'registrar', // Explicitly set role for consistency
      status: 'active', // Placeholder status
      lastLogin: null,  // Placeholder
      department: 'Administration', // Placeholder
    }));

    return res.json({ ok: true, users: registrars });
  } catch (e) {
    console.error('[UserRoutes] GET /registrars failed:', e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * @route GET /api/users/search
 * @description Searches for users based on various criteria provided as query parameters.
 * Supports searching by name prefix, role, and for students, by major or minor.
 *
 * @param {object} req - The Express request object.
 * @param {object} req.query - The query parameters for the search.
 * @param {string} [req.query.name] - Name prefix to search (case-insensitive).
 * @param {string} [req.query.role] - User role to filter by (e.g., 'Student', 'Advisor').
 * @param {string} [req.query.major] - Major to filter students by.
 * @param {string} [req.query.minor] - Minor to filter students by.
 *
 * @returns {object} 200 - A success response with an array of matching user objects and applied filters.
 * @returns {object} 500 - An error response if the database query fails.
 */
router.get('/search', async (req, res) => {
  try {
    const usersData = await searchUsers(req.db, req.query);

    // Map database results to a more presentable format for the UI
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
      appliedFilters: { // Echo back the filters that were applied
        name: req.query.name ?? null,
        role: req.query.role ?? null,
        major: req.query.major ?? null,
        minor: req.query.minor ?? null,
      },
    });
  } catch (e) {
    console.error('[UserRoutes] GET /search failed:', e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * @route GET /api/users/:sbu_id/export
 * @description Exports a single user's data as a YAML file, formatted similarly to `users1.yaml`.
 * This endpoint is intended for registrars to download specific user information.
 *
 * @param {object} req - The Express request object.
 * @param {object} req.params - The route parameters.
 * @param {string} req.params.sbu_id - The SBU ID of the user to export.
 *
 * @returns {string} 200 - A YAML formatted string representing the user's data, sent as a downloadable file.
 * @returns {object} 404 - An error response if the user with the specified SBU ID is not found.
 * @returns {object} 500 - An error response if the database query or YAML serialization fails.
 */
router.get('/:sbu_id/export', async (req, res) => {
  try {
    const { sbu_id } = req.params;
    const u = await findUserBySbuId(req.db, sbu_id);

    if (!u) {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }

    // Format the user object to match the structure of users1.yaml for consistency
    const yamlObj = {
      users: [
        {
          sbu_id: u.sbu_id,
          first_name: u.first_name,
          last_name: u.last_name,
          email: u.email,
          role: u.role.toLowerCase(),
          // Add other fields as necessary to match users1.yaml if they exist in 'u'
        }
      ]
    };

    const yamlText = yaml.dump(yamlObj);

    // Set headers for file download
    res.setHeader('Content-Type', 'application/x-yaml');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="user_${u.sbu_id}.yaml"`
    );

    return res.status(200).send(yamlText);
  } catch (e) {
    console.error('[UserRoutes] GET /:sbu_id/export failed:', e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

export default router;
