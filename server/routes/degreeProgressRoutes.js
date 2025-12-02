/**
 * @file degreeProgressRoutes.js
 * @description Express routes for degree progress tracking and requirements.
 * Handles:
 *   - Calculate degree progress for a student
 *   - Get degree requirements
 *   - Check requirement completion status
 */

import { Router } from 'express';

const router = Router();

/**
 * GET /students/:student_id/degree-progress
 * Calculate degree progress for a student's declared programs.
 * 
 * Query params:
 *   - program_id: Optional specific program to check
 * 
 * @route GET /students/:student_id/degree-progress
 * @returns {Object} 200 - Degree progress information
 * @returns {Object} 500 - Query failure
 */
router.get('/students/:student_id/degree-progress', async (req, res) => {
  try {
    const { student_id } = req.params;
    const { program_id } = req.query;

    // Get student's declared programs
    let programsSql = `
      SELECT
        sp.program_id,
        sp.kind::text AS program_kind,
        p.code,
        p.name,
        p.type::text AS program_type
      FROM student_programs sp
      JOIN programs p ON p.program_id = sp.program_id
      WHERE sp.student_id = $1
    `;

    const programsParams = [student_id];
    if (program_id) {
      programsSql += ` AND sp.program_id = $2`;
      programsParams.push(program_id);
    }

    programsSql += ` ORDER BY sp.declared_at DESC`;

    const programsResult = await req.db.query(programsSql, programsParams);

    if (programsResult.rows.length === 0) {
      return res.json({
        ok: true,
        message: 'No declared programs found',
        programs: []
      });
    }

    // Get student's completed courses
    const transcriptSql = `
      SELECT
        c.subject,
        c.course_num,
        c.credits,
        e.grade::text AS grade,
        e.gpnc
      FROM enrollments e
      JOIN class_sections cs ON cs.class_id = e.class_id
      JOIN courses c ON c.course_id = cs.course_id
      WHERE e.student_id = $1 
        AND e.grade IS NOT NULL
        AND e.grade NOT IN ('W', 'WP', 'WF', 'WU', 'I', 'IP', 'NR', 'MG', 'DFR')
    `;

    const transcriptResult = await req.db.query(transcriptSql, [student_id]);

    const completedCourses = transcriptResult.rows.map(row => ({
      subject: row.subject,
      courseNum: row.course_num,
      courseCode: `${row.subject}${row.course_num}`,
      credits: parseFloat(row.credits),
      grade: row.grade,
      gpnc: row.gpnc
    }));

    // For each program, get degree requirements and calculate progress
    const progressResults = await Promise.all(
      programsResult.rows.map(async (program) => {
        // Get degree requirements for this program
        const reqSql = `
          SELECT
            dr.id,
            dr.subject,
            dr.degree_type,
            dr.program_type,
            dr.effective_term,
            dr.admission_requirements,
            dr.degree_requirements
          FROM degree_requirements dr
          WHERE dr.subject = (
            SELECT SUBSTRING(p.code FROM 1 FOR 3) FROM programs p WHERE p.program_id = $1
          )
          AND dr.degree_type = (
            SELECT CASE 
              WHEN p.type = 'MAJOR' THEN 'BS'
              WHEN p.type = 'MINOR' THEN 'MINOR'
              ELSE 'BS'
            END
            FROM programs p WHERE p.program_id = $1
          )
          ORDER BY dr.id DESC
          LIMIT 1
        `;

        const reqResult = await req.db.query(reqSql, [program.program_id]);

        if (reqResult.rows.length === 0) {
          return {
            programId: program.program_id,
            programCode: program.code,
            programName: program.name,
            programKind: program.program_kind,
            error: 'Degree requirements not found for this program'
          };
        }

        const requirements = reqResult.rows[0].degree_requirements;
        const admissionReqs = reqResult.rows[0].admission_requirements;

        // Calculate progress (simplified - would need more complex logic for full requirements)
        const totalCredits = completedCourses.reduce((sum, c) => sum + c.credits, 0);

        return {
          programId: program.program_id,
          programCode: program.code,
          programName: program.name,
          programKind: program.program_kind,
          totalCredits,
          completedCourses: completedCourses.length,
          requirements: requirements,
          admissionRequirements: admissionReqs
        };
      })
    );

    return res.json({
      ok: true,
      programs: progressResults
    });
  } catch (e) {
    console.error('[degree] /degree-progress failed:', e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * GET /degree-requirements/:program_id
 * Get degree requirements for a specific program.
 * 
 * @route GET /degree-requirements/:program_id
 * @returns {Object} 200 - Degree requirements
 * @returns {Object} 404 - Requirements not found
 */
router.get('/degree-requirements/:program_id', async (req, res) => {
  try {
    const { program_id } = req.params;

    // Get program info
    const programSql = `
      SELECT
        p.program_id,
        p.code,
        p.name,
        p.type::text AS program_type,
        d.code AS department_code
      FROM programs p
      LEFT JOIN departments d ON d.department_id = p.department_id
      WHERE p.program_id = $1
    `;

    const programResult = await req.db.query(programSql, [program_id]);

    if (programResult.rows.length === 0) {
      return res.status(404).json({ 
        ok: false, 
        error: 'Program not found' 
      });
    }

    const program = programResult.rows[0];
    const subject = program.department_code || program.code.substring(0, 3);

    // Get degree requirements
    const reqSql = `
      SELECT
        dr.id,
        dr.subject,
        dr.degree_type,
        dr.program_type,
        dr.effective_term,
        dr.admission_requirements,
        dr.degree_requirements
      FROM degree_requirements dr
      WHERE dr.subject = $1
      ORDER BY dr.id DESC
      LIMIT 1
    `;

    const reqResult = await req.db.query(reqSql, [subject]);

    if (reqResult.rows.length === 0) {
      return res.status(404).json({ 
        ok: false, 
        error: 'Degree requirements not found for this program' 
      });
    }

    const requirements = reqResult.rows[0];

    return res.json({
      ok: true,
      program: {
        id: program.program_id,
        code: program.code,
        name: program.name,
        type: program.program_type.toLowerCase()
      },
      requirements: {
        effectiveTerm: requirements.effective_term,
        admissionRequirements: requirements.admission_requirements,
        degreeRequirements: requirements.degree_requirements
      }
    });
  } catch (e) {
    console.error('[degree] /degree-requirements failed:', e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

export default router;

