/**
 * @file courseCatalogRoutes.js
 * @description This file defines the Express router for the Course Catalog concept.
 * It provides an API endpoint for registrars to trigger the web scraping of SBU's
 * online course catalog for a specific term and set of subjects.
 * @requires express - Fast, unopinionated, minimalist web framework for Node.js.
 * @requires fs - Node.js File System module for interacting with the file system.
 * @requires path - Node.js module for handling and transforming file paths.
 * @requires url - Node.js module for URL resolution and parsing.
 * @requires ../../services/catalogScraper.js - The service responsible for the web scraping logic.
 */

import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { scrapeCatalog } from '../../services/catalogScraper.js';

// ES module equivalents for __filename and __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

/**
 * @route POST /api/import/catalog
 * @description Triggers the scraping of the SBU course catalog for a given term and subjects.
 *
 * This action is idempotent based on the term: it can only be run successfully once per term.
 * On subsequent attempts for the same term, it will return a conflict error.
 * The scraped data is saved to a JSON file in the `server/` directory, named after the term (e.g., `Fall2025_courses.json`).
 *
 * @param {object} req - The Express request object.
 * @param {object} req.body - The request body.
 * @param {string} req.body.term - The academic term to scrape (e.g., "Fall2025").
 * @param {string[]} req.body.subjects - An array of subject codes to scrape (e.g., ["CSE", "MAT"]).
 *
 * @returns {object} 200 - A success response containing statistics about the scrape, including total courses, duration, and a sample of the data.
 * @returns {object} 400 - An error response if the request body is missing `term` or `subjects`.
 * @returns {object} 409 - A conflict response if the catalog for the specified term has already been scraped.
 * @returns {object} 500 - An error response if the scraping process fails unexpectedly.
 */
router.post('/', async (req, res) => {
  const { term, subjects } = req.body;

  console.log(
    `[API] /api/import/catalog: Received request for term=${term}, subjects=${subjects}`
  );

  // 1. Validate input parameters
  if (
    typeof term !== 'string' ||
    !Array.isArray(subjects) ||
    subjects.length === 0
  ) {
    return res.status(400).json({
      status: 'error',
      error: 'Invalid request. Expected a body with { term: string, subjects: string[] }.'
    });
  }

  // 2. Enforce "scrape-once" business rule
  // The persistence for this concept is a term-specific JSON file.
  const outputPath = path.join(__dirname, '..', '..', `${term}_courses.json`);

  // Requirement 3.1: "SAM can prohibit changes to the course catalog for a given subject and term by allowing it to be scraped at most once."
  if (fs.existsSync(outputPath)) {
    console.warn(
      `[API] /api/import/catalog: Blocked attempt to re-scrape term '${term}'.`
    );
    return res.status(409).json({
      status: 'conflict',
      error: `The course catalog for term '${term}' has already been imported and cannot be changed.`,
      path: outputPath
    });
  }

  try {
    // 3. Execute the scraping process
    const start = Date.now();
    const data = await scrapeCatalog(term, subjects);
    const duration = ((Date.now() - start) / 1000).toFixed(2);
    const totalCourses = data.reduce((sum, s) => sum + (s.count || 0), 0);

    // 4. Persist the scraped data to the file system
    // Requirement 3: "If a class schedule for the same term was previously imported, the old data is dropped before the new data is imported."
    // fs.writeFileSync handles this by overwriting the file if it exists, though our check above prevents this.
    fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));

    data.forEach((s) => {
      console.log(`[API] /api/import/catalog: ${s.subject} -> ${s.count} courses scraped.`);
    });

    console.log(
      `[API] /api/import/catalog: Import complete. Total=${totalCourses}, Duration=${duration}s`
    );
    console.log(`[API] /api/import/catalog: Data for term '${term}' saved to: ${outputPath}`);

    // 5. Return a detailed success response
    return res.status(200).json({
      status: 'success',
      message: `Successfully scraped ${totalCourses} courses for term ${term}.`,
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
    console.error('[API] /api/import/catalog: Scraping process failed:', error);
    return res.status(500).json({
      status: 'error',
      error: error.message || 'Unexpected server error during catalog import.'
    });
  }
});

export default router;
