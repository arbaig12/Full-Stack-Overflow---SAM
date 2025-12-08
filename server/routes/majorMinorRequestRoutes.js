// server/routes/majorMinorRequestRoutes.js
import express from 'express';

const router = express.Router();

/**
 * Helper to get current logged-in user info.
 * Also checks for role override from frontend (for testing/development).
 */
function getUserInfo(req) {
  const actualRole = req.user?.role ?? null;
  
  // Check for role override from frontend (for UI role toggle)
  // This allows the frontend role selector to work for testing
  // Headers are case-insensitive, but Express normalizes them to lowercase
  const roleOverride = req.headers['x-role-override'] || 
                       req.headers['X-Role-Override'] ||
                       req.get('x-role-override') ||
                       req.get('X-Role-Override');
  
  // Use override if provided, otherwise use actual role
  const role = roleOverride || actualRole;
  
  return {
    userId: req.user?.user_id ?? req.user?.userId ?? null,
    role: role,
    actualRole: actualRole, // Keep track of actual role for logging
  };
}

/**
 * Helper to check if an advisor can approve a request for a given program.
 * Advisors can approve if:
 * - They are a university-level advisor
 * - They are a college-level advisor for the program's college
 * - They are a department-level advisor for the program's department
 * - If advisors table doesn't exist or user is not in it, allow if user has Advisor role
 */
async function canAdvisorApprove(db, advisorId, programId) {
  try {
    // First check if advisors table exists and has the user
    // Use a safe query that handles missing columns
    let advisorRes;
    try {
      advisorRes = await db.query(
        `
        SELECT a.level, a.department_id
        FROM advisors a
        WHERE a.user_id = $1
        `,
        [advisorId]
      );
    } catch (tableErr) {
      // If advisors table doesn't exist or has wrong schema, 
      // allow any user with Advisor role to approve
      console.log('[canAdvisorApprove] Advisors table issue, allowing all advisors:', tableErr.message);
      return true;
    }

    // If advisor not in advisors table, check if they have Advisor role
    if (advisorRes.rows.length === 0) {
      const userCheck = await db.query(
        `SELECT role FROM users WHERE user_id = $1`,
        [advisorId]
      );
      if (userCheck.rows.length > 0 && userCheck.rows[0].role === 'Advisor') {
        // User has Advisor role but not in advisors table - allow them
        return true;
      }
      return false;
    }

    const advisor = advisorRes.rows[0];

    // University-level advisors can approve anything
    if (advisor.level === 'university') {
      return true;
    }

    // Get program's department and college
    const programRes = await db.query(
      `
      SELECT p.department_id, d.college_id
      FROM programs p
      LEFT JOIN departments d ON d.department_id = p.department_id
      WHERE p.program_id = $1
      `,
      [programId]
    );

    if (programRes.rows.length === 0) {
      return false;
    }

    const program = programRes.rows[0];

    // Department-level advisors can approve programs in their department
    if (advisor.level === 'department' && advisor.department_id === program.department_id) {
      return true;
    }

    // For college-level, try to check college_id if column exists
    if (advisor.level === 'college') {
      try {
        const collegeCheck = await db.query(
          `
          SELECT a.college_id
          FROM advisors a
          WHERE a.user_id = $1
          `,
          [advisorId]
        );
        if (collegeCheck.rows.length > 0 && collegeCheck.rows[0].college_id === program.college_id) {
          return true;
        }
      } catch (colErr) {
        // college_id column doesn't exist - skip college-level check
        console.log('[canAdvisorApprove] college_id column not available');
      }
    }

    return false;
  } catch (err) {
    console.error('[canAdvisorApprove] Error:', err);
    // On error, be permissive - allow approval if user has Advisor role
    const userCheck = await db.query(
      `SELECT role FROM users WHERE user_id = $1`,
      [advisorId]
    );
    return userCheck.rows.length > 0 && userCheck.rows[0].role === 'Advisor';
  }
}

