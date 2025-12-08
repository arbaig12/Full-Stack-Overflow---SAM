/**
 * Script to sync class section capacities with their room capacities.
 * Updates all class sections that have a room_id to use the room's capacity.
 * 
 * Usage: node server/scripts/syncRoomCapacities.js
 */

import pkg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function syncRoomCapacities() {
  const client = await pool.connect();
  
  try {
    console.log('[SYNC] Starting room capacity sync...');
    
    // First, get all sections that need updating with their old and new capacities
    const sectionsToUpdate = await client.query(
      `
      SELECT cs.class_id, cs.capacity AS old_capacity, r.capacity AS new_capacity, r.building, r.room
      FROM class_sections cs
      JOIN rooms r ON cs.room_id = r.room_id
      WHERE cs.capacity != r.capacity
      `
    );

    if (sectionsToUpdate.rows.length === 0) {
      console.log('[SYNC] All class section capacities are already in sync with room capacities.');
      return;
    }

    console.log(`[SYNC] Found ${sectionsToUpdate.rows.length} section(s) to update:`);
    sectionsToUpdate.rows.forEach(row => {
      console.log(`  - Class ID ${row.class_id} (${row.building} ${row.room}): ${row.old_capacity} -> ${row.new_capacity}`);
    });

    // Update all class sections that have a room_id to use the room's capacity
    await client.query('BEGIN');
    
    const updateResult = await client.query(
      `
      UPDATE class_sections cs
      SET capacity = r.capacity
      FROM rooms r
      WHERE cs.room_id = r.room_id
        AND cs.capacity != r.capacity
      `
    );

    await client.query('COMMIT');

    console.log(`[SYNC] Successfully updated ${updateResult.rowCount} class section(s).`);
    
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[SYNC ERROR]', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

syncRoomCapacities()
  .then(() => {
    console.log('[SYNC] Completed successfully.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('[SYNC] Failed:', err);
    process.exit(1);
  });

