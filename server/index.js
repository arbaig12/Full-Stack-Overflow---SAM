/**
 * @file index.js
 * @description Entry point for the SAM backend server.
 */

import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';
import pkg from 'pg';
import importRoutes from './routes/importRoutes.js';
import usersRoutes from './routes/userRoutes.js'; 

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
app.use('/api/import', importRoutes);
app.use('/api/users', usersRoutes);

app.listen(PORT, () => {
  console.log(`[Server] SAM backend running on port ${PORT} (${ENV})`);
}).on('error', (err) => {
  console.error(`[Server] Failed to start: ${err.message}`);
  process.exit(1);
});
