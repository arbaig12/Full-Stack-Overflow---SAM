/**
 * @file index.js
 * @description Entry point for the SAM backend server.
 */

import express from 'express';
import session from "express-session";
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';
import pkg from 'pg';
import dashboardRoutes from './routes/dashboardRoutes.js';
import importRoutes from './routes/importRoutes.js';
import authRoutes from "./routes/authRoutes.js";
import usersRoutes from './routes/userRoutes.js'; 
import importDegreeReq from "./routes/importDegreeReq.js";
import importAcademicCalendar from "./routes/importAcademicCalendar.js";
import courseCatalogRoutes from "./routes/courseCatalogRoutes.js";
import classScheduleRoutes from "./routes/classScheduleRoutes.js";
import studentProfileRoutes from "./routes/studentProfileRoutes.js";
import degreeProgressRoutes from "./routes/degreeProgressRoutes.js";
import programDeclarationRoutes from "./routes/programDeclarationRoutes.js";
import academicCalendarRoutes from "./routes/academicCalendarRoutes.js";
import rostersGradingRoutes from "./routes/rostersGradingRoutes.js";
import classManageRoutes from "./routes/classManageRoutes.js";
import registrationScheduleRoutes from './routes/registrationScheduleRoutes.js';
import studentProgramRoutes from './routes/studentProgramRoutes.js';
import majorMinorRequestRoutes from './routes/majorMinorRequestRoutes.js';
import waiversHoldsRoutes from './routes/waiversHoldsRoutes.js';
import auditLogRoutes from './routes/auditLogRoutes.js';
import currentDateRoutes from './routes/currentDateRoutes.js';
import schedulePlanRoutes from './routes/schedulePlanRoutes.js';
import authUser from "./middleware/authUser.js";



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
app.use(
  session({
    secret: process.env.SESSION_SECRET || "sam_dev_secret_key",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: false,  // set true only in production with HTTPS
      maxAge: 1000 * 60 * 60 * 24, // 1 day
    },
  })
);
// Attach db to every request
app.use((req, _res, next) => { req.db = pool; next(); });

// app.use((req, _res, next) => {
//   req.user = { userId: 1, role: 'Student' };  
//   next();
// });

app.use(authUser(pool));


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
app.use('/api/user-management', usersRoutes);
app.use("/api/import", importDegreeReq);
app.use("/api/import", importAcademicCalendar);
app.use("/api/catalog", courseCatalogRoutes);
app.use("/api/schedule", classScheduleRoutes);
app.use("/api/student/profile", studentProfileRoutes);
app.use("/api/degree", degreeProgressRoutes);
app.use("/api/programs", programDeclarationRoutes);
app.use("/api/calendar", academicCalendarRoutes);
app.use("/api/rosters", rostersGradingRoutes);
app.use("/api/instructor", rostersGradingRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use("/api/class-manage", classManageRoutes);
app.use('/api/registration', registrationScheduleRoutes);
app.use('/api/student-programs', studentProgramRoutes);
app.use('/api/major-minor-requests', majorMinorRequestRoutes);
app.use('/api/waivers-holds', waiversHoldsRoutes);
app.use('/api/audit-log', auditLogRoutes);
app.use('/api/current-date', currentDateRoutes);
app.use('/api/schedule-plan', schedulePlanRoutes);
app.use("/api/auth", authRoutes);




app.listen(PORT, () => {
  console.log(`[Server] SAM backend running on port ${PORT} (${ENV})`);
}).on('error', (err) => {
  console.error(`[Server] Failed to start: ${err.message}`);
  process.exit(1);
});
