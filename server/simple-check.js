const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function simpleCheck() {
  try {
    // Just get the schedule slot data
    console.log('Getting schedule slot for job 60241...');
    const result = await pool.query(`
      SELECT ss.*, j.job_number 
      FROM schedule_slots ss 
      JOIN jobs j ON ss.job_id = j.id 
      WHERE j.job_number = '60241'
    `);
    
    console.log('Schedule slot data:');
    result.rows.forEach(row => {
      console.log('  Slot ID:', row.id);
      console.log('  Job ID:', row.job_id);
      console.log('  Employee ID:', row.employee_id);
      console.log('  Machine ID:', row.machine_id);
      console.log('  Start:', row.start_datetime);
      console.log('  End:', row.end_datetime);
    });
    
    if (result.rows.length > 0 && result.rows[0].employee_id) {
      const empId = result.rows[0].employee_id;
      console.log('\nGetting employee details for ID:', empId);
      
      const empResult = await pool.query(`
        SELECT employee_id, first_name, last_name 
        FROM employees 
        WHERE employee_id = $1
      `, [empId]);
      
      if (empResult.rows.length > 0) {
        console.log('Employee found:', empResult.rows[0]);
      } else {
        console.log('Employee not found with ID:', empId);
      }
    }
    
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
    process.exit();
  }
}

simpleCheck();