/**
 * GET /api/major-minor-requests/pending
 * Get all pending major/minor requests that the current advisor can approve.
 * 
 * Returns:
 * {
 *   ok: true,
 *   requests: [{
 *     requestId,
 *     studentId,
 *     studentName,
 *     programId,
 *     programCode,
 *     programName,
 *     programType,
 *     requestType,
 *     effectiveTerm,
 *     requestedAt
 *   }, ...]
 * }
 */
router.get('/pending', async (req, res) => {
  const userInfo = getUserInfo(req);
  const { userId, role, actualRole } = userInfo;

  // Debug logging
  console.log('[major-minor-requests/pending] User info:', { 
    userId, 
    role, 
    actualRole,
    roleOverride: req.headers['x-role-override'],
    roleType: typeof role,
    hasUser: !!req.user,
    userObject: req.user ? { user_id: req.user.user_id, role: req.user.role } : null
  });

  if (!userId) {
    return res.status(401).json({
      ok: false,
      error: 'Not authenticated. Please log in.',
    });
  }

  // Case-insensitive role check
  const normalizedRole = role ? String(role).trim() : '';
  if (normalizedRole.toLowerCase() !== 'advisor') {
    return res.status(403).json({
      ok: false,
      error: `Only advisors can view pending requests. Your role: ${role || 'none'}`,
    });
  }

  try {
    const db = req.db;

    // Get all pending requests with student and program info
    const requestsRes = await db.query(
      `
      SELECT
        mmr.request_id,
        mmr.student_id,
        mmr.program_id,
        mmr.request_type,
        mmr.effective_term_id,
        mmr.requested_at,
        u.first_name || ' ' || u.last_name AS student_name,
        p.code AS program_code,
        p.name AS program_name,
        p.type AS program_type,
        p.department_id,
        t.semester AS term_semester,
        t.year AS term_year
      FROM major_minor_requests mmr
      JOIN users u ON u.user_id = mmr.student_id
      JOIN programs p ON p.program_id = mmr.program_id
      LEFT JOIN terms t ON t.term_id = mmr.effective_term_id
      WHERE mmr.status = 'pending'
      ORDER BY mmr.requested_at ASC
      `
    );

    // Filter requests to only those this advisor can approve
    // If using role override (for testing), show all requests
    const isRoleOverride = !!req.headers['x-role-override'];
    const eligibleRequests = [];
    
    console.log('[major-minor-requests/pending] Found', requestsRes.rows.length, 'pending requests');
    console.log('[major-minor-requests/pending] Using role override:', isRoleOverride);
    
    for (const row of requestsRes.rows) {
      let canApprove = false;
      
      if (isRoleOverride) {
        // When using role override (navbar toggle), allow all requests for testing
        canApprove = true;
        console.log('[major-minor-requests/pending] Allowing request', row.request_id, 'due to role override');
      } else {
        // Normal flow: check if advisor can approve this specific program
        canApprove = await canAdvisorApprove(db, userId, row.program_id);
        if (!canApprove) {
          console.log('[major-minor-requests/pending] Filtering out request', row.request_id, 'for program', row.program_id);
        }
      }
      
      if (canApprove) {
        eligibleRequests.push({
          requestId: row.request_id,
          studentId: row.student_id,
          studentName: row.student_name,
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
        });
      }
    }

    return res.json({
      ok: true,
      requests: eligibleRequests,
    });
  } catch (err) {
    console.error('[major-minor-requests/pending] error:', err);
    
    // Check if table doesn't exist
    if (err.message && err.message.includes('does not exist')) {
      return res.status(500).json({
        ok: false,
        error: 'Database table "major_minor_requests" does not exist. Please run the migration: server/database/migrations/006_create_major_minor_requests.sql',
      });
    }
    
    return res.status(500).json({
      ok: false,
      error: err.message || 'Unexpected server error while loading requests.',
    });
  }
});

/**
 * POST /api/major-minor-requests/:requestId/approve
 * Approve a major/minor request.
 * 
 * Body: (optional) { denialReason } - not used for approval but kept for consistency
 * 
 * Returns:
 * {
 *   ok: true,
 *   message: 'Request approved successfully'
 * }
 */
