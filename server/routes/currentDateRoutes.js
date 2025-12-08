/**
 * @file currentDateRoutes.js
 * @description Express routes for managing SAM's current date.
 * Per Section 9.3: Allows registrar to set SAM's current date for testing purposes.
 */

import { Router } from 'express';
import { getCurrentDate, setCustomDate, getCurrentDateString } from '../utils/dateWrapper.js';

const router = Router();

/**
 * GET /api/current-date
 * Get the current system date.
 * 
 * @route GET /api/current-date
 * @returns {Object} 200 - Current date information
 */
router.get('/', async (req, res) => {
  try {
    const currentDate = getCurrentDate();
    const dateString = getCurrentDateString();
    
    return res.json({
      ok: true,
      currentDate: dateString,
      currentDateObject: currentDate.toISOString(),
      displayDate: currentDate.toDateString()
    });
  } catch (e) {
    console.error('[current-date] GET failed:', e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * POST /api/current-date
 * Set SAM's current date (for registrar use).
 * 
 * Body:
 *   - date: Date string in YYYY-MM-DD format, or null/empty to use actual current date
 * 
 * @route POST /api/current-date
 * @returns {Object} 200 - Date set successfully
 * @returns {Object} 400 - Invalid date format
 */
router.post('/', async (req, res) => {
  try {
    const { date } = req.body;
    
    // If date is null, undefined, or empty string, reset to actual current date
    if (!date || date === '') {
      setCustomDate(null);
      const currentDate = getCurrentDate();
      const dateString = getCurrentDateString();
      
      return res.json({
        ok: true,
        message: 'Current date reset to actual current date',
        currentDate: dateString,
        displayDate: currentDate.toDateString()
      });
    }
    
    // Validate date format (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) {
      return res.status(400).json({
        ok: false,
        error: 'Invalid date format. Expected YYYY-MM-DD format.'
      });
    }
    
    // Validate the date is actually valid
    const [year, month, day] = date.split('-').map(Number);
    const testDate = new Date(year, month - 1, day);
    if (testDate.getFullYear() !== year || 
        testDate.getMonth() !== month - 1 || 
        testDate.getDate() !== day) {
      return res.status(400).json({
        ok: false,
        error: 'Invalid date. Please provide a valid date.'
      });
    }
    
    // Set the custom date
    setCustomDate(date);
    const currentDate = getCurrentDate();
    const dateString = getCurrentDateString();
    
    return res.json({
      ok: true,
      message: `Current date set to ${dateString}`,
      currentDate: dateString,
      displayDate: currentDate.toDateString()
    });
  } catch (e) {
    console.error('[current-date] POST failed:', e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

export default router;

