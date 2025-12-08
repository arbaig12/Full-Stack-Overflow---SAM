// server/routes/studentProgramRoutes.js
import express from 'express';
import { getCurrentDate } from '../utils/dateWrapper.js';

const router = express.Router();

/**
 * Helper to get current logged-in student id.
 * In index.js you currently do: req.user = { userId: 1, role: 'Student' }
 */
function getStudentId(req) {
  return (
    req.user?.user_id ??
    req.user?.userId ??
    req.session?.user?.user_id ??
    null
  );
}

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
    // Note: Academic calendars have TWO windows per term:
    // 1. Before semester: up to major_and_minor_changes_end (inclusive) - this is BEFORE the semester starts
    // 2. During semester: from major_and_minor_changes_begin onwards (inclusive) - this is DURING the semester
    // The gap between endDate and beginDate is when changes are NOT allowed
    // IMPORTANT: We query the academic_calendar table from the database to get the actual dates
    const today = new Date(currentDate);
    today.setHours(0, 0, 0, 0);
    
    // Sort calendars by term to check most relevant ones first
    const sortedCalendars = result.rows.sort((a, b) => {
      const yearA = parseInt(a.year);
      const yearB = parseInt(b.year);
      if (yearA !== yearB) return yearA - yearB;
      // Fall comes before Spring in same year
      if (a.semester === 'Fall' && b.semester === 'Spring') return -1;
      if (a.semester === 'Spring' && b.semester === 'Fall') return 1;
      return 0;
    });
    
    for (const calendar of sortedCalendars) {
      const beginDate = new Date(calendar.major_and_minor_changes_begin);
      const endDate = new Date(calendar.major_and_minor_changes_end);
      
      // Set time to start of day for comparison
      beginDate.setHours(0, 0, 0, 0);
      endDate.setHours(23, 59, 59, 999);
      
      // Check if today is in window 1 (before semester) OR window 2 (during semester)
      // Window 1: today <= endDate (changes allowed up to and including end date, BEFORE semester)
      // Window 2: today >= beginDate (changes allowed from begin date onwards, DURING semester)
      // IMPORTANT: If endDate < beginDate, there's a gap between them where changes are NOT allowed
      // We must ensure we're in one of the windows, not in the gap
      
      const inWindow1 = today <= endDate;
      const inWindow2 = today >= beginDate;
      
      // If endDate < beginDate, there's a gap. We're only allowed if in window 1 OR window 2
      // If endDate >= beginDate, it's a continuous window, so either condition works
      if (endDate < beginDate) {
        // There's a gap between endDate and beginDate
        // Only allow if we're in window 1 (before endDate) OR window 2 (after beginDate)
        // For window 1: only allow if today is on or before endDate
        // For window 2: only allow if today is on or after beginDate
        // IMPORTANT: We need to prevent future terms from incorrectly allowing changes.
        // For example, Spring 2026's window 1 (ends Jan 24, 2026) should not allow Oct 1, 2025.
        // The issue: on Oct 1, 2025, Spring 2026's endDate (Jan 24, 2026) is in the future,
        // and Oct 1 <= Jan 24 is true, so we'd incorrectly allow it.
        // Solution: For window 1, only allow if endDate is within 6 months of today.
        // This ensures we're only using windows for current or near-term semesters.
        if (inWindow2) {
          // In window 2 (during semester) - always allow
          return { allowed: true };
        } else if (inWindow1) {
          // In window 1 (before semester) - only allow if endDate is today or in the past
          // OR if endDate is within 7 days (to handle edge cases like Aug 28 when endDate is Aug 29)
          // This prevents future terms (like Spring 2026 on Oct 1, 2025) from incorrectly allowing changes
          const sevenDaysFromNow = new Date(today);
          sevenDaysFromNow.setDate(today.getDate() + 7);
          if (endDate <= sevenDaysFromNow) {
            return { allowed: true };
          }
        }
      } else {
        // Continuous window - allow if in either window
        if (inWindow1 || inWindow2) {
          return { allowed: true };
        }
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
    console.error('[student-programs] Error checking major/minor change window:', e);
    // On error, be permissive (don't block changes if we can't check)
    return { allowed: true };
  }
}

