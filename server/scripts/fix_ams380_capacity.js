/**
 * Script to fix AMS380 capacity by linking it to HVY ENGR LAB 201 and updating capacity
 */

import pkg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pkg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function fixAMS380() {
  const client = await pool.connect();
  
  try {
    console.log('[FIX] Finding HVY ENGR LAB 201 room...');
    
    // Find the room
    const roomRes = await client.query(
      `SELECT room_id, building, room, capacity FROM rooms WHERE UPPER(building) LIKE '%HVY ENGR LAB%' AND room = '201' LIMIT 1`
    );
    
    if (roomRes.rows.length === 0) {
      console.error('[FIX] HVY ENGR LAB 201 room not found!');
      return;
    }
    
    const room = roomRes.rows[0];
    console.log(`[FIX] Found room: ${room.building} ${room.room}, capacity=${room.capacity}`);
    
    // Find AMS380 sections
    console.log('[FIX] Finding AMS380 sections...');
    const sectionsRes = await client.query(
      `
      SELECT cs.class_id, cs.section_num, cs.capacity, cs.location_text, cs.room_id, c.subject, c.course_num
      FROM class_sections cs
      JOIN courses c ON c.course_id = cs.course_id
      WHERE c.subject = 'AMS' AND c.course_num = '380'
      `
    );
    
    console.log(`[FIX] Found ${sectionsRes.rows.length} AMS380 section(s)`);
    
    await client.query('BEGIN');
    
    for (const section of sectionsRes.rows) {
      console.log(`[FIX] Processing section ${section.section_num}:`);
      console.log(`  - Current capacity: ${section.capacity}`);
      console.log(`  - Current room_id: ${section.room_id}`);
      console.log(`  - Location text: "${section.location_text}"`);
      
      let updated = false;
      
      // Update room_id if needed
      if (section.room_id !== room.room_id) {
        await client.query(
          `UPDATE class_sections SET room_id = $1 WHERE class_id = $2`,
          [room.room_id, section.class_id]
        );
        console.log(`  ✓ Linked to room ${room.room_id}`);
        updated = true;
      }
      
      // Update capacity if needed
      if (section.capacity !== room.capacity) {
        await client.query(
          `UPDATE class_sections SET capacity = $1 WHERE class_id = $2`,
          [room.capacity, section.class_id]
        );
        console.log(`  ✓ Updated capacity: ${section.capacity} -> ${room.capacity}`);
        updated = true;
      }
      
      if (!updated) {
        console.log(`  - No changes needed`);
      }
    }
    
    await client.query('COMMIT');
    console.log('[FIX] Completed successfully!');
    
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[FIX ERROR]', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

fixAMS380()
  .then(() => {
    console.log('[FIX] Done.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('[FIX] Failed:', err);
    process.exit(1);
  });

