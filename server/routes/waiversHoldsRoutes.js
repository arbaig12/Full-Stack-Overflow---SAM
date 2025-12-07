/**
 * @file waiversHoldsRoutes.js
 * @description Express routes for managing waivers and holds.
 * Handles:
 *   - Viewing student waivers (prerequisite, time conflict, etc.)
 *   - Viewing and managing registration holds
 *   - Creating/removing holds (registrar/advisor)
 *   - Creating/approving waivers (instructor/advisor/registrar)
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
 * GET /api/waivers-holds/students/:student_id
 * Get all waivers and holds for a specific student
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

    const db = req.db;

    // Get registration holds
    const holdsQuery = await db.query(`
      SELECT 
        h.hold_id,
        h.hold_type,
        h.reason,
        h.issued_by,
        h.issued_at,
        h.resolved_at,
        h.is_active,
        u.first_name || ' ' || u.last_name AS issued_by_name
      FROM registration_holds h
      LEFT JOIN users u ON u.user_id = h.issued_by
      WHERE h.student_id = $1
      ORDER BY h.issued_at DESC
    `, [student_id]);

    // Get waivers (prerequisite, time conflict, etc.)
    const waiversQuery = await db.query(`
      SELECT 
        w.waiver_id,
        w.waiver_type,
        w.course_id,
        w.class_id,
        w.reason,
        w.requested_by,
        w.approved_by,
        w.requested_at,
        w.approved_at,
        w.status,
        c.subject || ' ' || c.course_num AS course_code,
        c.title AS course_title,
        req.first_name || ' ' || req.last_name AS requested_by_name,
        app.first_name || ' ' || app.last_name AS approved_by_name
      FROM waivers w
      LEFT JOIN courses c ON c.course_id = w.course_id
      LEFT JOIN users req ON req.user_id = w.requested_by
      LEFT JOIN users app ON app.user_id = w.approved_by
      WHERE w.student_id = $1
      ORDER BY w.requested_at DESC
    `, [student_id]);

    res.json({
      ok: true,
      studentId: parseInt(student_id),
      holds: holdsQuery.rows.map(h => ({
        holdId: h.hold_id,
        holdType: h.hold_type,
        reason: h.reason,
        issuedBy: h.issued_by,
        issuedByName: h.issued_by_name,
        issuedAt: h.issued_at,
        resolvedAt: h.resolved_at,
        isActive: h.is_active
      })),
      waivers: waiversQuery.rows.map(w => ({
        waiverId: w.waiver_id,
        waiverType: w.waiver_type,
        courseId: w.course_id,
        classId: w.class_id,
        courseCode: w.course_code,
        courseTitle: w.course_title,
        reason: w.reason,
        requestedBy: w.requested_by,
        requestedByName: w.requested_by_name,
        approvedBy: w.approved_by,
        approvedByName: w.approved_by_name,
        requestedAt: w.requested_at,
        approvedAt: w.approved_at,
        status: w.status
      }))
    });
  } catch (err) {
    console.error('[waiversHoldsRoutes] GET /students/:student_id error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * GET /api/waivers-holds/students
 * Get all students with active holds (for registrar/advisor view)
 */
