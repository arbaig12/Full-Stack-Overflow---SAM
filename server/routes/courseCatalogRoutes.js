
import { Router } from 'express';
import { scrapeCatalog } from '../services/catalogScraper.js';

const router = Router();

/**
 * Parse a term label like "Fall 2025" or "Fall2025"
 * → { semester: 'Fall', year: 2025 } or null if invalid.
 */
function parseTermLabel(termLabel) {
  if (!termLabel) return null;
  const clean = termLabel.replace(/\s+/g, '');
  const m = clean.match(/^(Spring|Summer|Fall)(\d{4})$/i);
  if (!m) return null;
  const semester = m[1][0].toUpperCase() + m[1].slice(1).toLowerCase(); // "Fall"
  const year = Number(m[2]);
  if (!year) return null;
  return { semester, year };
}

/**
 * Get or create a term row and return term_id.
 */
async function getOrCreateTerm(db, { semester, year }) {
  const existing = await db.query(
    `SELECT term_id FROM terms WHERE semester = $1 AND year = $2`,
    [semester, year]
  );
  if (existing.rows.length > 0) return existing.rows[0].term_id;

  const inserted = await db.query(
    `INSERT INTO terms (semester, year)
     VALUES ($1, $2)
     RETURNING term_id`,
    [semester, year]
  );
  return inserted.rows[0].term_id;
}

/**
 * Get or create a department for a subject code (CSE, AMS, etc).
 * Attaches to college_id = 1 for now.
 */
async function getOrCreateDepartment(db, subjectCode) {
  const existing = await db.query(
    `SELECT department_id FROM departments WHERE code = $1`,
    [subjectCode]
  );
  if (existing.rows.length > 0) return existing.rows[0].department_id;

  const name = `${subjectCode} Department`;
  const collegeId = 1; // assume CEAS = 1 from seed
  const inserted = await db.query(
    `INSERT INTO departments (college_id, name, code)
     VALUES ($1, $2, $3)
     RETURNING department_id`,
    [collegeId, name, subjectCode]
  );
  return inserted.rows[0].department_id;
}

/**
 * Parse numeric credits from text like "3 credits" or "0-4 credits".
 */
function parseCredits(creditsText) {
  if (!creditsText) return 0;
  const m = creditsText.match(/(\d+(\.\d+)?)/);
  if (!m) return 0;
  return Number(m[1]);
}

/**
 * POST /scrape
 * Run the SBU catalog scraper and upsert into "courses".
 *
 * Body (optional):
 *   {
 *     "term": "Fall2025",      // or "Fall 2025"
 *     "subjects": ["CSE","AMS","MAT"]
 *   }
 *
 * If omitted, defaults to Fall2025 and ['CSE','AMS'].
 *
 * Mounted at /api/catalog, so full path is:
 *   POST /api/catalog/scrape
 */
router.post('/scrape', async (req, res) => {
  try {
    const db = req.db;

    // In future: check req.user.role === 'Registrar'
    const body = req.body || {};
    const termLabel = body.term || 'Fall2025';
    const parsed = parseTermLabel(termLabel);

    if (!parsed) {
      return res.status(400).json({
        ok: false,
        error: `Invalid term format '${termLabel}'. Use like 'Fall 2025' or 'Fall2025'.`
      });
    }

    const subjects =
      Array.isArray(body.subjects) && body.subjects.length > 0
        ? body.subjects
        : null;

    const { semester, year } = parsed;
    const catalogTermId = await getOrCreateTerm(db, { semester, year });

    // Run puppeteer/axios/cheerio scraper
    const scrapeResults = await scrapeCatalog(termLabel, subjects);

    let upserted = 0;

    for (const subjectBlock of scrapeResults) {
      const subjectCode = subjectBlock.subject; // e.g. "CSE"
      const departmentId = await getOrCreateDepartment(db, subjectCode);

      for (const course of subjectBlock.courses) {
        // course.title looks like "CSE 214: Data Structures"
        let subject = subjectCode;
        let courseNum = null;
        const codeMatch = course.title.match(/^([A-Z]{2,4})\s*(\d{3})/);
        if (codeMatch) {
          subject = codeMatch[1];
          courseNum = codeMatch[2];
        } else {
          // Fallback: guess a 3-digit number
          courseNum = course.title.match(/(\d{3})/)?.[1] || '000';
        }

        const credits = parseCredits(course.credits);
        const title = course.title;
        const description = course.description || '';

        const prerequisites = course.prereq || '';
        const corequisites = course.coreq || '';
        const antiRequisites = course.anti_req || '';
        const advisoryPrerequisites = course.advisory_prereq || '';
        const sbc = course.sbc || '';

        // Upsert into courses by (subject, course_num, catalog_term_id)
        await db.query(
          `
          INSERT INTO courses (
            department_id,
            subject,
            course_num,
            title,
            description,
            credits,
            catalog_term_id,
            prerequisites,
            corequisites,
            anti_requisites,
            advisory_prerequisites,
            sbc
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
          ON CONFLICT (subject, course_num, catalog_term_id)
          DO UPDATE SET
            department_id          = EXCLUDED.department_id,
            title                  = EXCLUDED.title,
            description            = EXCLUDED.description,
            credits                = EXCLUDED.credits,
            prerequisites          = EXCLUDED.prerequisites,
            corequisites           = EXCLUDED.corequisites,
            anti_requisites        = EXCLUDED.anti_requisites,
            advisory_prerequisites = EXCLUDED.advisory_prerequisites,
            sbc                    = EXCLUDED.sbc
          `,
          [
            departmentId,
            subject,
            courseNum,
            title,
            description,
            credits || 0,
            catalogTermId,
            prerequisites,
            corequisites,
            antiRequisites,
            advisoryPrerequisites,
            sbc
          ]
        );

        upserted += 1;
      }
    }

    return res.json({
      ok: true,
      term: `${semester} ${year}`,
      catalogTermId,
      subjects,
      upserted
    });
  } catch (e) {
    console.error('[catalog] POST /scrape failed:', e);
    return res.status(500).json({ ok: false, error: 'Scrape failed' });
  }
});

