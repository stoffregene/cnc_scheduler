const { Pool } = require('pg');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function checkJob60241() {
  try {
    const query = `
      SELECT ss.*, j.job_number, m.machine_name, e.employee_name, jr.operation_name 
      FROM schedule_slots ss 
      JOIN jobs j ON ss.job_id = j.job_id 
      JOIN machines m ON ss.machine_id = m.machine_id 
      LEFT JOIN employees e ON ss.employee_id = e.employee_id 
      JOIN job_routings jr ON ss.routing_id = jr.routing_id 
      WHERE j.job_number = $1 
      ORDER BY ss.start_time
    `;
    
    const result = await pool.query(query, ['60241']);
    
    console.log('Schedule slots for job 60241:');
    result.rows.forEach(row => {
      console.log(`- ${row.operation_name} on ${row.machine_name} with ${row.employee_name || 'NO OPERATOR'}`);
      console.log(`  Start: ${row.start_time}, End: ${row.end_time}`);
      console.log(`  Slot ID: ${row.slot_id}`);
      console.log('---');
    });
    
    // Check for duplicates
    const duplicates = result.rows.filter((row, index, arr) => 
      arr.findIndex(r => r.machine_id === row.machine_id && r.routing_id === row.routing_id) !== index
    );
    
    if (duplicates.length > 0) {
      console.log('\nDUPLICATE ENTRIES FOUND:');
      duplicates.forEach(dup => {
        console.log(`- Duplicate: ${dup.operation_name} on ${dup.machine_name} (Slot ID: ${dup.slot_id})`);
      });
    }
    
  } catch (err) {
    console.error('Error:', err);
  } finally {
    process.exit();
  }
}

checkJob60241();