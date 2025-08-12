const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function fixSlot985() {
  try {
    console.log('Fixing slot 985: Moving HMC operation back to correct machine and assigning Drew...');
    
    // Move slot 985 back to machine 3 (HMC-002) and assign to Drew (employee_id = 9)
    const result = await pool.query(`
      UPDATE schedule_slots 
      SET 
        machine_id = 3,
        employee_id = 9,
        updated_at = CURRENT_TIMESTAMP,
        notes = COALESCE(notes, '') || ' (Corrected: Moved back to HMC-002 and assigned to Drew)'
      WHERE id = 985
      RETURNING id, machine_id, employee_id, notes
    `);
    
    console.log('✅ Fixed slot 985:');
    console.log(`  Machine: ${result.rows[0].machine_id} (HMC-002)`);
    console.log(`  Employee: ${result.rows[0].employee_id} (Drew)`);
    console.log(`  Notes: ${result.rows[0].notes}`);
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

fixSlot985();