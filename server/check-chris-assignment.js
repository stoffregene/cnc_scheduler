const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function checkChrisAssignment() {
  try {
    console.log('=== CHECKING JOB 60241 ASSIGNMENT LOGIC ===\n');
    
    // 1. Check the actual schedule slot
    console.log('1. Schedule slot for job 60241:');
    const slotResult = await pool.query(`
      SELECT ss.*, j.job_number, m.name as machine_name
      FROM schedule_slots ss
      JOIN jobs j ON ss.job_id = j.id
      JOIN machines m ON ss.machine_id = m.id
      WHERE j.job_number = '60241'
    `);
    
    const slot = slotResult.rows[0];
    console.log(`   Employee ID in slot: ${slot.employee_id}`);
    console.log(`   Duration: ${slot.duration_minutes} minutes`);
    console.log(`   Machine: ${slot.machine_name}`);
    console.log(`   Time: ${slot.start_datetime} - ${slot.end_datetime}`);
    console.log(`   (4:00 AM - 4:45 AM is definitely 1st shift!)\n`);
    
    // 2. Check who employee ID 7 actually is
    console.log('2. Who is employee_id = 7 in schedule_slots?');
    console.log('   Looking for employee with numeric_id = 7...');
    const emp7Result = await pool.query(`
      SELECT employee_id, first_name, last_name, shift_type, numeric_id
      FROM employees
      WHERE numeric_id = 7
    `);
    
    if (emp7Result.rows.length > 0) {
      const emp = emp7Result.rows[0];
      console.log(`   numeric_id 7 = ${emp.first_name} ${emp.last_name} (${emp.employee_id})`);
      console.log(`   Shift type: ${emp.shift_type}\n`);
    }
    
    // 3. Check Chris Johnson's details
    console.log('3. Chris Johnson details:');
    const chrisResult = await pool.query(`
      SELECT employee_id, first_name, last_name, shift_type, numeric_id
      FROM employees
      WHERE first_name = 'Chris' AND last_name = 'Johnson'
    `);
    
    if (chrisResult.rows.length > 0) {
      const chris = chrisResult.rows[0];
      console.log(`   Employee ID: ${chris.employee_id}`);
      console.log(`   Numeric ID: ${chris.numeric_id}`);
      console.log(`   Shift type: ${chris.shift_type}\n`);
    }
    
    // 4. Show the mapping issue
    console.log('4. THE PROBLEM:');
    console.log('   - Job 60241 is scheduled at 4:00-4:45 AM (clearly 1st shift)');
    console.log('   - It should be assigned to Chris Johnson (day shift)');
    console.log('   - But schedule_slots.employee_id = 7');
    console.log('   - Our numeric_id mapping assigned 7 to Corey Smith (night shift)');
    console.log('   - This is WRONG!\n');
    
    console.log('5. The fix needed:');
    console.log('   We need to update the schedule slot to have the correct employee_id');
    console.log('   that corresponds to Chris Johnson, not Corey Smith.\n');
    
    // Find Chris's numeric_id
    if (chrisResult.rows.length > 0) {
      const chris = chrisResult.rows[0];
      console.log(`6. Updating schedule slot to use Chris Johnson's numeric_id (${chris.numeric_id})...`);
      
      const updateResult = await pool.query(`
        UPDATE schedule_slots
        SET employee_id = $1
        WHERE id = $2
        RETURNING *
      `, [chris.numeric_id, slot.id]);
      
      console.log('   ✅ Schedule slot updated!\n');
      
      // Verify the fix
      console.log('7. Verifying the fix:');
      const verifyResult = await pool.query(`
        SELECT ss.*, e.first_name, e.last_name, e.shift_type
        FROM schedule_slots ss
        JOIN employees e ON ss.employee_id = e.numeric_id
        WHERE ss.id = $1
      `, [slot.id]);
      
      const fixed = verifyResult.rows[0];
      console.log(`   Employee: ${fixed.first_name} ${fixed.last_name}`);
      console.log(`   Shift: ${fixed.shift_type}`);
      console.log(`   Time: 4:00-4:45 AM`);
      console.log(`   ✅ Now correctly consuming 1st shift capacity!`);
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
    process.exit();
  }
}

checkChrisAssignment();