import pkg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const { Pool } = pkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

(async () => {
  const res = await pool.query(`
    SELECT rs.*, t.semester, t.year 
    FROM registration_schedules rs 
    JOIN terms t ON t.term_id = rs.term_id 
    WHERE t.semester IN ('Fall', 'Spring') AND t.year IN (2025, 2026)
    ORDER BY t.year, t.semester, 
      CASE rs.class_standing WHEN 'U4' THEN 1 WHEN 'U3' THEN 2 WHEN 'U2' THEN 3 WHEN 'U1' THEN 4 END,
      rs.credit_threshold DESC NULLS LAST
  `);
  console.log('Registration Schedules:');
  res.rows.forEach(r => {
    const threshold = r.credit_threshold === null ? 'none' : r.credit_threshold === 0 ? '< 100' : r.credit_threshold + '+';
    console.log(`  ${r.semester} ${r.year}: ${r.class_standing} (threshold: ${threshold}) - ${r.registration_start_date}`);
  });
  await pool.end();
})();