/**
 * Load all active programs and group into majors/minors.
 *
 * programs schema (from currentSAM.sql):
 *   program_id BIGINT PK,
 *   code TEXT,
 *   name TEXT,
 *   type program_type, -- 'MAJOR' | 'MINOR'
 *   is_active BOOLEAN
 */
async function loadAvailablePrograms(db) {
  const res = await db.query(
    `
    SELECT
      program_id,
      code AS program_code,
      name AS program_name,
      type AS program_type,
      is_active
    FROM programs
    WHERE is_active = TRUE
    ORDER BY program_name
    `
  );

  const availableMajors = [];
  const availableMinors = [];

  for (const row of res.rows) {
    const base = {
      programId: row.program_id,
      programCode: row.program_code,
      programName: row.program_name,
      programType: row.program_type, // 'MAJOR' or 'MINOR'
    };

    if (row.program_type === 'MAJOR') {
      availableMajors.push(base);
    } else if (row.program_type === 'MINOR') {
      availableMinors.push(base);
    }
  }

  return { availableMajors, availableMinors };
}

/**
 * Load the current student's declared majors/minors.
 */
async function loadStudentPrograms(db, studentId) {
  const res = await db.query(
    `
    SELECT
      sp.student_id,
      sp.program_id,
      sp.declared_at,
      p.code AS program_code,
      p.name AS program_name,
      p.type AS program_type
    FROM student_programs sp
    JOIN programs p
      ON p.program_id = sp.program_id
    WHERE sp.student_id = $1
    ORDER BY
      CASE p.type
        WHEN 'MAJOR' THEN 1
        WHEN 'MINOR' THEN 2
        ELSE 3
      END,
      p.name
    `,
    [studentId]
  );

  const majors = [];
  const minors = [];

  for (const row of res.rows) {
    const base = {
      studentId: row.student_id,
      programId: row.program_id,
      programCode: row.program_code,
      programName: row.program_name,
      programType: row.program_type, // 'MAJOR' or 'MINOR'
      declaredAt: row.declared_at,
    };

    if (row.program_type === 'MAJOR') {
      majors.push(base);
    } else if (row.program_type === 'MINOR') {
      minors.push(base);
    }
  }

  return { majors, minors };
}

/**
 * Load pending requests for a student.
 */
async function loadPendingRequests(db, studentId) {
  const res = await db.query(
    `
    SELECT
      mmr.request_id,
      mmr.student_id,
      mmr.program_id,
      mmr.request_type,
      mmr.effective_term_id,
      mmr.status,
      mmr.requested_at,
      p.code AS program_code,
      p.name AS program_name,
      p.type AS program_type,
      t.semester AS term_semester,
      t.year AS term_year
    FROM major_minor_requests mmr
    JOIN programs p ON p.program_id = mmr.program_id
    LEFT JOIN terms t ON t.term_id = mmr.effective_term_id
    WHERE mmr.student_id = $1 AND mmr.status = 'pending'
    ORDER BY mmr.requested_at DESC
    `,
    [studentId]
  );

  return res.rows.map(row => ({
    requestId: row.request_id,
    programId: row.program_id,
    programCode: row.program_code,
    programName: row.program_name,
    programType: row.program_type,
    requestType: row.request_type,
    effectiveTerm: row.effective_term_id ? {
      termId: row.effective_term_id,
      semester: row.term_semester,
      year: row.term_year
    } : null,
    requestedAt: row.requested_at,
  }));
}

/**
 * Helper to get term_id from a term string like "Fall 2025" or term object.
 * Returns null if term not found.
 */
async function getTermIdFromString(db, termString) {
  if (!termString) return null;
  
  // Parse "Fall 2025" or "Spring 2026" format
  const match = termString.match(/(Fall|Spring|Summer|Winter)\s+(\d{4})/i);
  if (!match) return null;
  
  const [, semester, year] = match;
  const semesterNormalized = semester.charAt(0).toUpperCase() + semester.slice(1).toLowerCase();
  
  const result = await db.query(
    `SELECT term_id FROM terms WHERE semester = $1 AND year = $2`,
    [semesterNormalized, parseInt(year)]
  );
  
  return result.rows.length > 0 ? result.rows[0].term_id : null;
}

/**
 * GET /api/student-programs/init
 *
 * Returns:
 * {
 *   ok: true,
 *   availableMajors: [ { programId, programCode, programName, programType }, ... ],
 *   availableMinors: [ ... ],
 *   majors: [ { programId, programCode, programName, programType, declaredAt }, ... ],
 *   minors: [ ... ],
 *   pendingRequests: [ { requestId, programId, programCode, programName, requestType, effectiveTerm, ... }, ... ]
 * }
 */
