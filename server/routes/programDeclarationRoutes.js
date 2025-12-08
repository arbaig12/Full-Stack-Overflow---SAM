/**
 * @file programDeclarationRoutes.js
 * @description Express routes for major/minor declaration functionality.
 * Handles:
 *   - Declare major/minor
 *   - Get available programs
 *   - Get student's current declarations
 */

import { Router } from 'express';
import { getCurrentDate } from '../utils/dateWrapper.js';

const router = Router();

/**
 * Helper function to check if major/minor changes are currently allowed
 * based on academic calendar dates.
 * 
 * Changes are allowed if the current date falls within any academic calendar's
 * major/minor changes window (between major_and_minor_changes_begin and major_and_minor_changes_end).
 * 
 * @param {Object} db - Database connection
 * @returns {Promise<{allowed: boolean, reason?: string}>}
 */
async function checkMajorMinorChangeAllowed(db) {
  try {
    const currentDate = getCurrentDate();
    
    // Query all academic calendars to find any active window
    const calendarQuery = `
      SELECT 
        major_and_minor_changes_begin,
        major_and_minor_changes_end,
        term->>'semester' AS semester,
        term->>'year' AS year
      FROM academic_calendar
      WHERE major_and_minor_changes_begin IS NOT NULL 
        AND major_and_minor_changes_end IS NOT NULL
    `;
    
    const result = await db.query(calendarQuery);
    
    // Check if current date falls within any active window
    for (const calendar of result.rows) {
      const beginDate = new Date(calendar.major_and_minor_changes_begin);
      const endDate = new Date(calendar.major_and_minor_changes_end);
      
      // Set time to start of day for comparison
      beginDate.setHours(0, 0, 0, 0);
      endDate.setHours(23, 59, 59, 999);
      const today = new Date(currentDate);
      today.setHours(0, 0, 0, 0);
      
      if (today >= beginDate && today <= endDate) {
        return { allowed: true };
      }
    }
    
    // No active window found
    // Find the next available window to provide helpful error message
    let nextWindow = null;
    for (const calendar of result.rows) {
      const beginDate = new Date(calendar.major_and_minor_changes_begin);
      beginDate.setHours(0, 0, 0, 0);
      const today = new Date(currentDate);
      today.setHours(0, 0, 0, 0);
      
      if (beginDate > today && (!nextWindow || beginDate < nextWindow.date)) {
        nextWindow = {
          date: beginDate,
          term: `${calendar.semester} ${calendar.year}`
        };
      }
    }
    
    if (nextWindow) {
      return {
        allowed: false,
        reason: `Major/minor changes are not currently permitted. The next window opens on ${nextWindow.date.toLocaleDateString()} for ${nextWindow.term}.`
      };
    }
    
    return {
      allowed: false,
      reason: 'Major/minor changes are not currently permitted. No change window is currently active.'
    };
  } catch (e) {
    console.error('[programs] Error checking major/minor change window:', e);
    // On error, be permissive (don't block changes if we can't check)
    return { allowed: true };
  }
}

/**
 * GET /programs
 * Get all available programs (majors and minors).
 * 
 * Query params:
 *   - type: Filter by type (MAJOR, MINOR)
 *   - department_id: Filter by department
 *   - is_active: Filter by active status (default: true)
 * 
 * @route GET /programs
 * @returns {Object} 200 - List of programs
 */
