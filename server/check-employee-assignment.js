const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function checkEmployeeAssignment() {
  try {
    console.log('=== CHECKING EMPLOYEE ASSIGNMENT FOR JOB 60241 ===');
    
    // Get the schedule slot details
    const slotResult = await pool.query(`
      SELECT ss.*, j.job_number 
      FROM schedule_slots ss 
      JOIN jobs j ON ss.job_id = j.id 
      WHERE j.job_number = $1
    `, ['60241']);
    
    if (slotResult.rows.length > 0) {
      const slot = slotResult.rows[0];
      console.log('Schedule slot details:');
      console.log('  Employee ID:', slot.employee_id, '(type:', typeof slot.employee_id, ')');
      console.log('  Job ID:', slot.job_id);
      console.log('  Machine ID:', slot.machine_id);
      console.log('  Slot Date:', slot.slot_date);
      console.log('  Status:', slot.status);
      
      // Check if employee exists with this ID
      console.log('\nChecking employee by integer ID...');
      const empIntResult = await pool.query('SELECT * FROM employees WHERE employee_id::integer = $1', [slot.employee_id]);
      console.log('Employee lookup by integer:', empIntResult.rows.length > 0 ? empIntResult.rows[0] : 'Not found');
      
      // Check if employee exists with string conversion
      console.log('\nChecking employee by string ID...');
      const empStrResult = await pool.query('SELECT * FROM employees WHERE employee_id = $1', [slot.employee_id.toString()]);
      console.log('Employee lookup by string:', empStrResult.rows.length > 0 ? empStrResult.rows[0] : 'Not found');
      
      // Show all employees to see ID format
      console.log('\nAll active employees:');
      const allEmpsResult = await pool.query('SELECT employee_id, first_name, last_name FROM employees WHERE status = $1 LIMIT 5', ['active']);
      allEmpsResult.rows.forEach(emp => {
        console.log(`  ${emp.employee_id} (${typeof emp.employee_id}): ${emp.first_name} ${emp.last_name}`);
      });
      
    } else {
      console.log('No schedule slots found for job 60241');
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
    process.exit();
  }
}

checkEmployeeAssignment();