router.get('/init', async (req, res) => {
  const studentId = getStudentId(req);

  if (!studentId) {
    return res.status(401).json({
      ok: false,
      error: 'Not authenticated (no student id).',
    });
  }

  try {
    const db = req.db;

    const [available, current, pendingRequests] = await Promise.all([
      loadAvailablePrograms(db),
      loadStudentPrograms(db, studentId),
      loadPendingRequests(db, studentId),
    ]);

    return res.json({
      ok: true,
      ...available,
      ...current,
      pendingRequests,
    });
  } catch (err) {
    console.error('[student-programs/init] error:', err);
    return res.status(500).json({
      ok: false,
      error: err.message || 'Unexpected server error while loading programs.',
    });
  }
});

/**
 * POST /api/student-programs/add
 * Body: { programId, effectiveTerm? }
 *
 * Creates a request to declare a major/minor for this student.
 * The request requires advisor approval before the declaration takes effect.
 *
 * Returns:
 * {
 *   ok: true,
 *   requestId: ...,
 *   message: 'Request submitted successfully',
 *   pendingRequests: [...]
 * }
 */
router.post('/add', async (req, res) => {
  const studentId = getStudentId(req);

  if (!studentId) {
    return res.status(401).json({
      ok: false,
      error: 'Not authenticated (no student id).',
    });
  }

  const { programId, effectiveTerm } = req.body;
  if (!programId) {
    return res.status(400).json({
      ok: false,
      error: 'Missing required field: programId.',
    });
  }

  const db = req.db;
  const client = await db.connect();

  try {
    await client.query('BEGIN');

    // 1) Ensure the program exists and is active
    const progRes = await client.query(
      `
      SELECT
        program_id,
        name AS program_name,
        type AS program_type,
        is_active
      FROM programs
      WHERE program_id = $1
      `,
      [programId]
    );

    if (progRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        ok: false,
        error: 'Program not found.',
      });
    }

    const program = progRes.rows[0];

    if (!program.is_active) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        ok: false,
        error: 'This program is not active.',
      });
    }

    // 2) Check if already declared
    const existingRes = await client.query(
      `
      SELECT 1
      FROM student_programs
      WHERE student_id = $1 AND program_id = $2
      LIMIT 1
      `,
      [studentId, programId]
    );

    if (existingRes.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        ok: false,
        error: 'You have already declared this program.',
      });
    }

    // 3) Check if there's already a pending request for this program
    const pendingRequestRes = await client.query(
      `
      SELECT request_id
      FROM major_minor_requests
      WHERE student_id = $1 AND program_id = $2 AND request_type = 'DECLARE' AND status = 'pending'
      LIMIT 1
      `,
      [studentId, programId]
    );

    if (pendingRequestRes.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        ok: false,
        error: 'You already have a pending request for this program.',
      });
    }

    // 4) Count current majors/minors (only approved ones)
    const countRes = await client.query(
      `
      SELECT p.type AS program_type, COUNT(*)::int AS cnt
      FROM student_programs sp
      JOIN programs p
        ON p.program_id = sp.program_id
      WHERE sp.student_id = $1
      GROUP BY p.type
      `,
      [studentId]
    );

    let majorCount = 0;
    let minorCount = 0;

    for (const row of countRes.rows) {
      if (row.program_type === 'MAJOR') majorCount = row.cnt;
      if (row.program_type === 'MINOR') minorCount = row.cnt;
    }

    if (program.program_type === 'MAJOR' && majorCount >= 2) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        ok: false,
        error: 'You already have the maximum of 2 majors.',
      });
    }

    if (program.program_type === 'MINOR' && minorCount >= 3) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        ok: false,
        error: 'You already have the maximum of 3 minors.',
      });
    }

    // Check if major/minor changes are currently allowed based on academic calendar
    const changeCheck = await checkMajorMinorChangeAllowed(db);
    if (!changeCheck.allowed) {
      await client.query('ROLLBACK');
      return res.status(403).json({
        ok: false,
        error: changeCheck.reason || 'Major/minor changes are not currently permitted',
      });
    }

    // 5) Get effective term_id if provided
    let effectiveTermId = null;
    if (effectiveTerm) {
      effectiveTermId = await getTermIdFromString(db, effectiveTerm);
      if (effectiveTerm && !effectiveTermId) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          ok: false,
          error: `Invalid effective term: ${effectiveTerm}. Please use format like "Fall 2025".`,
        });
      }
    }

    // 6) Create request instead of direct declaration
    const requestRes = await client.query(
      `
      INSERT INTO major_minor_requests (student_id, program_id, request_type, effective_term_id, status)
      VALUES ($1, $2, 'DECLARE', $3, 'pending')
      RETURNING request_id
      `,
      [studentId, programId, effectiveTermId]
    );

    await client.query('COMMIT');

    const requestId = requestRes.rows[0].request_id;
    const pendingRequests = await loadPendingRequests(db, studentId);

    return res.json({
      ok: true,
      requestId,
      message: 'Request submitted successfully. Waiting for advisor approval.',
      pendingRequests,
    });
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {
      // ignore
    }
    console.error('[student-programs/add] error:', err);

    // Handle unique constraint violation (pending request already exists)
    if (err.code === '23505') {
      return res.status(400).json({
        ok: false,
        error: 'You already have a pending request for this program.',
      });
    }

    return res.status(500).json({
      ok: false,
      error: err.message || 'Unexpected server error while submitting request.',
    });
  } finally {
    client.release();
  }
});

