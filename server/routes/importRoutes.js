/**
 * @file importRoutes.js
 * @description Express router for importing academic data into SAM.
 * Routes include automated scraping of the Stony Brook University
 * Undergraduate Catalog for course data via catalogScraper.js.
 */

import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { scrapeCatalog } from '../services/catalogScraper.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

router.post('/catalog', async (req, res) => {
  const { term, subjects } = req.body;

  console.log(`[API] Import request received → term=${term}, subjects=${subjects}`);

  if (typeof term !== 'string' || !Array.isArray(subjects) || subjects.length === 0) {
    return res.status(400).json({
      status: 'error',
      error: 'Invalid request. Expected { term: string, subjects: string[] }.',
    });
  }

  try {
    const start = Date.now();
    const data = await scrapeCatalog(term, subjects);
    const duration = ((Date.now() - start) / 1000).toFixed(2);
    const totalCourses = data.reduce((sum, s) => sum + (s.count || 0), 0);

    // --- MODIFIED LINE ---
    // Go UP one level (..) from '__dirname' (which is /routes) to save in /server
    const outputPath = path.join(__dirname, '..', 'scraped_courses.json');
    fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));
    // ---------------------

    data.forEach((s) => {
      console.log(`[API] ${s.subject}: ${s.count} courses scraped`);
    });

    console.log(`[API] Import completed → total=${totalCourses}, duration=${duration}s`);
    console.log(`[API] Data saved to: ${outputPath}`);

    return res.status(200).json({
      status: 'success',
      imported: totalCourses,
      subjects,
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