router.get('/programs', async (req, res) => {
  try {
    const { type, department_id, is_active } = req.query;

    let sql = `
      SELECT
        p.program_id,
        p.code,
        p.name,
        p.type::text AS program_type,
        p.is_active,
        p.department_id,
        d.name AS department_name,
        d.code AS department_code
      FROM programs p
      LEFT JOIN departments d ON d.department_id = p.department_id
      WHERE 1=1
    `;

    const params = [];

    if (type) {
      params.push(type.toUpperCase());
      sql += ` AND p.type = $${params.length}`;
    }

    if (department_id) {
      params.push(department_id);
      sql += ` AND p.department_id = $${params.length}`;
    }

    if (is_active !== 'false') {
      sql += ` AND p.is_active = true`;
    }

    sql += ` ORDER BY p.type, p.code`;

    const result = await req.db.query(sql, params);

    const programs = result.rows.map(row => ({
      programId: row.program_id,
      code: row.code,
      name: row.name,
      type: row.program_type.toLowerCase(),
      isActive: row.is_active,
      department: row.department_id ? {
        id: row.department_id,
        name: row.department_name,
        code: row.department_code
      } : null
    }));

    return res.json({ 
      ok: true, 
      count: programs.length,
      programs 
    });
  } catch (e) {
    console.error('[programs] /programs failed:', e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * POST /students/:student_id/declare
 * Declare a major or minor for a student.
 * 
 * Body:
 *   - program_id: Program to declare
 *   - kind: 'MAJOR' or 'MINOR'
 * 
 * @route POST /students/:student_id/declare
 * @returns {Object} 201 - Declaration successful
 * @returns {Object} 400 - Invalid request
 * @returns {Object} 409 - Conflict (already declared, limit reached)
 * @returns {Object} 500 - Query failure
 */
router.post('/students/:student_id/declare', async (req, res) => {
  try {
    const { student_id } = req.params;
    const { program_id, kind } = req.body;

    if (!program_id || !kind) {
      return res.status(400).json({ 
        ok: false, 
        error: 'program_id and kind (MAJOR or MINOR) are required' 
      });
    }

    const programKind = kind.toUpperCase();
    if (programKind !== 'MAJOR' && programKind !== 'MINOR') {
      return res.status(400).json({ 
        ok: false, 
        error: 'kind must be either MAJOR or MINOR' 
      });
    }

    // Verify program exists and matches type
    const programCheck = await req.db.query(
      `SELECT program_id, type::text FROM programs WHERE program_id = $1 AND is_active = true`,
      [program_id]
    );

    if (programCheck.rows.length === 0) {
      return res.status(404).json({ 
        ok: false, 
        error: 'Program not found or inactive' 
      });
    }

    const program = programCheck.rows[0];
    if (program.type.toUpperCase() !== programKind) {
      return res.status(400).json({ 
        ok: false, 
        error: `Program type mismatch: program is ${program.type}, but declaring as ${programKind}` 
      });
    }

    // Check if already declared
    const existing = await req.db.query(
      `SELECT program_id FROM student_programs 
       WHERE student_id = $1 AND program_id = $2`,
      [student_id, program_id]
    );

    if (existing.rows.length > 0) {
      return res.status(409).json({ 
        ok: false, 
        error: 'Program already declared by this student' 
      });
    }

    // Check limits (max 2 majors, max 3 minors) - enforced by database trigger
    const currentCounts = await req.db.query(
      `SELECT 
        COUNT(*) FILTER (WHERE kind = 'MAJOR') AS major_count,
        COUNT(*) FILTER (WHERE kind = 'MINOR') AS minor_count
       FROM student_programs
       WHERE student_id = $1`,
      [student_id]
    );

    const counts = currentCounts.rows[0];
    if (programKind === 'MAJOR' && parseInt(counts.major_count) >= 2) {
      return res.status(409).json({ 
        ok: false, 
        error: 'Maximum of 2 majors allowed' 
      });
    }

    if (programKind === 'MINOR' && parseInt(counts.minor_count) >= 3) {
      return res.status(409).json({ 
        ok: false, 
        error: 'Maximum of 3 minors allowed' 
      });
    }

    // Check if major/minor changes are currently allowed based on academic calendar
    const changeCheck = await checkMajorMinorChangeAllowed(req.db);
    if (!changeCheck.allowed) {
      return res.status(403).json({ 
        ok: false, 
        error: changeCheck.reason || 'Major/minor changes are not currently permitted' 
      });
    }

    // Insert declaration
    await req.db.query(
      `INSERT INTO student_programs (student_id, program_id, kind)
       VALUES ($1, $2, $3::program_type)`,
      [student_id, program_id, programKind]
    );

    return res.status(201).json({ 
      ok: true, 
      message: `Successfully declared ${programKind.toLowerCase()}` 
    });
  } catch (e) {
    console.error('[programs] POST /declare failed:', e);
    
    // Check for database constraint violations
    if (e.message.includes('at most 2 majors') || e.message.includes('at most 3 minors')) {
      return res.status(409).json({ 
        ok: false, 
        error: e.message 
      });
    }

    return res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * DELETE /students/:student_id/declare/:program_id
 * Undeclare a major or minor.
 * 
 * @route DELETE /students/:student_id/declare/:program_id
 * @returns {Object} 200 - Undeclaration successful
 * @returns {Object} 404 - Declaration not found
 */
router.delete('/students/:student_id/declare/:program_id', async (req, res) => {
  try {
    const { student_id, program_id } = req.params;

    // Check if major/minor changes are currently allowed based on academic calendar
    const changeCheck = await checkMajorMinorChangeAllowed(req.db);
    if (!changeCheck.allowed) {
      return res.status(403).json({ 
        ok: false, 
        error: changeCheck.reason || 'Major/minor changes are not currently permitted' 
      });
    }

    const result = await req.db.query(
      `DELETE FROM student_programs 
       WHERE student_id = $1 AND program_id = $2
       RETURNING kind::text`,
      [student_id, program_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        ok: false, 
        error: 'Program declaration not found' 
      });
    }

    return res.json({ 
      ok: true, 
      message: 'Successfully undeclared program' 
    });
  } catch (e) {
    console.error('[programs] DELETE /declare failed:', e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

export default router;

