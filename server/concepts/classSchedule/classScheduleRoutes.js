/**
 * @file classScheduleRoutes.js
 * @description This file defines the Express router for handling class schedule operations.
 * It exposes API endpoints for importing class schedules, editing class capacities, and searching schedules.
 * @requires express - Fast, unopinionated, minimalist web framework for Node.js.
 * @requires multer - Middleware for handling `multipart/form-data`, used for file uploads.
 * @requires js-yaml - Library to parse YAML files (for room capacities).
 * @requires fs - Node.js file system module.
 * @requires path - Node.js path module.
 * @requires ../../services/pdfParser - A service to parse PDF files (placeholder for now).
 * @requires ./classScheduleModel.js - The model functions for the Class Schedule concept.
 */

import express from "express";
import multer from "multer";
import yaml from "js-yaml";
import fs from "fs";
import path from "path";
import { parsePdf } from "../../services/pdfParser.js";
import { importClassSchedule, editClassCapacity, searchClassSchedule } from "./classScheduleModel.js";

const router = express.Router();

const upload = multer(); // For handling file uploads

// Load room capacities from rooms1.yaml
let roomCapacities = {};
try {
  const roomsYamlPath = path.resolve(process.cwd(), 'project_requirements', 'rooms1.yaml');
  const roomsYaml = fs.readFileSync(roomsYamlPath, 'utf8');
  const roomsData = yaml.load(roomsYaml);
  if (roomsData && roomsData.room_capacities) {
    roomCapacities = roomsData.room_capacities;
  }
} catch (err) {
  console.error("Failed to load room_capacities from rooms1.yaml:", err);
}

/**
 * @route POST /api/class-schedule/import
 * @description Handles the upload and import of a class schedule PDF file.
 *
 * This endpoint expects a `multipart/form-data` request with a single file field named "file".
 * It performs the following steps:
 * 1. Receives the uploaded file using `multer`.
 * 2. (Placeholder) Parses the PDF to extract class data.
 * 3. Calls the `importClassSchedule` model function to persist the data.
 * 4. Returns a success or error response based on the outcome.
 *
 * @param {string} path - The URL path for the route.
 * @param {Function} middleware - `multer` middleware to process the file upload.
 * @param {Function} handler - The Express request handler function.
 *
 * @returns {object} 200 - Success response with a confirmation message.
 * @returns {object} 400 - Error response if no file is uploaded or parsing fails.
 * @returns {object} 500 - Server error response for database connection issues or other failures.
 */
router.post("/import", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    // Extract term and subjects from query parameters
    const { semester, year, subjects } = req.query;
    if (!semester || !year) {
      return res.status(400).json({ error: "Semester and year are required query parameters." });
    }
    const term = { semester, year: parseInt(year, 10) };
    const subjectList = subjects ? subjects.split(',') : []; // Optional subjects filter

    const parsedClassData = await parsePdf(req.file.buffer);

    // Filter by subjects if provided
    const filteredClassData = subjectList.length > 0
      ? parsedClassData.filter(cls => subjectList.includes(cls.course_ref.subject))
      : parsedClassData;

    if (!req.db) {
      return res.status(500).json({ error: "Database connection not found" });
    }

    const result = await importClassSchedule(req.db, term, filteredClassData, roomCapacities);

    if (result.error) {
      return res.status(500).json({ error: result.error });
    }

    res.json({
      message: `Class schedule for ${term.semester} ${term.year} imported successfully. Imported ${result.importedCount} classes.`,
      term: result.term,
    });
  } catch (err) {
    console.error("Class schedule import error:", err);
    res.status(500).json({ error: "Server error importing class schedule." });
  }
});

/**
 * @route PUT /api/class-schedule/capacity
 * @description Edits the capacity of a specific class.
 *
 * @param {string} path - The URL path for the route.
 * @param {Function} handler - The Express request handler function.
 *
 * @returns {object} 200 - Success response.
 * @returns {object} 400 - Error response if parameters are missing or invalid.
 * @returns {object} 500 - Server error response.
 */
router.put("/capacity", async (req, res) => {
  try {
    const { semester, year, courseSubject, courseNumber, sectionNum, newCapacity } = req.body;

    if (!semester || !year || !courseSubject || !courseNumber || !sectionNum || newCapacity === undefined) {
      return res.status(400).json({ error: "Missing required parameters for editing capacity." });
    }

    const term = { semester, year: parseInt(year, 10) };
    const capacity = parseInt(newCapacity, 10);

    if (isNaN(capacity) || capacity < 0) {
      return res.status(400).json({ error: "New capacity must be a non-negative number." });
    }

    if (!req.db) {
      return res.status(500).json({ error: "Database connection not found" });
    }

    const result = await editClassCapacity(req.db, term, courseSubject, courseNumber, sectionNum, capacity);

    if (result.error) {
      return res.status(500).json({ error: result.error });
    }
    if (!result.success) {
      return res.status(404).json({ error: result.message });
    }

    res.json({ message: result.message });
  } catch (err) {
    console.error("Edit class capacity error:", err);
    res.status(500).json({ error: "Server error editing class capacity." });
  }
});

/**
 * @route GET /api/class-schedule/search
 * @description Searches the class schedule based on provided filters.
 *
 * @param {string} path - The URL path for the route.
 * @param {Function} handler - The Express request handler function.
 *
 * @returns {object} 200 - Success response with an array of matching classes.
 * @returns {object} 400 - Error response if term parameters are missing.
 * @returns {object} 500 - Server error response.
 */
router.get("/search", async (req, res) => {
  try {
    const { semester, year, ...filters } = req.query;

    if (!semester || !year) {
      return res.status(400).json({ error: "Semester and year are required query parameters for search." });
    }

    const term = { semester, year: parseInt(year, 10) };

    if (!req.db) {
      return res.status(500).json({ error: "Database connection not found" });
    }

    const result = await searchClassSchedule(req.db, term, filters);

    if (result.error) {
      return res.status(500).json({ error: result.error });
    }

    res.json({ classes: result.classes });
  } catch (err) {
    console.error("Search class schedule error:", err);
    res.status(500).json({ error: "Server error searching class schedule." });
  }
});

export default router;
