/**
 * Quick fix script to set all registrar passwords to "password"
 * This solves the chicken-and-egg problem where you can't login as registrar
 * to import users because the password isn't set.
 * 
 * Usage:
 *   cd server
 *   node scripts/fix-registrar-passwords.js
 */

import pkg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const { Pool } = pkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function fixRegistrarPasswords() {
  const client = await pool.connect();
  
  try {
    console.log('Setting all registrar passwords to "password"...');
    
    const result = await client.query(
      `UPDATE users 
       SET password_hash = $1 
       WHERE role = 'Registrar'
       RETURNING user_id, email, first_name, last_name`,
      ['password']
    );

    if (result.rows.length === 0) {
      console.log('No registrar users found in the database.');
      console.log('You may need to import users first, or check if registrars exist.');
    } else {
      console.log(`\n✅ Successfully set password for ${result.rows.length} registrar(s):`);
      result.rows.forEach(user => {
        console.log(`   - ${user.email} (${user.first_name} ${user.last_name})`);
      });
      console.log('\nYou can now login with email and password "password"');
    }
    
    // Also set password for all users (in case you want to fix everyone)
    const allUsersResult = await client.query(
      `UPDATE users 
       SET password_hash = $1 
       WHERE password_hash IS NULL OR password_hash = ''
       RETURNING user_id, email, first_name, last_name, role`,
      ['password']
    );
    
    if (allUsersResult.rows.length > 0) {
      console.log(`\n✅ Also set password for ${allUsersResult.rows.length} other user(s) with missing passwords.`);
    }
    
  } catch (err) {
    console.error('❌ Error fixing passwords:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

fixRegistrarPasswords();

