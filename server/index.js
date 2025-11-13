/**
 * @file index.js
 * @description Entry point for the SAM backend server.
 */

import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';
import pkg from 'pg';
import userRoutes from './concepts/user/userRoutes.js';
import importUserRoutes from './concepts/user/importUserRoutes.js';
import courseCatalogRoutes from './concepts/courseCatalog/courseCatalogRoutes.js';
import degreeRequirementRoutes from './concepts/degreeRequirement/degreeRequirementRoutes.js';
import academicProgramRoutes from './concepts/academicProgram/academicProgramRoutes.js';
import waiverRoutes from './concepts/waiver/waiverRoutes.js';
import registrationHoldRoutes from './concepts/registrationHold/registrationHoldRoutes.js';
import studentProfileRoutes from './concepts/studentProfile/studentProfileRoutes.js';
import academicCalendarRoutes from './concepts/academicCalendar/academicCalendarRoutes.js';

dotenv.config();

const { Pool } = pkg;
const app = express();

const PORT = process.env.PORT || 4000;
const ENV  = process.env.NODE_ENV || 'development';

// Postgres pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});
pool.on('error', (err) => {
  console.error('[DB] Unexpected idle client error:', err);
  process.exit(1);
});

// Middleware
app.use(cors({ origin: 'http://localhost:3000', credentials: true }));
app.use(express.json());
app.use(morgan('dev'));

// Attach db to every request
app.use((req, _res, next) => { req.db = pool; next(); });

// Health
app.get('/api/health', (_req, res) => {
  res.status(200).json({ status: 'ok', environment: ENV, timestamp: new Date().toISOString() });
});

// DB check
app.get('/api/db-check', async (_req, res) => {
  try {
    const r = await pool.query('SELECT 1 AS ok');
    res.json({ ok: true, db: r.rows[0] });
  } catch (e) {
    console.error('[DB] /api/db-check error:', e);
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// Routes
app.use('/api/users', userRoutes);
app.use('/api/import/users', importUserRoutes);
app.use('/api/import/catalog', courseCatalogRoutes);
app.use('/api/import/degree-requirements', degreeRequirementRoutes);
app.use('/api/import/academic-calendar', academicCalendarRoutes);
app.use('/api/student-profile', studentProfileRoutes);
app.use('/api/registration-holds', registrationHoldRoutes);
app.use('/api/waivers', waiverRoutes);
app.use('/api/academic-programs', academicProgramRoutes);

app.listen(PORT, () => {
  console.log(`[Server] SAM backend running on port ${PORT} (${ENV})`);
}).on('error', (err) => {
  console.error(`[Server] Failed to start: ${err.message}`);
  process.exit(1);
});
