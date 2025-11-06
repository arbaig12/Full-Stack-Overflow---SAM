/**
 * @file importRoutes.js
 * @description Express router for importing academic data into SAM, adhering to
 * term-based import and scrape-once rules.
 */

import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { scrapeCatalog } from '../services/catalogScraper.js';
import multer from 'multer';
import yaml from 'js-yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// File upload config
const upload = multer({
  dest: path.join(__dirname, '..', 'uploads'),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
});

/**
 * POST /catalog
 * Imports course catalog data for a specific term and subjects.
 *
 * @route POST /catalog
 * @param {Object} req.body - Request body.
 * @param {string} req.body.term - Academic term (e.g., "Fall2025").
 * @param {string[]} req.body.subjects - Array of subject codes to scrape.
 * @returns {Object} 200 - Success response with import details.
 * @returns {Object} 400 - Invalid request parameters.
 * @returns {Object} 409 - Conflict - term already imported.
 * @returns {Object} 500 - Server error during import.
 */
router.post('/catalog', async (req, res) => {
  const { term, subjects } = req.body;

  console.log(
    `[API] Import request received → term=${term}, subjects=${subjects}`
  );

  if (
    typeof term !== 'string' ||
    !Array.isArray(subjects) ||
    subjects.length === 0
  ) {
    return res.status(400).json({
      status: 'error',
      error: 'Invalid request. Expected { term: string, subjects: string[] }.'
    });
  }

  // Define a term-specific path for the output file
  const outputPath = path.join(__dirname, '..', `${term}_courses.json`);

  // Requirement: Prohibit changes by scraping at most once
  if (fs.existsSync(outputPath)) {
    console.warn(
      `[API] Import blocked: Catalog for term '${term}' has already been scraped.`
    );
    return res.status(409).json({
      status: 'conflict',
      error: `The course catalog for term '${term}' has already been imported and cannot be changed.`,
      path: outputPath
    });
  }

  try {
    const start = Date.now();
    const data = await scrapeCatalog(term, subjects);
    const duration = ((Date.now() - start) / 1000).toFixed(2);
    const totalCourses = data.reduce((sum, s) => sum + (s.count || 0), 0);

    // Requirement: old data is dropped before new data is imported.
    // fs.writeFileSync handles this by overwriting the file.
    fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));

    data.forEach((s) => {
      console.log(`[API] ${s.subject}: ${s.count} courses scraped`);
    });

    console.log(
      `[API] Import completed → total=${totalCourses}, duration=${duration}s`
    );
    console.log(`[API] Data for term '${term}' saved to: ${outputPath}`);

    return res.status(200).json({
      status: 'success',
      imported: totalCourses,
      subjects,
      term,
      duration: `${duration}s`,
      sample: data[0]?.courses?.slice(0, 3) || [],
      errors: data
        .filter((s) => s.error)
        .map((s) => ({ subject: s.subject, error: s.error }))
    });
  } catch (error) {
    console.error('[API] Import failed:', error);
    return res.status(500).json({
      status: 'error',
      error: error.message || 'Unexpected server error during catalog import.'
    });
  }
});


/**
 * POST /users
 * Uploads a YAML file describing students / registrars / advisors / instructors,
 * parses it, and inserts data into DB.
 *
 * @route POST /users
 * @returns {Object} 200 - Success + summary
 * @returns {Object} 400 - Invalid file or format
 * @returns {Object} 500 - Error during processing or DB insert
 */
router.post('/users', upload.single('file'), async (req, res) => {
  console.log(`[API] User import request received`);

  if (!req.file) {
    return res.status(400).json({
      status: 'error',
      error: 'No file uploaded. Expected form field name: file'
    });
  }

  try {
    const filePath = req.file.path;

    // Read YAML file
    const yamlText = fs.readFileSync(filePath, 'utf8');
    const parsed = yaml.load(yamlText);

    if (!parsed || typeof parsed !== 'object') {
      return res.status(400).json({
        status: 'error',
        error: 'YAML parsed but produced no valid data object.'
      });
    }

    const {
      registrars = [],
      academic_advisors = [],
      instructors = [],
      students = []
    } = parsed;

    console.log('[YAML] Loaded:');
    console.log(`• registrars: ${registrars.length}`);
    console.log(`• academic_advisors: ${academic_advisors.length}`);
    console.log(`• instructors: ${instructors.length}`);
    console.log(`• students: ${students.length}`);

    const results = {
      inserted: 0,
      skipped: 0,
      warnings: [],
    };

    /**
     * Inserts a user into `users` only.
     * @returns user_id or null if skipped
     */
    async function insertUser(obj, role) {
      const { SBU_ID, first_name, last_name, email } = obj;

      if (!SBU_ID || !email || !first_name || !last_name) {
        results.skipped++;
        results.warnings.push(`Missing fields for SBU_ID=${SBU_ID ?? '(none)'}`);
        return null;
      }

      // Check for existing
      const check = await req.db.query(
        `SELECT user_id FROM users WHERE sbu_id = $1`,
        [SBU_ID]
      );

      if (check.rows.length > 0) {
        results.skipped++;
        results.warnings.push(`User already exists: SBU_ID=${SBU_ID}`);
        return check.rows[0].user_id;
      }

      // Insert user
      const r = await req.db.query(
        `INSERT INTO users (sbu_id, first_name, last_name, email, role)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING user_id`,
        [SBU_ID, first_name, last_name, email, role]
      );

      results.inserted++;
      return r.rows[0].user_id;
    }

    //
    // INSERT USERS
    //
    for (const r of registrars) {
      await insertUser(r, 'Registrar');
    }
    for (const a of academic_advisors) {
      await insertUser(a, 'Advisor');
    }
    for (const i of instructors) {
      await insertUser(i, 'Instructor');
    }
    for (const s of students) {
      await insertUser(s, 'Student');
    }

    return res.status(200).json({
      status: 'success',
      message: 'Users imported',
      summary: {
        inserted: results.inserted,
        skipped: results.skipped,
        warnings: results.warnings,
        counts: {
          registrars: registrars.length,
          academic_advisors: academic_advisors.length,
          instructors: instructors.length,
          students: students.length
        }
      }
    });
  } catch (err) {
    console.error('[YAML IMPORT ERROR]', err);
    return res.status(500).json({
      status: 'error',
      error: err.message || 'Unexpected server error during user import.'
    });
  }
});


export default router;
