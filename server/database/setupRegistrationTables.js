/**
 * Setup script to create registration system tables
 * 
 * Usage:
 *   cd server/database
 *   node setupRegistrationTables.js
 * 
 * Or from project root:
 *   node server/database/setupRegistrationTables.js
 */

import pkg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const { Pool } = pkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
// Try multiple possible paths for .env file
const envPaths = [
  path.join(process.cwd(), 'server', '.env'),  // From project root
  path.join(process.cwd(), '.env'),            // From server directory
  path.join(__dirname, '..', '.env')           // Relative to this file
];

for (const envPath of envPaths) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
    break;
  }
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function createTables() {
  const sqlFile = path.join(__dirname, 'add_missing_registration_tables.sql');
  
  if (!fs.existsSync(sqlFile)) {
    console.error(`❌ SQL file not found: ${sqlFile}`);
    process.exit(1);
  }

  const sql = fs.readFileSync(sqlFile, 'utf8');
  
  console.log('📦 Creating registration system tables...\n');
  
  try {
    await pool.query(sql);
    console.log('✅ All registration tables created successfully!\n');
    
    // Verify tables were created
    const result = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name IN (
          'registration_holds',
          'time_conflict_waivers',
          'prerequisite_waivers',
          'department_permissions',
          'registration_schedules',
          'capacity_overrides'
        )
      ORDER BY table_name
    `);
    
    console.log('📋 Created tables:');
    result.rows.forEach(row => {
      console.log(`   ✓ ${row.table_name}`);
    });
    
    if (result.rows.length === 6) {
      console.log('\n✅ All 6 tables created successfully!');
    } else {
      console.log(`\n⚠️  Warning: Expected 6 tables, found ${result.rows.length}`);
    }
    
  } catch (err) {
    console.error('❌ Error creating tables:', err.message);
    if (err.code === '42P01') {
      console.error('\n💡 Tip: Make sure you have restored SAMFinalDB.sql first!');
      console.error('   The main database tables (users, courses, class_sections, etc.) must exist.');
    }
    process.exit(1);
  } finally {
    await pool.end();
  }
}

createTables();