router.get('/students', async (req, res) => {
  try {
    const { userId, role } = getUserInfo(req);

    if (role !== 'Advisor' && role !== 'Registrar') {
      return res.status(403).json({ ok: false, error: 'Not authorized' });
    }

    const db = req.db;

    const query = await db.query(`
      SELECT DISTINCT
        s.student_id,
        u.first_name || ' ' || u.last_name AS student_name,
        u.email AS student_email,
        COUNT(DISTINCT h.hold_id) FILTER (WHERE h.is_active = true) AS active_holds_count,
        COUNT(DISTINCT w.waiver_id) FILTER (WHERE w.status = 'pending') AS pending_waivers_count
      FROM students s
      JOIN users u ON u.user_id = s.student_id
      LEFT JOIN registration_holds h ON h.student_id = s.student_id
      LEFT JOIN waivers w ON w.student_id = s.student_id
      GROUP BY s.student_id, u.first_name, u.last_name, u.email
      HAVING COUNT(DISTINCT h.hold_id) FILTER (WHERE h.is_active = true) > 0
         OR COUNT(DISTINCT w.waiver_id) FILTER (WHERE w.status = 'pending') > 0
      ORDER BY student_name
    `);

    res.json({
      ok: true,
      students: query.rows.map(r => ({
        studentId: r.student_id,
        studentName: r.student_name,
        studentEmail: r.student_email,
        activeHoldsCount: parseInt(r.active_holds_count) || 0,
        pendingWaiversCount: parseInt(r.pending_waivers_count) || 0
      }))
    });
  } catch (err) {
    console.error('[waiversHoldsRoutes] GET /students error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * POST /api/waivers-holds/holds
 * Create a new registration hold
 */
router.post('/holds', async (req, res) => {
  try {
    const { userId, role } = getUserInfo(req);

    if (role !== 'Advisor' && role !== 'Registrar') {
      return res.status(403).json({ ok: false, error: 'Not authorized' });
    }

    const { student_id, hold_type, reason } = req.body;

    if (!student_id || !hold_type || !reason) {
      return res.status(400).json({ ok: false, error: 'Missing required fields' });
    }

    const db = req.db;

    const result = await db.query(`
      INSERT INTO registration_holds (student_id, hold_type, reason, issued_by, is_active)
      VALUES ($1, $2, $3, $4, true)
      RETURNING hold_id, issued_at
    `, [student_id, hold_type, reason, userId]);

    res.json({
      ok: true,
      hold: {
        holdId: result.rows[0].hold_id,
        studentId: parseInt(student_id),
        holdType: hold_type,
        reason: reason,
        issuedBy: userId,
        issuedAt: result.rows[0].issued_at,
        isActive: true
      }
    });
  } catch (err) {
    console.error('[waiversHoldsRoutes] POST /holds error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * PUT /api/waivers-holds/holds/:hold_id/resolve
 * Resolve (remove) a registration hold
 */
router.put('/holds/:hold_id/resolve', async (req, res) => {
  try {
    const { userId, role } = getUserInfo(req);

    if (role !== 'Advisor' && role !== 'Registrar') {
      return res.status(403).json({ ok: false, error: 'Not authorized' });
    }

    const { hold_id } = req.params;

    const db = req.db;

    const result = await db.query(`
      UPDATE registration_holds
      SET is_active = false, resolved_at = NOW()
      WHERE hold_id = $1
      RETURNING *
    `, [hold_id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Hold not found' });
    }

    res.json({
      ok: true,
      hold: {
        holdId: result.rows[0].hold_id,
        isActive: false,
        resolvedAt: result.rows[0].resolved_at
      }
    });
  } catch (err) {
    console.error('[waiversHoldsRoutes] PUT /holds/:hold_id/resolve error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * POST /api/waivers-holds/waivers
 * Request a new waiver
 */
router.post('/waivers', async (req, res) => {
  try {
    const { userId, role } = getUserInfo(req);

    if (role !== 'Student' && role !== 'Instructor' && role !== 'Advisor' && role !== 'Registrar') {
      return res.status(403).json({ ok: false, error: 'Not authorized' });
    }

    const { student_id, waiver_type, course_id, class_id, reason } = req.body;

    if (!student_id || !waiver_type || !reason) {
      return res.status(400).json({ ok: false, error: 'Missing required fields' });
    }

    // Students can only request for themselves
    if (role === 'Student' && userId !== parseInt(student_id)) {
      return res.status(403).json({ ok: false, error: 'Not authorized' });
    }

    const db = req.db;

    const result = await db.query(`
      INSERT INTO waivers (student_id, waiver_type, course_id, class_id, reason, requested_by, status)
      VALUES ($1, $2, $3, $4, $5, $6, 'pending')
      RETURNING waiver_id, requested_at
    `, [student_id, waiver_type, course_id || null, class_id || null, reason, userId]);

    res.json({
      ok: true,
      waiver: {
        waiverId: result.rows[0].waiver_id,
        studentId: parseInt(student_id),
        waiverType: waiver_type,
        courseId: course_id,
        classId: class_id,
        reason: reason,
        requestedBy: userId,
        requestedAt: result.rows[0].requested_at,
        status: 'pending'
      }
    });
  } catch (err) {
    console.error('[waiversHoldsRoutes] POST /waivers error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * PUT /api/waivers-holds/waivers/:waiver_id/approve
 * Approve a waiver
 */
router.put('/waivers/:waiver_id/approve', async (req, res) => {
  try {
    const { userId, role } = getUserInfo(req);

    if (role !== 'Instructor' && role !== 'Advisor' && role !== 'Registrar') {
      return res.status(403).json({ ok: false, error: 'Not authorized' });
    }

    const { waiver_id } = req.params;

    const db = req.db;

    const result = await db.query(`
      UPDATE waivers
      SET status = 'approved', approved_by = $1, approved_at = NOW()
      WHERE waiver_id = $2 AND status = 'pending'
      RETURNING *
    `, [userId, waiver_id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Waiver not found or already processed' });
    }

    res.json({
      ok: true,
      waiver: {
        waiverId: result.rows[0].waiver_id,
        status: 'approved',
        approvedBy: userId,
        approvedAt: result.rows[0].approved_at
      }
    });
  } catch (err) {
    console.error('[waiversHoldsRoutes] PUT /waivers/:waiver_id/approve error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * PUT /api/waivers-holds/waivers/:waiver_id/reject
 * Reject a waiver
 */
router.put('/waivers/:waiver_id/reject', async (req, res) => {
  try {
    const { userId, role } = getUserInfo(req);

    if (role !== 'Instructor' && role !== 'Advisor' && role !== 'Registrar') {
      return res.status(403).json({ ok: false, error: 'Not authorized' });
    }

    const { waiver_id } = req.params;

    const db = req.db;

    const result = await db.query(`
      UPDATE waivers
      SET status = 'rejected', approved_by = $1, approved_at = NOW()
      WHERE waiver_id = $2 AND status = 'pending'
      RETURNING *
    `, [userId, waiver_id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Waiver not found or already processed' });
    }

    res.json({
      ok: true,
      waiver: {
        waiverId: result.rows[0].waiver_id,
        status: 'rejected',
        approvedBy: userId,
        approvedAt: result.rows[0].approved_at
      }
    });
  } catch (err) {
    console.error('[waiversHoldsRoutes] PUT /waivers/:waiver_id/reject error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;

