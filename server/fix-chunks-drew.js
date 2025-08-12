const { Pool } = require('pg');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function fixChunks() {
  try {
    // Assign all HMC chunks to Drew (employee_id = 9)
    const result = await pool.query(`
      UPDATE schedule_slots 
      SET employee_id = 9, updated_at = CURRENT_TIMESTAMP
      WHERE job_id = 1 
      AND machine_id = 3
      AND (notes LIKE '%Chunk%' OR id IN (985, 986, 987))
      RETURNING id, employee_id, notes
    `);
    
    console.log('Updated chunks to Drew (ID: 9):');
    result.rows.forEach(slot => console.log(`  Slot ${slot.id}: ${slot.notes}`));
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

fixChunks();