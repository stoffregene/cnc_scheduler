const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:sassysalad@localhost:5732/cnc_scheduler'
});

async function fixCoreyShift() {
  try {
    console.log('Fixing Corey Smith shift_type...\n');
    
    // Check current data
    const before = await pool.query(`
      SELECT employee_id, first_name, last_name, shift_type, start_time, end_time
      FROM employees 
      WHERE employee_id = 'CS005'
    `);
    
    console.log('Before fix:');
    console.log(before.rows[0]);
    
    // Fix the shift_type - 08:00-17:00 is clearly day shift
    await pool.query(`
      UPDATE employees 
      SET shift_type = 'day'
      WHERE employee_id = 'CS005'
    `);
    
    // Check after
    const after = await pool.query(`
      SELECT employee_id, first_name, last_name, shift_type, start_time, end_time
      FROM employees 
      WHERE employee_id = 'CS005'
    `);
    
    console.log('\nAfter fix:');
    console.log(after.rows[0]);
    
    console.log('\n✅ Corey Smith shift_type fixed from "night" to "day"');
    console.log('His 32 hours should now appear in 1st shift capacity instead of 2nd shift.');
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

fixCoreyShift();