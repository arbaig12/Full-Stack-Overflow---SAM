/**
 * @file academicCalendarRoutes.js
 * @description Express routes for academic calendar and term management.
 * Handles:
 *   - Get academic calendar for a term
 *   - Get all terms
 *   - Get term schedules
 *   - Get current term
 */

import { Router } from 'express';

const router = Router();

/**
 * GET /terms
 * Get all academic terms.
 * 
 * Query params:
 *   - year: Filter by year
 *   - semester: Filter by semester (Spring, SummerI, SummerII, Fall)
 * 
 * @route GET /terms
 * @returns {Object} 200 - List of terms
 */
router.get('/terms', async (req, res) => {
  try {
    const { year, semester } = req.query;

    let sql = `
      SELECT
        t.term_id,
        t.semester::text AS semester,
        t.year,
        ts.reg_start_date,
        ts.reg_end_date,
        ts.add_drop_deadline,
        ts.withdraw_deadline,
        ts.declare_start_date,
        ts.declare_end_date,
        ts.instruction_start,
        ts.instruction_end,
        ts.finals_start,
        ts.finals_end
      FROM terms t
      LEFT JOIN term_schedules ts ON ts.term_id = t.term_id
      WHERE 1=1
    `;

    const params = [];

    if (year) {
      params.push(year);
      sql += ` AND t.year = $${params.length}`;
    }

    if (semester) {
      params.push(semester);
      sql += ` AND t.semester::text = $${params.length}`;
    }

    sql += ` ORDER BY t.year DESC, 
      CASE t.semester::text
        WHEN 'Spring' THEN 1
        WHEN 'SummerI' THEN 2
        WHEN 'SummerII' THEN 3
        WHEN 'Fall' THEN 4
      END DESC`;

    const result = await req.db.query(sql, params);

    const terms = result.rows.map(row => ({
      termId: row.term_id,
      semester: row.semester,
      year: row.year,
      schedule: {
        regStartDate: row.reg_start_date,
        regEndDate: row.reg_end_date,
        addDropDeadline: row.add_drop_deadline,
        withdrawDeadline: row.withdraw_deadline,
        declareStartDate: row.declare_start_date,
        declareEndDate: row.declare_end_date,
        instructionStart: row.instruction_start,
        instructionEnd: row.instruction_end,
        finalsStart: row.finals_start,
        finalsEnd: row.finals_end
      }
    }));

    return res.json({ 
      ok: true, 
      count: terms.length,
      terms 
    });
  } catch (e) {
    console.error('[calendar] /terms failed:', e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * GET /terms/current
 * Get the current academic term based on today's date.
 * Uses date wrapper per Section 9.3 requirements.
 * 
 * @route GET /terms/current
 * @returns {Object} 200 - Current term
 */
router.get('/terms/current', async (req, res) => {
  try {
    // Use date wrapper per Section 9.3
    const { getCurrentDate } = await import('../../utils/dateWrapper.js');
    const today = getCurrentDate();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth() + 1; // 1-12

    // Determine current semester based on month
    // Spring: Jan-May, Summer: Jun-Aug, Fall: Sep-Dec
    let currentSemester;
    if (currentMonth >= 1 && currentMonth <= 5) {
      currentSemester = 'Spring';
    } else if (currentMonth >= 6 && currentMonth <= 8) {
      currentSemester = 'SummerI'; // Default to SummerI, could be more sophisticated
    } else {
      currentSemester = 'Fall';
    }

    const sql = `
      SELECT
        t.term_id,
        t.semester::text AS semester,
        t.year,
        ts.reg_start_date,
        ts.reg_end_date,
        ts.add_drop_deadline,
        ts.withdraw_deadline,
        ts.declare_start_date,
        ts.declare_end_date,
        ts.instruction_start,
        ts.instruction_end,
        ts.finals_start,
        ts.finals_end
      FROM terms t
      LEFT JOIN term_schedules ts ON ts.term_id = t.term_id
      WHERE t.year = $1 AND t.semester::text = $2
      ORDER BY t.term_id DESC
      LIMIT 1
    `;

    const result = await req.db.query(sql, [currentYear, currentSemester]);

    if (result.rows.length === 0) {
      // Fallback: get most recent term
      const fallbackResult = await req.db.query(`
        SELECT t.term_id, t.semester::text AS semester, t.year
        FROM terms t
        ORDER BY t.year DESC, 
          CASE t.semester::text
            WHEN 'Spring' THEN 1
            WHEN 'SummerI' THEN 2
            WHEN 'SummerII' THEN 3
            WHEN 'Fall' THEN 4
          END DESC
        LIMIT 1
      `);

      if (fallbackResult.rows.length === 0) {
        return res.status(404).json({ 
          ok: false, 
          error: 'No terms found' 
        });
      }

      return res.json({
        ok: true,
        term: {
          termId: fallbackResult.rows[0].term_id,
          semester: fallbackResult.rows[0].semester,
          year: fallbackResult.rows[0].year,
          schedule: null
        },
        note: 'Using most recent term as current'
      });
    }

    const row = result.rows[0];
    const term = {
      termId: row.term_id,
      semester: row.semester,
      year: row.year,
      schedule: {
        regStartDate: row.reg_start_date,
        regEndDate: row.reg_end_date,
        addDropDeadline: row.add_drop_deadline,
        withdrawDeadline: row.withdraw_deadline,
        declareStartDate: row.declare_start_date,
        declareEndDate: row.declare_end_date,
        instructionStart: row.instruction_start,
        instructionEnd: row.instruction_end,
        finalsStart: row.finals_start,
        finalsEnd: row.finals_end
      }
    };

    return res.json({ ok: true, term });
  } catch (e) {
    console.error('[calendar] /terms/current failed:', e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * GET /academic-calendar/:term_id
 * Get academic calendar information for a specific term.
 * 
 * @route GET /academic-calendar/:term_id
 * @returns {Object} 200 - Academic calendar
 * @returns {Object} 404 - Calendar not found
 */
router.get('/academic-calendar/:term_id', async (req, res) => {
  try {
    const { term_id } = req.params;

    // First get term info
    const termSql = `
      SELECT term_id, semester::text AS semester, year
      FROM terms
      WHERE term_id = $1
    `;

    const termResult = await req.db.query(termSql, [term_id]);

    if (termResult.rows.length === 0) {
      return res.status(404).json({ 
        ok: false, 
        error: 'Term not found' 
      });
    }

    const term = termResult.rows[0];

    // Get academic calendar - use case-insensitive matching for semester
    // Also try both string and numeric year matching
    const calendarSql = `
      SELECT
        id,
        term,
        major_and_minor_changes_end,
        waitlist,
        waitlist_process_ends,
        late_registration_ends,
        GPNC_selection_ends,
        course_withdrawal_ends,
        major_and_minor_changes_begin,
        advanced_registration_begins,
        semester_end
      FROM academic_calendar
      WHERE LOWER(TRIM(term->>'semester')) = LOWER(TRIM($1)) 
        AND (term->>'year')::text = $2
    `;

    // Debug logging
    console.log(`[academic-calendar] Looking up calendar for term_id=${term_id}, semester='${term.semester}', year=${term.year}`);

    const calendarResult = await req.db.query(calendarSql, [
      term.semester,
      String(term.year)
    ]);

    if (calendarResult.rows.length === 0) {
      // Try alternative matching - sometimes the year might be stored differently
      const altResult = await req.db.query(`
        SELECT id, term, term->>'semester' as stored_semester, term->>'year' as stored_year
        FROM academic_calendar
      `);
      console.log(`[academic-calendar] No match found. Available calendars:`, 
        altResult.rows.map(r => `${r.stored_semester} ${r.stored_year}`).join(', '));
    } else {
      console.log(`[academic-calendar] Found ${calendarResult.rows.length} calendar(s). Calendar data:`, {
        id: calendarResult.rows[0].id,
        hasDates: !!calendarResult.rows[0].major_and_minor_changes_end,
        semesterEnd: calendarResult.rows[0].semester_end
      });
    }

    if (calendarResult.rows.length === 0) {
      return res.json({
        ok: true,
        term: {
          termId: term.term_id,
          semester: term.semester,
          year: term.year
        },
        calendar: null,
        message: 'No academic calendar data found for this term'
      });
    }

    const calendar = calendarResult.rows[0];

    // Debug: log the actual calendar data being returned
    console.log(`[academic-calendar] Returning calendar for ${term.semester} ${term.year}:`, {
      id: calendar.id,
      semesterEnd: calendar.semester_end,
      waitlist: calendar.waitlist,
      majorAndMinorChangesBegin: calendar.major_and_minor_changes_begin
    });

    // Disable caching for this response to avoid stale data
    res.set({
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });

    return res.json({
      ok: true,
      term: {
        termId: term.term_id,
        semester: term.semester,
        year: term.year
      },
      calendar: {
        id: calendar.id,
        term: calendar.term,
        majorAndMinorChangesBegin: calendar.major_and_minor_changes_begin,
        majorAndMinorChangesEnd: calendar.major_and_minor_changes_end,
        waitlist: calendar.waitlist,
        waitlistProcessEnds: calendar.waitlist_process_ends,
        lateRegistrationEnds: calendar.late_registration_ends,
        GPNCSelectionEnds: calendar.GPNC_selection_ends,
        courseWithdrawalEnds: calendar.course_withdrawal_ends,
        advancedRegistrationBegins: calendar.advanced_registration_begins,
        semesterEnd: calendar.semester_end
      }
    });
  } catch (e) {
    console.error('[calendar] /academic-calendar/:term_id failed:', e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

export default router;