router.post('/:requestId/approve', async (req, res) => {
  const { userId, role } = getUserInfo(req);

  // Case-insensitive role check
  const normalizedRole = role ? String(role).trim() : '';
  if (normalizedRole.toLowerCase() !== 'advisor') {
    return res.status(403).json({
      ok: false,
      error: 'Only advisors can approve requests.',
    });
  }

  const { requestId } = req.params;
  const db = req.db;
  const client = await db.connect();

  try {
    await client.query('BEGIN');

    // 1) Get the request
    const requestRes = await client.query(
      `
      SELECT
        mmr.request_id,
        mmr.student_id,
        mmr.program_id,
        mmr.request_type,
        mmr.effective_term_id,
        mmr.status,
        p.type AS program_type
      FROM major_minor_requests mmr
      JOIN programs p ON p.program_id = mmr.program_id
      WHERE mmr.request_id = $1
      `,
      [requestId]
    );

    if (requestRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        ok: false,
        error: 'Request not found.',
      });
    }

    const request = requestRes.rows[0];

    if (request.status !== 'pending') {
      await client.query('ROLLBACK');
      return res.status(400).json({
        ok: false,
        error: `Request is already ${request.status}.`,
      });
    }

    // 2) Check if advisor can approve this request
    // If using role override (for testing), allow approval
    const isRoleOverride = !!req.headers['x-role-override'];
    let canApprove = false;
    
    if (isRoleOverride) {
      canApprove = true; // Allow when using role override for testing
    } else {
      canApprove = await canAdvisorApprove(db, userId, request.program_id);
    }
    
    if (!canApprove) {
      await client.query('ROLLBACK');
      return res.status(403).json({
        ok: false,
        error: 'You do not have permission to approve requests for this program.',
      });
    }

    // 3) For DECLARE requests, check limits before approving
    if (request.request_type === 'DECLARE') {
      // Count current majors/minors
      const countRes = await client.query(
        `
        SELECT p.type AS program_type, COUNT(*)::int AS cnt
        FROM student_programs sp
        JOIN programs p ON p.program_id = sp.program_id
        WHERE sp.student_id = $1
        GROUP BY p.type
        `,
        [request.student_id]
      );

      let majorCount = 0;
      let minorCount = 0;

      for (const row of countRes.rows) {
        if (row.program_type === 'MAJOR') majorCount = row.cnt;
        if (row.program_type === 'MINOR') minorCount = row.cnt;
      }

      if (request.program_type === 'MAJOR' && majorCount >= 2) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          ok: false,
          error: 'Student already has the maximum of 2 majors.',
        });
      }

      if (request.program_type === 'MINOR' && minorCount >= 3) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          ok: false,
          error: 'Student already has the maximum of 3 minors.',
        });
      }

      // Check if already declared (shouldn't happen, but double-check)
      const existingRes = await client.query(
        `
        SELECT 1
        FROM student_programs
        WHERE student_id = $1 AND program_id = $2
        LIMIT 1
        `,
        [request.student_id, request.program_id]
      );

      if (existingRes.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          ok: false,
          error: 'Student has already declared this program.',
        });
      }

      // 4) Ensure student record exists in students table
      // student_programs.student_id has a foreign key constraint to students.user_id
      const studentCheck = await client.query(
        `
        SELECT 1 FROM students WHERE user_id = $1
        `,
        [request.student_id]
      );

      if (studentCheck.rows.length === 0) {
        // Create student record if it doesn't exist
        try {
          await client.query(
            `
            INSERT INTO students (user_id)
            VALUES ($1)
            `,
            [request.student_id]
          );
        } catch (insertErr) {
          // If insert fails (e.g., foreign key to users fails), rollback
          await client.query('ROLLBACK');
          console.error('[major-minor-requests/:requestId/approve] Failed to create student record:', insertErr);
          return res.status(400).json({
            ok: false,
            error: `Student record does not exist and could not be created. User ID ${request.student_id} may not exist in users table.`,
          });
        }
      }

      // 5) Insert into student_programs
      // Note: kind column is required and should match program type (MAJOR/MINOR)
      await client.query(
        `
        INSERT INTO student_programs (student_id, program_id, kind)
        VALUES ($1, $2, $3::program_type)
        `,
        [request.student_id, request.program_id, request.program_type]
      );
    } else if (request.request_type === 'DROP') {
      // 6) For DROP requests, remove from student_programs
      const deleteRes = await client.query(
        `
        DELETE FROM student_programs
        WHERE student_id = $1 AND program_id = $2
        RETURNING 1
        `,
        [request.student_id, request.program_id]
      );

      if (deleteRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          ok: false,
          error: 'Student has not declared this program.',
        });
      }
    }

    // 7) Update request status
    await client.query(
      `
      UPDATE major_minor_requests
      SET status = 'approved',
          approved_by = $1,
          approved_at = NOW()
      WHERE request_id = $2
      `,
      [userId, requestId]
    );

    await client.query('COMMIT');

    return res.json({
      ok: true,
      message: `Request ${request.request_type === 'DECLARE' ? 'approved' : 'approved and program dropped'} successfully.`,
    });
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {
      // ignore
    }
    console.error('[major-minor-requests/:requestId/approve] error:', err);

    // Handle constraint violations
    if (err.code === '23514') {
      return res.status(400).json({
        ok: false,
        error: 'Cannot approve: student would exceed maximum majors/minors.',
      });
    }

    return res.status(500).json({
      ok: false,
      error: err.message || 'Unexpected server error while approving request.',
    });
  } finally {
    client.release();
  }
});

