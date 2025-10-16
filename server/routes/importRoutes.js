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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

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
      error: 'Invalid request. Expected { term: string, subjects: string[] }.',
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
      path: outputPath,
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
        .map((s) => ({ subject: s.subject, error: s.error })),
    });
  } catch (error) {
    console.error('[API] Import failed:', error);
    return res.status(500).json({
      status: 'error',
      error: error.message || 'Unexpected server error during catalog import.',
    });
  }
});

export default router;
