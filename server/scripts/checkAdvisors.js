/**
 * Script to check if advisors are properly configured in the advisors table
 */

import pkg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function checkAdvisors() {
  try {
    console.log('Checking advisors in database...\n');

    // Get all advisors from users table
    const usersQuery = await pool.query(`
      SELECT user_id, sbu_id, first_name, last_name, email
      FROM users
      WHERE role = 'Advisor'
      ORDER BY sbu_id
    `);

    console.log(`Found ${usersQuery.rows.length} advisors in users table:\n`);

    // Check each advisor in the advisors table
    for (const user of usersQuery.rows) {
      const advisorQuery = await pool.query(`
        SELECT a.level, a.department_id,
               d.code AS dept_code, d.name AS dept_name,
               d.college_id, c.name AS college_name
        FROM advisors a
        LEFT JOIN departments d ON d.department_id = a.department_id
        LEFT JOIN colleges c ON c.college_id = d.college_id
        WHERE a.user_id = $1
      `, [user.user_id]);

      if (advisorQuery.rows.length > 0) {
        const advisor = advisorQuery.rows[0];
        console.log(`✓ ${user.first_name} ${user.last_name} (SBU_ID: ${user.sbu_id})`);
        console.log(`  - Level: ${advisor.level}`);
        console.log(`  - Department ID: ${advisor.department_id || 'NULL'}`);
        if (advisor.dept_code) {
          console.log(`  - Department: ${advisor.dept_code} (${advisor.dept_name})`);
        }
        if (advisor.college_id) {
          console.log(`  - College ID: ${advisor.college_id}`);
        }
        if (advisor.college_name) {
          console.log(`  - College: ${advisor.college_name}`);
        }
      } else {
        console.log(`✗ ${user.first_name} ${user.last_name} (SBU_ID: ${user.sbu_id})`);
        console.log(`  - NOT FOUND in advisors table!`);
      }
      console.log('');
    }

    // Summary
    const advisorsInTable = await pool.query(`
      SELECT COUNT(*) as count FROM advisors
    `);
    console.log(`\nSummary:`);
    console.log(`- Advisors in users table: ${usersQuery.rows.length}`);
    console.log(`- Advisors in advisors table: ${advisorsInTable.rows[0].count}`);

    await pool.end();
  } catch (err) {
    console.error('Error:', err);
    await pool.end();
    process.exit(1);
  }
}

checkAdvisors();

