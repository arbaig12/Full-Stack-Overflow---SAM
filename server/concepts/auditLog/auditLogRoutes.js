/**
 * @file auditLogRoutes.js
 * @description This file defines the Express router for the Audit Log concept.
 * It provides endpoints for retrieving audit log entries.
 */

import { Router } from 'express';
import { logAction, getAuditLog } from './auditLogModel.js';

const router = Router();

/**
 * @route POST /api/audit-log
 * @description Logs an action into the audit trail.
 * This endpoint is primarily for internal system use or by privileged users.
 * @param {object} req - The Express request object.
 * @param {object} req.body - The request body containing log entry details.
 * @returns {object} 201 - A success response with the newly created audit log entry.
 * @returns {object} 500 - An error response if the database operation fails.
 */
router.post('/', async (req, res) => {
  try {
    const logEntry = await logAction(req.db, req.body);
    return res.status(201).json({ ok: true, logEntry });
  } catch (e) {
    console.error(`[AuditLog] POST / failed:`, e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * @route GET /api/audit-log
 * @description Retrieves audit log entries, with optional filtering.
 * @param {object} req - The Express request object.
 * @param {object} req.query - Query parameters for filtering (user_id, action_type, entity_type, entity_id, startDate, endDate, limit, offset).
 * @returns {object} 200 - A success response with an array of audit log entries.
 * @returns {object} 500 - An error response if the database operation fails.
 */
router.get('/', async (req, res) => {
  try {
    const filters = req.query; // Filters are passed as query parameters
    const logEntries = await getAuditLog(req.db, filters);
    return res.json({ ok: true, logEntries });
  } catch (e) {
    console.error(`[AuditLog] GET / failed:`, e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

export default router;
