// server/routes/studentProgramRoutes.js
import express from 'express';

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
 * GET /api/student-programs/init
 *
 * Returns:
 * {
 *   ok: true,
 *   availableMajors: [ { programId, programCode, programName, programType }, ... ],
 *   availableMinors: [ ... ],
 *   majors: [ { programId, programCode, programName, programType, declaredAt }, ... ],
 *   minors: [ ... ]
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

    const [available, current] = await Promise.all([
      loadAvailablePrograms(db),
      loadStudentPrograms(db, studentId),
    ]);

    return res.json({
      ok: true,
      ...available,
      ...current,
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
 * Body: { programId }
 *
 * Adds a major/minor for this student, respecting:
 *  - max 2 MAJOR
 *  - max 3 MINOR
 *
 * Returns:
 * {
 *   ok: true,
 *   majors: [...],
 *   minors: [...]
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

    // 3) Count current majors/minors
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

    // 4) Insert declaration (DB constraint is second line of defense)
    await client.query(
      `
      INSERT INTO student_programs (student_id, program_id)
      VALUES ($1, $2)
      `,
      [studentId, programId]
    );

    await client.query('COMMIT');

    // 5) Reload student's majors/minors to return fresh state
    const { majors, minors } = await loadStudentPrograms(db, studentId);

    return res.json({
      ok: true,
      majors,
      minors,
    });
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {
      // ignore
    }
    console.error('[student-programs/add] error:', err);

    // If a check constraint fires, map it to a friendly message
    if (err.code === '23514') {
      return res.status(400).json({
        ok: false,
        error:
          'Cannot add this program: you may have at most 2 majors and 3 minors.',
      });
    }

    return res.status(500).json({
      ok: false,
      error: err.message || 'Unexpected server error while adding program.',
    });
  } finally {
    client.release();
  }
});

/**
 * POST /api/student-programs/drop
 * Body: { programId }
 *
 * Drops the given major/minor for this student.
 *
 * Returns:
 * {
 *   ok: true,
 *   majors: [...],
 *   minors: [...]
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

  try {
    await db.query(
      `
      DELETE FROM student_programs
      WHERE student_id = $1 AND program_id = $2
      `,
      [studentId, programId]
    );

    // Reload student's majors/minors to return fresh state
    const { majors, minors } = await loadStudentPrograms(db, studentId);

    return res.json({
      ok: true,
      majors,
      minors,
    });
  } catch (err) {
    console.error('[student-programs/drop] error:', err);
    return res.status(500).json({
      ok: false,
      error: err.message || 'Unexpected server error while dropping program.',
    });
  }
});

export default router;
