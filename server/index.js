/**
 * @file index.js
 * @description Entry point for the SAM backend server.
 * Initializes Express, middleware, and API routes.
 * @module server/index
 */

import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import importRoutes from './routes/importRoutes.js';

const app = express();
const PORT = process.env.PORT || 8080;
const ENV = process.env.NODE_ENV || 'development';

/**
 * Middleware Configuration
 */
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

/**
 * Health check endpoint for uptime verification.
 *
 * @route GET /api/health
 * @returns {Object} 200 - JSON status response with server health information.
 * @property {string} status - Server status indicator.
 * @property {string} environment - Current environment (development/production).
 * @property {string} timestamp - ISO 8601 formatted current timestamp.
 */
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    environment: ENV,
    timestamp: new Date().toISOString(),
  });
});

/**
 * Mount catalog import endpoints under the /api/import base path.
 */
app.use('/api/import', importRoutes);

/**
 * Start the Express server and listen on the configured port.
 *
 * @listens {number} PORT - The port number the server listens on.
 * @fires error - Logs error and exits process if server fails to start.
 */
app
  .listen(PORT, () => {
    console.log(`[Server] SAM backend running on port ${PORT} (${ENV})`);
  })
  .on('error', (err) => {
    console.error(`[Server] Failed to start: ${err.message}`);
    process.exit(1);
  });