/**
 * POST /api/major-minor-requests/:requestId/deny
 * Deny a major/minor request.
 * 
 * Body: { denialReason? } - Optional reason for denial
 * 
 * Returns:
 * {
 *   ok: true,
 *   message: 'Request denied successfully'
 * }
 */
router.post('/:requestId/deny', async (req, res) => {
  const { userId, role } = getUserInfo(req);

  // Case-insensitive role check
  const normalizedRole = role ? String(role).trim() : '';
  if (normalizedRole.toLowerCase() !== 'advisor') {
    return res.status(403).json({
      ok: false,
      error: 'Only advisors can deny requests.',
    });
  }

  const { requestId } = req.params;
  const { denialReason } = req.body;
  const db = req.db;
  const client = await db.connect();

  try {
    await client.query('BEGIN');

    // 1) Get the request
    const requestRes = await client.query(
      `
      SELECT request_id, program_id, status
      FROM major_minor_requests
      WHERE request_id = $1
      `,
      [requestId]
    );

    if (requestRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        ok: false,
        error: 'Request not found.',
      });
    }

    const request = requestRes.rows[0];

    if (request.status !== 'pending') {
      await client.query('ROLLBACK');
      return res.status(400).json({
        ok: false,
        error: `Request is already ${request.status}.`,
      });
    }

    // 2) Check if advisor can deny this request (same permission as approve)
    // If using role override (for testing), allow denial
    const isRoleOverride = !!req.headers['x-role-override'];
    let canApprove = false;
    
    if (isRoleOverride) {
      canApprove = true; // Allow when using role override for testing
    } else {
      canApprove = await canAdvisorApprove(db, userId, request.program_id);
    }
    
    if (!canApprove) {
      await client.query('ROLLBACK');
      return res.status(403).json({
        ok: false,
        error: 'You do not have permission to deny requests for this program.',
      });
    }

    // 3) Update request status
    await client.query(
      `
      UPDATE major_minor_requests
      SET status = 'denied',
          denied_by = $1,
          denied_at = NOW(),
          denial_reason = $2
      WHERE request_id = $3
      `,
      [userId, denialReason || null, requestId]
    );

    await client.query('COMMIT');

    return res.json({
      ok: true,
      message: 'Request denied successfully.',
    });
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {
      // ignore
    }
    console.error('[major-minor-requests/:requestId/deny] error:', err);
    return res.status(500).json({
      ok: false,
      error: err.message || 'Unexpected server error while denying request.',
    });
  } finally {
    client.release();
  }
});

export default router;

