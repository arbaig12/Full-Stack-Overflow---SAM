/**
 * Database Migration Runner
 * 
 * This script manages database migrations by:
 * - Tracking which migrations have been applied in schema_migrations table
 * - Running pending migrations in order
 * - Providing status information
 * 
 * Usage:
 *   node server/database/migrations/migrate.js [command]
 * 
 * Commands:
 *   migrate (default) - Run all pending migrations
 *   status - Show migration status
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
const envPaths = [
  path.join(process.cwd(), 'server', '.env'),
  path.join(process.cwd(), '.env'),
  path.join(__dirname, '..', '..', '.env')
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

const MIGRATIONS_DIR = path.join(__dirname);

/**
 * Ensure schema_migrations table exists
 */
async function ensureMigrationsTable() {
  const schemaSql = fs.readFileSync(
    path.join(__dirname, 'schema_migrations.sql'),
    'utf8'
  );
  
  try {
    await pool.query(schemaSql);
  } catch (err) {
    // Table might already exist, that's okay
    if (err.code !== '42P07') { // 42P07 = duplicate_table
      throw err;
    }
  }
}

/**
 * Get list of migration files in order
 */
function getMigrationFiles() {
  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter(file => file.endsWith('.sql'))
    .filter(file => file !== 'schema_migrations.sql' && file !== 'TEMPLATE.sql')
    .filter(file => !file.startsWith('_')) // Skip files starting with underscore (documentation)
    .filter(file => /^\d{3}_/.test(file)) // Must start with 3 digits followed by underscore
    .sort();
  
  return files;
}

/**
 * Get list of applied migrations
 */
async function getAppliedMigrations() {
  const result = await pool.query(`
    SELECT migration_name, applied_at
    FROM schema_migrations
    ORDER BY applied_at
  `);
  
  return result.rows.map(row => row.migration_name);
}

/**
 * Get pending migrations
 */
async function getPendingMigrations() {
  const allMigrations = getMigrationFiles();
  const appliedMigrations = await getAppliedMigrations();
  
  return allMigrations.filter(migration => !appliedMigrations.includes(migration));
}

/**
 * Run a single migration
 */
async function runMigration(migrationFile) {
  const migrationPath = path.join(MIGRATIONS_DIR, migrationFile);
  const sql = fs.readFileSync(migrationPath, 'utf8');
  
  console.log(`  Running ${migrationFile}...`);
  
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Execute the migration SQL
    await client.query(sql);
    
    // Record that this migration was applied
    await client.query(`
      INSERT INTO schema_migrations (migration_name, applied_at)
      VALUES ($1, NOW())
      ON CONFLICT (migration_name) DO NOTHING
    `, [migrationFile]);
    
    await client.query('COMMIT');
    console.log(`  ✓ ${migrationFile} applied successfully`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Run all pending migrations
 */
async function migrate() {
  try {
    console.log('🔄 Checking for pending migrations...\n');
    
    await ensureMigrationsTable();
    
    const pending = await getPendingMigrations();
    
    if (pending.length === 0) {
      console.log('✅ No pending migrations. Database is up to date!');
      return;
    }
    
    console.log(`📦 Found ${pending.length} pending migration(s):\n`);
    pending.forEach(m => console.log(`   - ${m}`));
    console.log('');
    
    for (const migration of pending) {
      await runMigration(migration);
    }
    
    console.log(`\n✅ Successfully applied ${pending.length} migration(s)!`);
    
  } catch (err) {
    console.error('\n❌ Migration failed:', err.message);
    if (err.code) {
      console.error(`   Error code: ${err.code}`);
    }
    process.exit(1);
  } finally {
    await pool.end();
  }
}

/**
 * Show migration status
 */
async function status() {
  try {
    await ensureMigrationsTable();
    
    const allMigrations = getMigrationFiles();
    const appliedMigrations = await getAppliedMigrations();
    const pendingMigrations = allMigrations.filter(m => !appliedMigrations.includes(m));
    
    console.log('📊 Migration Status\n');
    console.log(`Total migrations: ${allMigrations.length}`);
    console.log(`Applied: ${appliedMigrations.length}`);
    console.log(`Pending: ${pendingMigrations.length}\n`);
    
    if (allMigrations.length === 0) {
      console.log('No migration files found.');
      return;
    }
    
    console.log('Migration Details:\n');
    
    for (const migration of allMigrations) {
      const isApplied = appliedMigrations.includes(migration);
      const status = isApplied ? '✅ Applied' : '⏳ Pending';
      console.log(`  ${status}  ${migration}`);
      
      if (isApplied) {
        const appliedInfo = await pool.query(`
          SELECT applied_at FROM schema_migrations WHERE migration_name = $1
        `, [migration]);
        if (appliedInfo.rows.length > 0) {
          const appliedAt = new Date(appliedInfo.rows[0].applied_at);
          console.log(`         Applied: ${appliedAt.toLocaleString()}`);
        }
      }
    }
    
    if (pendingMigrations.length > 0) {
      console.log('\n💡 Run `npm run migrate` to apply pending migrations.');
    }
    
  } catch (err) {
    console.error('❌ Error checking status:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Main execution
const command = process.argv[2] || 'migrate';

if (command === 'migrate') {
  migrate();
} else if (command === 'status') {
  status();
} else {
  console.error(`Unknown command: ${command}`);
  console.error('Usage: node migrate.js [migrate|status]');
  process.exit(1);
}

