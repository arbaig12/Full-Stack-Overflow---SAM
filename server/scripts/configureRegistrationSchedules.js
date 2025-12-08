/**
 * Script to configure Fall 2025 and Spring 2026 registration schedules
 * 
 * Usage:
 *   node server/scripts/configureRegistrationSchedules.js
 */

import pkg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const { Pool } = pkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function configureSchedules() {
  try {
    // Get term IDs
    const termRes = await pool.query(`
      SELECT term_id, semester, year 
      FROM terms 
      WHERE (semester = 'Fall' AND year = 2025) OR (semester = 'Spring' AND year = 2026)
      ORDER BY year, semester
    `);

    const fall2025 = termRes.rows.find((t) => t.semester === 'Fall' && t.year === 2025);
    const spring2026 = termRes.rows.find((t) => t.semester === 'Spring' && t.year === 2026);

    if (!fall2025) {
      console.error('❌ Fall 2025 term not found');
      process.exit(1);
    }
    if (!spring2026) {
      console.error('❌ Spring 2026 term not found');
      process.exit(1);
    }

    console.log(`📅 Found Fall 2025 (term_id: ${fall2025.term_id})`);
    console.log(`📅 Found Spring 2026 (term_id: ${spring2026.term_id})\n`);

    // Configure Fall 2025
    console.log('🔧 Configuring Fall 2025 registration schedule...');
    await pool.query('BEGIN');
    
    // Delete existing schedule for Fall 2025
    await pool.query('DELETE FROM registration_schedules WHERE term_id = $1', [fall2025.term_id]);
    
    // Insert Fall 2025 windows
    const fall2025Windows = [
      { classStanding: 'U4', creditThreshold: null, startDate: '2025-04-07' },
      { classStanding: 'U3', creditThreshold: null, startDate: '2025-04-14' },
      { classStanding: 'U2', creditThreshold: null, startDate: '2025-04-21' },
      { classStanding: 'U1', creditThreshold: null, startDate: '2025-04-28' },
    ];

    for (const window of fall2025Windows) {
      await pool.query(
        `INSERT INTO registration_schedules (term_id, class_standing, credit_threshold, registration_start_date)
         VALUES ($1, $2, $3, $4)`,
        [fall2025.term_id, window.classStanding, window.creditThreshold, window.startDate]
      );
    }

    await pool.query('COMMIT');
    console.log('✅ Fall 2025 schedule configured:');
    fall2025Windows.forEach((w) => {
      console.log(`   - ${w.classStanding}: ${w.startDate}`);
    });

    // Configure Spring 2026
    console.log('\n🔧 Configuring Spring 2026 registration schedule...');
    await pool.query('BEGIN');
    
    // Delete existing schedule for Spring 2026
    await pool.query('DELETE FROM registration_schedules WHERE term_id = $1', [spring2026.term_id]);
    
    // Insert Spring 2026 windows
    // Note: Using 0 as special value for "< 100" threshold
    const spring2026Windows = [
      { classStanding: 'U4', creditThreshold: 100, startDate: '2025-11-03' }, // 100+
      { classStanding: 'U4', creditThreshold: 0, startDate: '2025-11-10' },   // < 100 (0 is special)
      { classStanding: 'U3', creditThreshold: null, startDate: '2025-11-17' },
      { classStanding: 'U2', creditThreshold: null, startDate: '2025-11-24' },
      { classStanding: 'U1', creditThreshold: null, startDate: '2025-12-01' },
    ];

    for (const window of spring2026Windows) {
      await pool.query(
        `INSERT INTO registration_schedules (term_id, class_standing, credit_threshold, registration_start_date)
         VALUES ($1, $2, $3, $4)`,
        [spring2026.term_id, window.classStanding, window.creditThreshold === 0 ? 0 : window.creditThreshold, window.startDate]
      );
    }

    await pool.query('COMMIT');
    console.log('✅ Spring 2026 schedule configured:');
    spring2026Windows.forEach((w) => {
      const threshold = w.creditThreshold === null ? 'no threshold' : w.creditThreshold === 0 ? '< 100' : `${w.creditThreshold}+`;
      console.log(`   - ${w.classStanding} (${threshold}): ${w.startDate}`);
    });

    console.log('\n✅ All registration schedules configured successfully!');
  } catch (err) {
    await pool.query('ROLLBACK').catch(() => {});
    console.error('❌ Error configuring schedules:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

configureSchedules();

