/**
 * @file auditLogRoutes.js
 * @description Express routes for viewing audit logs.
 * Handles:
 *   - Viewing audit log entries (who issued holds, waivers, etc.)
 *   - Filtering by student, action type, date range
 *   - Viewing audit log for specific students
 */

import { Router } from 'express';

const router = Router();

/**
 * Helper to get current user info
 */
function getUserInfo(req) {
  return {
    userId: req.user?.user_id ?? req.user?.userId ?? null,
    role: req.user?.role ?? null
  };
}

/**
 * GET /api/audit-log
 * Get audit log entries with optional filters
 * Query params: student_id, action_type, start_date, end_date, limit, offset
 */
router.get('/', async (req, res) => {
  try {
    const { userId, role } = getUserInfo(req);

    // Only registrar and advisor can view audit logs
    if (role !== 'Registrar' && role !== 'Advisor') {
      return res.status(403).json({ ok: false, error: 'Not authorized' });
    }

    const { student_id, action_type, start_date, end_date, limit = 100, offset = 0 } = req.query;

    const db = req.db;

    let query = `
      SELECT 
        al.audit_id,
        al.student_id,
        al.action_type,
        al.action_description,
        al.performed_by,
        al.performed_at,
        al.entity_type,
        al.entity_id,
        u.first_name || ' ' || u.last_name AS student_name,
        p.first_name || ' ' || p.last_name AS performed_by_name
      FROM audit_log al
      LEFT JOIN users u ON u.user_id = al.student_id
      LEFT JOIN users p ON p.user_id = al.performed_by
      WHERE 1=1
    `;

    const params = [];
    let paramCount = 0;

    if (student_id) {
      paramCount++;
      query += ` AND al.student_id = $${paramCount}`;
      params.push(student_id);
    }

    if (action_type) {
      paramCount++;
      query += ` AND al.action_type = $${paramCount}`;
      params.push(action_type);
    }

    if (start_date) {
      paramCount++;
      query += ` AND al.performed_at >= $${paramCount}`;
      params.push(start_date);
    }

    if (end_date) {
      paramCount++;
      query += ` AND al.performed_at <= $${paramCount}`;
      params.push(end_date);
    }

    query += ` ORDER BY al.performed_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await db.query(query, params);

    // Get total count for pagination
    let countQuery = `
      SELECT COUNT(*) as total
      FROM audit_log al
      WHERE 1=1
    `;
    const countParams = [];
    let countParamCount = 0;

    if (student_id) {
      countParamCount++;
      countQuery += ` AND al.student_id = $${countParamCount}`;
      countParams.push(student_id);
    }

    if (action_type) {
      countParamCount++;
      countQuery += ` AND al.action_type = $${countParamCount}`;
      countParams.push(action_type);
    }

    if (start_date) {
      countParamCount++;
      countQuery += ` AND al.performed_at >= $${countParamCount}`;
      countParams.push(start_date);
    }

    if (end_date) {
      countParamCount++;
      countQuery += ` AND al.performed_at <= $${countParamCount}`;
      countParams.push(end_date);
    }

    const countResult = await db.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].total) || 0;

    res.json({
      ok: true,
      entries: result.rows.map(r => ({
        auditId: r.audit_id,
        studentId: r.student_id,
        studentName: r.student_name,
        actionType: r.action_type,
        actionDescription: r.action_description,
        performedBy: r.performed_by,
        performedByName: r.performed_by_name,
        performedAt: r.performed_at,
        entityType: r.entity_type,
        entityId: r.entity_id
      })),
      pagination: {
        total,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: (parseInt(offset) + parseInt(limit)) < total
      }
    });
  } catch (err) {
    console.error('[auditLogRoutes] GET / error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * GET /api/audit-log/students/:student_id
 * Get audit log entries for a specific student
 */
router.get('/students/:student_id', async (req, res) => {
  try {
    const { student_id } = req.params;
    const { userId, role } = getUserInfo(req);

    // Authorization: student can view own, advisor/registrar can view any
    if (role !== 'Student' && role !== 'Advisor' && role !== 'Registrar') {
      return res.status(403).json({ ok: false, error: 'Not authorized' });
    }

    if (role === 'Student' && userId !== parseInt(student_id)) {
      return res.status(403).json({ ok: false, error: 'Not authorized to view this student' });
    }

    const { limit = 50, offset = 0 } = req.query;

    const db = req.db;

    const result = await db.query(`
      SELECT 
        al.audit_id,
        al.action_type,
        al.action_description,
        al.performed_by,
        al.performed_at,
        al.entity_type,
        al.entity_id,
        p.first_name || ' ' || p.last_name AS performed_by_name
      FROM audit_log al
      LEFT JOIN users p ON p.user_id = al.performed_by
      WHERE al.student_id = $1
      ORDER BY al.performed_at DESC
      LIMIT $2 OFFSET $3
    `, [student_id, parseInt(limit), parseInt(offset)]);

    const countResult = await db.query(`
      SELECT COUNT(*) as total
      FROM audit_log
      WHERE student_id = $1
    `, [student_id]);

    const total = parseInt(countResult.rows[0].total) || 0;

    res.json({
      ok: true,
      studentId: parseInt(student_id),
      entries: result.rows.map(r => ({
        auditId: r.audit_id,
        actionType: r.action_type,
        actionDescription: r.action_description,
        performedBy: r.performed_by,
        performedByName: r.performed_by_name,
        performedAt: r.performed_at,
        entityType: r.entity_type,
        entityId: r.entity_id
      })),
      pagination: {
        total,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: (parseInt(offset) + parseInt(limit)) < total
      }
    });
  } catch (err) {
    console.error('[auditLogRoutes] GET /students/:student_id error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * GET /api/audit-log/action-types
 * Get list of available action types
 */
router.get('/action-types', async (req, res) => {
  try {
    const { userId, role } = getUserInfo(req);

    if (role !== 'Registrar' && role !== 'Advisor') {
      return res.status(403).json({ ok: false, error: 'Not authorized' });
    }

    const db = req.db;

    const result = await db.query(`
      SELECT DISTINCT action_type
      FROM audit_log
      ORDER BY action_type
    `);

    res.json({
      ok: true,
      actionTypes: result.rows.map(r => r.action_type)
    });
  } catch (err) {
    console.error('[auditLogRoutes] GET /action-types error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;