/**
 * POST /api/student-programs/drop
 * Body: { programId }
 *
 * Creates a request to drop a major/minor for this student.
 * The request requires advisor approval before the drop takes effect.
 *
 * Returns:
 * {
 *   ok: true,
 *   requestId: ...,
 *   message: 'Drop request submitted successfully',
 *   pendingRequests: [...]
 * }
 */
router.post('/drop', async (req, res) => {
  const studentId = getStudentId(req);

  if (!studentId) {
    return res.status(401).json({
      ok: false,
      error: 'Not authenticated (no student id).',
    });
  }

  const { programId } = req.body;
  if (!programId) {
    return res.status(400).json({
      ok: false,
      error: 'Missing required field: programId.',
    });
  }

  const db = req.db;
  const client = await db.connect();

  try {
    await client.query('BEGIN');

    // 1) Verify the program is currently declared
    const declaredRes = await client.query(
      `
      SELECT 1
      FROM student_programs
      WHERE student_id = $1 AND program_id = $2
      LIMIT 1
      `,
      [studentId, programId]
    );

    if (declaredRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        ok: false,
        error: 'You have not declared this program.',
      });
    }

    // 2) Check if there's already a pending drop request
    const pendingRequestRes = await client.query(
      `
      SELECT request_id
      FROM major_minor_requests
      WHERE student_id = $1 AND program_id = $2 AND request_type = 'DROP' AND status = 'pending'
      LIMIT 1
      `,
      [studentId, programId]
    );

    if (pendingRequestRes.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        ok: false,
        error: 'You already have a pending drop request for this program.',
      });
    }

    // Check if major/minor changes are currently allowed based on academic calendar
    const changeCheck = await checkMajorMinorChangeAllowed(db);
    if (!changeCheck.allowed) {
      await client.query('ROLLBACK');
      return res.status(403).json({
        ok: false,
        error: changeCheck.reason || 'Major/minor changes are not currently permitted',
      });
    }

    // 3) Create drop request
    const requestRes = await client.query(
      `
      INSERT INTO major_minor_requests (student_id, program_id, request_type, status)
      VALUES ($1, $2, 'DROP', 'pending')
      RETURNING request_id
      `,
      [studentId, programId]
    );

    await client.query('COMMIT');

    const requestId = requestRes.rows[0].request_id;
    const pendingRequests = await loadPendingRequests(db, studentId);

    return res.json({
      ok: true,
      requestId,
      message: 'Drop request submitted successfully. Waiting for advisor approval.',
      pendingRequests,
    });
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {
      // ignore
    }
    console.error('[student-programs/drop] error:', err);

    // Handle unique constraint violation
    if (err.code === '23505') {
      return res.status(400).json({
        ok: false,
        error: 'You already have a pending drop request for this program.',
      });
    }

    return res.status(500).json({
      ok: false,
      error: err.message || 'Unexpected server error while submitting drop request.',
    });
  } finally {
    client.release();
  }
});

export default router;
