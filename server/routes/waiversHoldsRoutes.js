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
import { canAdvisorPlaceHold } from './registrationScheduleRoutes.js';

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
    
    // Convert student_id to integer for database query (handles both string and number inputs)
    const studentUserId = parseInt(student_id);
    if (isNaN(studentUserId)) {
      return res.status(400).json({ ok: false, error: 'Invalid student ID' });
    }

    console.log('[waiversHoldsRoutes] GET /students/:student_id - Request:', {
      student_id_param: student_id,
      studentUserId_parsed: studentUserId,
      role
    });

    // Get registration holds (both active and resolved)
    const holdsQuery = await db.query(`
      SELECT 
        h.hold_id,
        h.hold_type,
        h.note,
        h.placed_by_user_id,
        h.placed_at,
        h.resolved_at,
        u.first_name || ' ' || u.last_name AS placed_by_name
      FROM registration_holds h
      LEFT JOIN users u ON u.user_id = h.placed_by_user_id
      WHERE h.student_user_id = $1
      ORDER BY h.placed_at DESC
    `, [studentUserId]);

    console.log('[waiversHoldsRoutes] Loaded holds for student:', {
      studentId_param: student_id,
      studentUserId_parsed: studentUserId,
      holdsCount: holdsQuery.rows.length,
      activeHoldsCount: holdsQuery.rows.filter(h => h.resolved_at === null).length,
      holds: holdsQuery.rows.map(h => ({
        holdId: h.hold_id,
        holdType: h.hold_type,
        resolvedAt: h.resolved_at,
        isActive: h.resolved_at === null
      }))
    });

    // Get waivers (prerequisite, time conflict, etc.)
    const waiversQuery = await db.query(`
      SELECT 
        w.waiver_id,
        w.waiver_type,
        w.related_entity_id,
        w.related_entity_type,
        w.description,
        w.granted_by_user_id,
        w.granted_at,
        w.expires_at,
        CASE 
          WHEN w.related_entity_type = 'course' THEN w.related_entity_id
          ELSE NULL
        END AS course_id,
        CASE 
          WHEN w.related_entity_type = 'class' THEN w.related_entity_id
          ELSE NULL
        END AS class_id,
        c.subject || ' ' || c.course_num AS course_code,
        c.title AS course_title,
        granter.first_name || ' ' || granter.last_name AS granted_by_name
      FROM waivers w
      LEFT JOIN courses c ON c.course_id = w.related_entity_id AND w.related_entity_type = 'course'
      LEFT JOIN users granter ON granter.user_id = w.granted_by_user_id
      WHERE w.student_user_id = $1
      ORDER BY w.granted_at DESC
    `, [studentUserId]);

    res.json({
      ok: true,
      studentId: studentUserId,
      holds: holdsQuery.rows.map(h => ({
        holdId: h.hold_id,
        holdType: h.hold_type,
        reason: h.note || '',
        note: h.note,
        issuedBy: h.placed_by_user_id,
        issuedByName: h.placed_by_name,
        issuedAt: h.placed_at,
        resolvedAt: h.resolved_at,
        isActive: h.resolved_at === null
      })),
      waivers: waiversQuery.rows.map(w => ({
        waiverId: w.waiver_id,
        waiverType: w.waiver_type,
        courseId: w.course_id,
        classId: w.class_id,
        relatedEntityId: w.related_entity_id,
        relatedEntityType: w.related_entity_type,
        courseCode: w.course_code,
        courseTitle: w.course_title,
        reason: w.description || '',
        grantedBy: w.granted_by_user_id,
        grantedByName: w.granted_by_name,
        grantedAt: w.granted_at,
        expiresAt: w.expires_at,
        status: w.expires_at && new Date(w.expires_at) < new Date() ? 'expired' : 'active'
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
        s.user_id AS student_id,
        u.first_name || ' ' || u.last_name AS student_name,
        u.email AS student_email,
        COUNT(DISTINCT h.hold_id) FILTER (WHERE h.resolved_at IS NULL) AS active_holds_count,
        COUNT(DISTINCT w.waiver_id) AS pending_waivers_count
      FROM students s
      JOIN users u ON u.user_id = s.user_id
      LEFT JOIN registration_holds h ON h.student_user_id = s.user_id
      LEFT JOIN waivers w ON w.student_user_id = s.user_id
      GROUP BY s.user_id, u.first_name, u.last_name, u.email
      HAVING COUNT(DISTINCT h.hold_id) FILTER (WHERE h.resolved_at IS NULL) > 0
         OR COUNT(DISTINCT w.waiver_id) > 0
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

    const validHoldTypes = ['academic_advising', 'financial', 'disciplinary', 'other'];
    if (!validHoldTypes.includes(hold_type)) {
      return res.status(400).json({ ok: false, error: `Invalid holdType. Must be one of: ${validHoldTypes.join(', ')}` });
    }

    const db = req.db;

    // Check authorization for academic advising holds
    if (hold_type === 'academic_advising' && role === 'Advisor') {
      const canPlace = await canAdvisorPlaceHold(db, userId, parseInt(student_id));
      if (!canPlace) {
        return res.status(403).json({ 
          ok: false, 
          error: 'You are not authorized to place academic advising holds on this student. Academic advising holds can only be placed on students in your scope (university/college/department).' 
        });
      }
    }

    // Advisors can place all types of holds (financial, disciplinary, other, and academic_advising if authorized)

    const result = await db.query(`
      INSERT INTO registration_holds (student_user_id, hold_type, note, placed_by_user_id)
      VALUES ($1, $2, $3, $4)
      RETURNING hold_id, placed_at
    `, [student_id, hold_type, reason, userId]);

    res.json({
      ok: true,
      hold: {
        holdId: result.rows[0].hold_id,
        studentId: parseInt(student_id),
        holdType: hold_type,
        reason: reason,
        issuedBy: userId,
        issuedAt: result.rows[0].placed_at,
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

    // First, get the hold details to check authorization
    const holdRes = await db.query(`
      SELECT hold_id, student_user_id, hold_type, note
      FROM registration_holds
      WHERE hold_id = $1 AND resolved_at IS NULL
    `, [hold_id]);

    if (holdRes.rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Hold not found or already removed' });
    }

    const hold = holdRes.rows[0];

    // Check authorization for academic advising holds
    if (hold.hold_type === 'academic_advising' && role === 'Advisor') {
      const canRemove = await canAdvisorPlaceHold(db, userId, hold.student_user_id);
      if (!canRemove) {
        return res.status(403).json({ 
          ok: false, 
          error: 'You are not authorized to remove this academic advising hold. Academic advising holds can only be removed by advisors with authority over this student.' 
        });
      }
    }

    // Advisors can remove all types of holds (financial, disciplinary, other, and academic_advising if authorized)

    const result = await db.query(`
      UPDATE registration_holds
      SET resolved_at = NOW(), resolved_by_user_id = $1
      WHERE hold_id = $2 AND resolved_at IS NULL
      RETURNING *
    `, [userId, hold_id]);

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

    // Determine related_entity_id and related_entity_type
    let related_entity_id = null;
    let related_entity_type = null;
    if (course_id) {
      related_entity_id = course_id;
      related_entity_type = 'course';
    } else if (class_id) {
      related_entity_id = class_id;
      related_entity_type = 'class';
    }

    const db = req.db;

    const result = await db.query(`
      INSERT INTO waivers (student_user_id, waiver_type, related_entity_id, related_entity_type, description, granted_by_user_id)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING waiver_id, granted_at
    `, [student_id, waiver_type, related_entity_id, related_entity_type, reason, userId]);

    res.json({
      ok: true,
      waiver: {
        waiverId: result.rows[0].waiver_id,
        studentId: parseInt(student_id),
        waiverType: waiver_type,
        courseId: course_id || null,
        classId: class_id || null,
        reason: reason,
        grantedBy: userId,
        grantedAt: result.rows[0].granted_at,
        status: 'active'
      }
    });
  } catch (err) {
    console.error('[waiversHoldsRoutes] POST /waivers error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * PUT /api/waivers-holds/waivers/:waiver_id/approve
 * Approve a waiver (update granted_by_user_id to the approver)
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
      SET granted_by_user_id = $1, granted_at = NOW()
      WHERE waiver_id = $2
      RETURNING *
    `, [userId, waiver_id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Waiver not found' });
    }

    res.json({
      ok: true,
      waiver: {
        waiverId: result.rows[0].waiver_id,
        grantedBy: userId,
        grantedAt: result.rows[0].granted_at,
        status: 'active'
      }
    });
  } catch (err) {
    console.error('[waiversHoldsRoutes] PUT /waivers/:waiver_id/approve error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * PUT /api/waivers-holds/waivers/:waiver_id/reject
 * Reject a waiver (delete the waiver record)
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
      DELETE FROM waivers
      WHERE waiver_id = $1
      RETURNING *
    `, [waiver_id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Waiver not found' });
    }

    res.json({
      ok: true,
      waiver: {
        waiverId: result.rows[0].waiver_id,
        status: 'rejected'
      }
    });
  } catch (err) {
    console.error('[waiversHoldsRoutes] PUT /waivers/:waiver_id/reject error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;

