/**
 * @file index.js
 * @description This file is the main entry point for the SBU Academics Management (SAM) backend server.
 * It initializes the Express application, sets up middleware, establishes a connection
 * to the PostgreSQL database, and mounts the concept-based API routes.
 * @requires express - Fast, unopinionated, minimalist web framework for Node.js.
 * @requires cors - Middleware for enabling Cross-Origin Resource Sharing.
 * @requires morgan - HTTP request logger middleware.
 * @requires dotenv - Module to load environment variables from a .env file.
 * @requires pg - Node.js PostgreSQL client.
 */

import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';
import pkg from 'pg';

// Route imports from concept-based modules
import userRoutes from './concepts/user/userRoutes.js';
import importUserRoutes from './concepts/user/importUserRoutes.js';
import courseCatalogRoutes from './concepts/courseCatalog/courseCatalogRoutes.js';
import degreeRequirementRoutes from './concepts/degreeRequirement/degreeRequirementRoutes.js';
import academicProgramRoutes from './concepts/academicProgram/academicProgramRoutes.js';
import waiverRoutes from './concepts/waiver/waiverRoutes.js';
import registrationHoldRoutes from './concepts/registrationHold/registrationHoldRoutes.js';
import studentProfileRoutes from './concepts/studentProfile/studentProfileRoutes.js';
import academicCalendarRoutes from './concepts/academicCalendar/academicCalendarRoutes.js';

// Load environment variables from .env file
dotenv.config();

const { Pool } = pkg;
const app = express();

// --- Configuration ---
const PORT = process.env.PORT || 4000;
const ENV  = process.env.NODE_ENV || 'development';

// --- Database Connection ---
/**
 * @description PostgreSQL connection pool.
 * The pool is configured using the DATABASE_URL from environment variables.
 * It includes an error handler to log unexpected errors on idle clients and exit the process.
 * @type {import('pg').Pool}
 */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Example of SSL configuration for production environments:
  // ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});
pool.on('error', (err) => {
  console.error('[DB] Unexpected idle client error:', err);
  process.exit(1);
});

// --- Core Middleware ---
app.use(cors({ origin: 'http://localhost:3000', credentials: true }));
app.use(express.json()); // Parses incoming requests with JSON payloads.
app.use(morgan('dev')); // Logs HTTP requests to the console for debugging.

/**
 * @description Middleware to attach the database pool to every incoming request object (req).
 * This makes the database connection available in all route handlers as `req.db`.
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} _res - The Express response object (unused).
 * @param {import('express').NextFunction} next - The next middleware function.
 */
app.use((req, _res, next) => { req.db = pool; next(); });

// --- Health & Status Routes ---
/**
 * @route GET /api/health
 * @description A health check endpoint to verify that the server is running.
 * @returns {object} 200 - JSON object indicating the server status, environment, and timestamp.
 */
app.get('/api/health', (_req, res) => {
  res.status(200).json({ status: 'ok', environment: ENV, timestamp: new Date().toISOString() });
});

/**
 * @route GET /api/db-check
 * @description An endpoint to verify the database connection is active.
 * @returns {object} 200 - JSON object confirming database connectivity.
 * @returns {object} 500 - JSON object indicating a database connection error.
 */
app.get('/api/db-check', async (_req, res) => {
  try {
    const r = await pool.query('SELECT 1 AS ok');
    res.json({ ok: true, db: r.rows[0] });
  } catch (e) {
    console.error('[DB] /api/db-check error:', e);
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// --- Concept API Routes ---
// Mounts the various concept-specific routers on their respective API paths.
app.use('/api/users', userRoutes);
app.use('/api/import/users', importUserRoutes);
app.use('/api/import/catalog', courseCatalogRoutes);
app.use('/api/import/degree-requirements', degreeRequirementRoutes);
app.use('/api/import/academic-calendar', academicCalendarRoutes);
app.use('/api/student-profile', studentProfileRoutes);
app.use('/api/registration-holds', registrationHoldRoutes);
app.use('/api/waivers', waiverRoutes);
app.use('/api/academic-programs', academicProgramRoutes);

// --- Server Initialization ---
app.listen(PORT, () => {
  console.log(`[Server] SAM backend running on port ${PORT} (${ENV})`);
}).on('error', (err) => {
  console.error(`[Server] Failed to start: ${err.message}`);
  process.exit(1);
});
