/**
 * @file importUserRoutes.js
 * @description Express router for importing users into SAM.
 */

import express from 'express';
import multer from 'multer';
import yaml from 'js-yaml';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { importUsers } from './userModel.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// File upload config
const upload = multer({
  dest: path.join(__dirname, '..', 'uploads'),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
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

    const results = await importUsers(req.db, parsed);

    const {
      registrars = [],
      academic_advisors = [],
      instructors = [],
      students = []
    } = parsed;

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
