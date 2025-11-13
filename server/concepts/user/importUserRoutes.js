/**
 * @file importUserRoutes.js
 * @description This file defines the Express router for importing user data into the SAM system.
 * It provides an API endpoint for registrars to upload a YAML file containing user information
 * (students, registrars, advisors, instructors) for bulk creation or update.
 * @requires express - Fast, unopinionated, minimalist web framework for Node.js.
 * @requires multer - Middleware for handling `multipart/form-data`, used for file uploads.
 * @requires js-yaml - Library to parse YAML files.
 * @requires fs - Node.js File System module for interacting with the file system.
 * @requires path - Node.js module for handling and transforming file paths.
 * @requires url - Node.js module for URL resolution and parsing.
 * @requires ./userModel.js - The model functions for the User concept, specifically `importUsers`.
 */

import express from 'express';
import multer from 'multer';
import yaml from 'js-yaml';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { importUsers } from './userModel.js';

// ES module equivalents for __filename and __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

/**
 * @description Multer configuration for handling file uploads.
 * Files are temporarily stored in the `server/uploads` directory.
 * A file size limit of 5 MB is imposed.
 */
const upload = multer({
  dest: path.join(__dirname, '..', 'uploads'), // Destination for uploaded files
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB file size limit
});

/**
 * @route POST /api/import/users
 * @description Handles the upload, parsing, and import of user data from a YAML file.
 *
 * This endpoint expects a `multipart/form-data` request with a single file field named "file".
 * It performs the following steps:
 * 1. Receives the uploaded YAML file.
 * 2. Reads the file from the temporary upload location.
 * 3. Parses the YAML content into a JavaScript object.
 * 4. Calls the `importUsers` model function to process and insert user data into the database.
 * 5. Returns a summary of the import operation, including counts of inserted/skipped users and any warnings.
 *
 * @param {object} req - The Express request object.
 * @param {object} req.file - The uploaded file object provided by Multer.
 *
 * @returns {object} 200 - Success response with a summary of the import operation.
 * @returns {object} 400 - Error response if no file is uploaded, the YAML is invalid, or the parsed data is empty.
 * @returns {object} 500 - Server error response for issues during file processing, database operations, or other unexpected errors.
 */
router.post('/', upload.single('file'), async (req, res) => {
  console.log(`[API] /api/import/users: User import request received.`);

  // 1. Validate file upload
  if (!req.file) {
    return res.status(400).json({
      status: 'error',
      error: 'No file uploaded. Expected form field name: file'
    });
  }

  try {
    const filePath = req.file.path; // Path to the temporarily uploaded file

    // 2. Read and parse YAML file
    const yamlText = fs.readFileSync(filePath, 'utf8');
    const parsed = yaml.load(yamlText);

    if (!parsed || typeof parsed !== 'object') {
      return res.status(400).json({
        status: 'error',
        error: 'YAML parsed but produced no valid data object.'
      });
    }

    // 3. Call model function to import users into the database
    const results = await importUsers(req.db, parsed);

    // Extract counts from the parsed YAML for the summary response
    const {
      registrars = [],
      academic_advisors = [],
      instructors = [],
      students = []
    } = parsed;

    // 4. Send success response with import summary
    return res.status(200).json({
      status: 'success',
      message: 'Users imported successfully.',
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
    console.error('[API] /api/import/users: YAML import error:', err);
    return res.status(500).json({
      status: 'error',
      error: err.message || 'Unexpected server error during user import.'
    });
  } finally {
    // Clean up the uploaded file after processing
    if (req.file) {
      fs.unlink(req.file.path, (err) => {
        if (err) console.error(`[API] Error deleting uploaded file: ${req.file.path}`, err);
      });
    }
  }
});

export default router;
