/**
 * @file academicCalendarRoutes.js
 * @description This file defines the Express router for handling academic calendar imports.
 * It exposes an API endpoint for uploading a YAML file containing academic calendar data.
 * @requires express - Fast, unopinionated, minimalist web framework for Node.js.
 * @requires multer - Middleware for handling `multipart/form-data`, used for file uploads.
 * @requires js-yaml - Library to parse YAML files.
 * @requires ./academicCalendarModel.js - The model functions for the Academic Calendar concept.
 */

import express from "express";
import multer from "multer";
import yaml from "js-yaml";
import { importAcademicCalendar } from "./academicCalendarModel.js";

const router = express.Router();

/**
 * @description Middleware for handling file uploads in memory.
 * `multer` without any storage options will store the uploaded file in a buffer.
 */
const upload = multer();

/**
 * @route POST /api/import/academic-calendar
 * @description Handles the upload and import of an academic calendar YAML file.
 *
 * This endpoint expects a `multipart/form-data` request with a single file field named "file".
 * It performs the following steps:
 * 1. Receives the uploaded file using `multer`.
 * 2. Reads the file buffer and parses it as YAML.
 * 3. Calls the `importAcademicCalendar` model function to persist the data.
 * 4. Returns a success or error response based on the outcome.
 *
 * @param {string} path - The URL path for the route.
 * @param {Function} middleware - `multer` middleware to process the file upload.
 * @param {Function} handler - The Express request handler function.
 *
 * @returns {object} 200 - Success response with a confirmation message and the new calendar's ID.
 * @returns {object} 400 - Error response if no file is uploaded or the YAML is invalid.
 * @returns {object} 409 - Conflict response if the academic calendar for that term already exists.
 * @returns {object} 500 - Server error response for database connection issues or other failures.
 */
router.post("/", upload.single("file"), async (req, res) => {
  try {
    // 1. Validate file upload
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    // 2. Parse YAML from buffer
    const yamlText = req.file.buffer.toString("utf8");
    let data;
    try {
      data = yaml.load(yamlText);
    } catch (e) {
      return res.status(400).json({ error: "Invalid YAML file" });
    }

    // 3. Ensure database connection is available
    if (!req.db) {
      return res.status(500).json({ error: "Database connection not found" });
    }

    // 4. Call model function to import data
    const result = await importAcademicCalendar(req.db, data);

    // Handle specific errors from the model (e.g., conflict)
    if (result.error) {
      return res.status(409).json({ error: result.error });
    }

    // 5. Send success response
    res.json({
      message: `Academic calendar for ${result.term.semester} ${result.term.year} imported successfully`,
      id: result.id,
    });
  } catch (err) {
    console.error("YAML import error:", err);
    res.status(500).json({ error: "Server error importing YAML file" });
  }
});

export default router;