/**
 * GET /courses
 * Get courses with optional filters.
 * 
 * Query params:
 *   - term_id: Filter by term ID (if not provided, uses nearest available term catalog)
 *   - subject: Filter by subject code (e.g., "CSE")
 *   - course_num: Filter by course number
 *   - search: Search in title/description
 *   - department_id: Filter by department
 *   - sbc: Filter by SBC designation (e.g., "TECH", "WRT", "QPS")
 * 
 * @route GET /courses
 * @returns {Object} 200 - List of courses
 * @returns {Object} 500 - Query failure
 */
router.get('/courses', async (req, res) => {
  try {
    const { term_id, subject, course_num, search, department_id, sbc } = req.query;

    // Helper function to generate Classie URL
    const generateClassieUrl = (subject, courseNum) => {
      if (subject && courseNum) {
        return `https://classie-evals.stonybrook.edu/?SearchKeyword=${subject}${courseNum}&SearchTerm=ALL`;
      }
      return null;
    };

    let sql = `
      SELECT
        c.course_id,
        c.subject,
        c.course_num,
        c.title,
        c.description,
        c.credits,
        c.department_id,
        d.name AS department_name,
        d.code AS department_code,
        c.catalog_term_id,
        t.semester::text AS catalog_semester,
        t.year AS catalog_year,
        COALESCE(c.prerequisites, '') AS prerequisites,
        COALESCE(c.corequisites, '') AS corequisites,
        COALESCE(c.anti_requisites, '') AS anti_requisites,
        COALESCE(c.advisory_prerequisites, '') AS advisory_prerequisites,
        COALESCE(c.sbc, '') AS sbc
      FROM courses c
      JOIN departments d ON d.department_id = c.department_id
      JOIN terms t ON t.term_id = c.catalog_term_id
   `;

    const params = [];
    const where = [];

    // If term_id is provided, check if catalog exists; if not, use nearest term (Section 3.1)
    if (term_id) {
      // First check if catalog exists for this term
      const catalogCheck = await req.db.query(
        `SELECT COUNT(*) as count FROM courses WHERE catalog_term_id = $1`,
        [term_id]
      );
      
      if (parseInt(catalogCheck.rows[0].count) === 0) {
        // No catalog for this term - find nearest term catalog by date (Section 3.1 requirement)
        // Get the requested term's year and semester to find nearest
        const requestedTerm = await req.db.query(
          `SELECT year, semester::text AS semester FROM terms WHERE term_id = $1`,
          [term_id]
        );
        
        if (requestedTerm.rows.length > 0) {
          const reqYear = requestedTerm.rows[0].year;
          const reqSemester = requestedTerm.rows[0].semester;
          
          // Find nearest term catalog by comparing year and semester
          const nearestTerm = await req.db.query(`
            SELECT DISTINCT c.catalog_term_id, t.year, t.semester::text AS semester
            FROM courses c
            JOIN terms t ON t.term_id = c.catalog_term_id
            WHERE c.catalog_term_id IS NOT NULL
            ORDER BY 
              ABS(t.year - $1) ASC,
              CASE 
                WHEN t.semester::text = $2 THEN 0
                WHEN (t.semester::text = 'Fall' AND $2 = 'Spring') OR 
                     (t.semester::text = 'Spring' AND $2 = 'Fall') THEN 1
                ELSE 2
              END ASC
            LIMIT 1
          `, [reqYear, reqSemester]);
          
          if (nearestTerm.rows.length > 0) {
            const nearestTermId = nearestTerm.rows[0].catalog_term_id;
            params.push(nearestTermId);
            where.push(`c.catalog_term_id = $${params.length}`);
            // Note: In production, you might want to add a warning header or response field
          } else {
            // No catalog available at all
            return res.json({ 
              ok: true, 
              count: 0,
              courses: [],
              warning: 'No course catalog available for the requested term or any other term'
            });
          }
        } else {
          // Requested term doesn't exist - just use any available catalog
          const anyTerm = await req.db.query(`
            SELECT DISTINCT catalog_term_id 
            FROM courses 
            WHERE catalog_term_id IS NOT NULL
            LIMIT 1
          `);
          
          if (anyTerm.rows.length > 0) {
            params.push(anyTerm.rows[0].catalog_term_id);
            where.push(`c.catalog_term_id = $${params.length}`);
          } else {
            return res.json({ 
              ok: true, 
              count: 0,
              courses: [],
              warning: 'No course catalog available'
            });
          }
        }
      } else {
        // Catalog exists for requested term
        params.push(term_id);
        where.push(`c.catalog_term_id = $${params.length}`);
      }
    }

    if (subject) {
      params.push(subject.toUpperCase());
      where.push(`c.subject = $${params.length}`);
    }

    if (course_num) {
      params.push(course_num);
      where.push(`c.course_num = $${params.length}`);
    }

    if (department_id) {
      params.push(department_id);
      where.push(`c.department_id = $${params.length}`);
    }

    if (search) {
      params.push(`%${search.toLowerCase()}%`);
      where.push(`(
        LOWER(c.title) LIKE $${params.length} OR
        LOWER(c.description) LIKE $${params.length} OR
        LOWER(c.subject || c.course_num) LIKE $${params.length}
      )`);
    }

    if (sbc) {
      // SBC filter: check if the SBC string contains the requested SBC
      params.push(`%${sbc.toUpperCase()}%`);
      where.push(`UPPER(COALESCE(c.sbc, '')) LIKE $${params.length}`);
    }

    if (where.length > 0) {
      sql += ` WHERE ` + where.join(' AND ');
    }

    sql += ` ORDER BY c.subject, c.course_num`;

    const result = await req.db.query(sql, params);

    const courses = result.rows.map(row => ({
      courseId: row.course_id,
      subject: row.subject,
      courseNum: row.course_num,
      courseCode: `${row.subject}${row.course_num}`,
      title: row.title,
      description: row.description,
      credits: parseFloat(row.credits),
      prerequisites: row.prerequisites || '',
      corequisites: row.corequisites || '',
      antiRequisites: row.anti_requisites || '',
      advisoryPrerequisites: row.advisory_prerequisites || '',
      sbc: row.sbc || '',
      classieEvalsUrl: generateClassieUrl(row.subject, row.course_num),
      department: {
        id: row.department_id,
        name: row.department_name,
        code: row.department_code
      },
      catalogTerm: {
        semester: row.catalog_semester,
        year: row.catalog_year
      }
    }));

    return res.json({ 
      ok: true, 
      count: courses.length,
      courses 
    });
  } catch (e) {
    console.error('[catalog] /courses failed:', e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * GET /courses/:course_id
 * Get detailed information about a specific course.
 * Includes prerequisites, corequisites, anti-requisites, SBCs, and Classie URL.
 * 
 * @route GET /courses/:course_id
 * @returns {Object} 200 - Course details
 * @returns {Object} 404 - Course not found
 * @returns {Object} 500 - Query failure
 */
router.get('/courses/:course_id', async (req, res) => {
  try {
    const { course_id } = req.params;

    const sql = `
      SELECT
        c.course_id,
        c.subject,
        c.course_num,
        c.title,
        c.description,
        c.credits,
        c.department_id,
        d.name AS department_name,
        d.code AS department_code,
        c.catalog_term_id,
        t.semester::text AS catalog_semester,
        t.year AS catalog_year,
        COALESCE(c.prerequisites, '') AS prerequisites,
        COALESCE(c.corequisites, '') AS corequisites,
        COALESCE(c.anti_requisites, '') AS anti_requisites,
        COALESCE(c.advisory_prerequisites, '') AS advisory_prerequisites,
        COALESCE(c.sbc, '') AS sbc
      FROM courses c
      JOIN departments d ON d.department_id = c.department_id
      JOIN terms t ON t.term_id = c.catalog_term_id
      WHERE c.course_id = $1
    `;

    const result = await req.db.query(sql, [course_id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        ok: false, 
        error: 'Course not found' 
      });
    }

    const row = result.rows[0];
    
    // Generate Classie evaluations URL (Section 3.1 requirement)
    const classieEvalsUrl = `https://classie-evals.stonybrook.edu/?SearchKeyword=${row.subject}${row.course_num}&SearchTerm=ALL`;

    const course = {
      courseId: row.course_id,
      subject: row.subject,
      courseNum: row.course_num,
      courseCode: `${row.subject}${row.course_num}`,
      title: row.title,
      description: row.description,
      credits: parseFloat(row.credits),
      prerequisites: row.prerequisites || '',
      corequisites: row.corequisites || '',
      antiRequisites: row.anti_requisites || '',
      advisoryPrerequisites: row.advisory_prerequisites || '',
      sbc: row.sbc || '',
      classieEvalsUrl,
      department: {
        id: row.department_id,
        name: row.department_name,
        code: row.department_code
      },
      catalogTerm: {
        semester: row.catalog_semester,
        year: row.catalog_year
      }
    };

    return res.json({ ok: true, course });
  } catch (e) {
    console.error('[catalog] /courses/:course_id failed:', e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * GET /courses/:course_id/sections
 * Get all sections for a course in a given term.
 * 
 * Query params:
 *   - term_id: Required term ID
 * 
 * @route GET /courses/:course_id/sections
 * @returns {Object} 200 - List of sections
 * @returns {Object} 400 - Missing term_id
 * @returns {Object} 500 - Query failure
 */
router.get('/courses/:course_id/sections', async (req, res) => {
  try {
    const { course_id } = req.params;
    const { term_id } = req.query;

    if (!term_id) {
      return res.status(400).json({ 
        ok: false, 
        error: 'term_id query parameter is required' 
      });
    }

    const sql = `
      SELECT
        cs.class_id,
        cs.section_num,
        cs.capacity,
        cs.location_text,
        cs.requires_dept_permission,
        cs.notes,
        cs.instructor_id,
        COALESCE(cs.meeting_days, '') AS meeting_days,
        COALESCE(cs.meeting_times, '') AS meeting_times,
        u.first_name || ' ' || u.last_name AS instructor_name,
        u.email AS instructor_email,
        r.building,
        r.room,
        r.capacity AS room_capacity,
        COUNT(e.student_id) AS enrolled_count
      FROM class_sections cs
      LEFT JOIN users u ON u.user_id = cs.instructor_id
      LEFT JOIN rooms r ON r.room_id = cs.room_id
      LEFT JOIN enrollments e ON e.class_id = cs.class_id 
        AND e.status = 'registered'
      WHERE cs.course_id = $1 AND cs.term_id = $2
      GROUP BY cs.class_id, cs.section_num, cs.capacity, cs.location_text,
               cs.requires_dept_permission, cs.notes, cs.instructor_id,
               cs.meeting_days, cs.meeting_times,
               u.first_name, u.last_name, u.email, r.building, r.room, r.capacity
      ORDER BY cs.section_num
    `;

    const result = await req.db.query(sql, [course_id, term_id]);

    const sections = result.rows.map(row => ({
      classId: row.class_id,
      sectionNumber: row.section_num,
      capacity: row.capacity,
      enrolled: parseInt(row.enrolled_count) || 0,
      available: row.capacity - (parseInt(row.enrolled_count) || 0),
      meetingDays: row.meeting_days || '',
      meetingTimes: row.meeting_times || '',
      location: row.location_text || (row.building && row.room ? `${row.building} ${row.room}` : null),
      requiresPermission: row.requires_dept_permission,
      notes: row.notes,
      instructor: row.instructor_id ? {
        id: row.instructor_id,
        name: row.instructor_name,
        email: row.instructor_email
      } : null
    }));

    return res.json({ 
      ok: true, 
      count: sections.length,
      sections 
    });
  } catch (e) {
    console.error('[catalog] /courses/:course_id/sections failed:', e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * GET /subjects
 * Get all available subject codes.
 * 
 * @route GET /subjects
 * @returns {Object} 200 - List of subjects
 */
router.get('/subjects', async (req, res) => {
  try {
    const sql = `
      SELECT DISTINCT
        c.subject,
        d.name AS department_name
      FROM courses c
      JOIN departments d ON d.department_id = c.department_id
      ORDER BY c.subject
    `;

    const result = await req.db.query(sql);

    const subjects = result.rows.map(row => ({
      code: row.subject,
      department: row.department_name
    }));

    return res.json({ 
      ok: true, 
      count: subjects.length,
      subjects 
    });
  } catch (e) {
    console.error('[catalog] /subjects failed:', e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

export default router;
