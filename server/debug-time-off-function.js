const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:sassysalad@localhost:5432/cnc_scheduler'
});

async function debugTimeOffFunction() {
  try {
    console.log('=== DEBUGGING TIME OFF FUNCTION ===\n');
    
    // Get Chris Johnson's ID
    const chrisResult = await pool.query(`
      SELECT id, first_name, last_name FROM employees 
      WHERE first_name = 'Chris' AND last_name = 'Johnson'
    `);
    
    if (chrisResult.rows.length === 0) {
      console.log('Chris Johnson not found');
      return;
    }
    
    const chrisId = chrisResult.rows[0].id;
    console.log(`Chris Johnson ID: ${chrisId}`);
    
    // Check if Chris has any time off
    const timeOffResult = await pool.query(`
      SELECT * FROM employee_time_off
      WHERE employee_id = $1
      ORDER BY start_date
    `, [chrisId]);
    
    console.log('\nChris Time Off Records:');
    if (timeOffResult.rows.length > 0) {
      timeOffResult.rows.forEach(timeOff => {
        console.log(`- ${timeOff.start_date} to ${timeOff.end_date}: ${timeOff.reason}`);
      });
    } else {
      console.log('No time off records found');
    }
    
    // Test the function with today's date
    console.log('\nTesting get_employee_working_hours for today:');
    const today = new Date().toISOString().split('T')[0];
    console.log(`Date: ${today}`);
    
    try {
      const workingHours = await pool.query(`
        SELECT * FROM get_employee_working_hours($1, $2::date)
      `, [chrisId, today]);
      
      console.log('Function result:', workingHours.rows[0]);
    } catch (error) {
      console.log('Function ERROR:', error.message);
    }
    
    // Check Chris's schedule data
    console.log('\nChecking Chris schedule data sources:');
    
    // 1. employee_work_schedules
    const workSchedules = await pool.query(`
      SELECT * FROM employee_work_schedules
      WHERE employee_id = $1
      ORDER BY day_of_week
    `, [chrisId]);
    
    console.log('employee_work_schedules:');
    if (workSchedules.rows.length > 0) {
      workSchedules.rows.forEach(schedule => {
        console.log(`  Day ${schedule.day_of_week}: ${schedule.start_hour}:00-${schedule.end_hour}:00 (working: ${schedule.is_working_day})`);
      });
    } else {
      console.log('  No records found');
    }
    
    // 2. employee_shift_schedule  
    const shiftSchedules = await pool.query(`
      SELECT * FROM employee_shift_schedule
      WHERE employee_id = $1
    `, [chrisId]);
    
    console.log('employee_shift_schedule:');
    if (shiftSchedules.rows.length > 0) {
      const schedule = shiftSchedules.rows[0];
      console.log(`  Mon: ${schedule.monday_start}-${schedule.monday_end}`);
      console.log(`  Tue: ${schedule.tuesday_start}-${schedule.tuesday_end}`);
      console.log(`  Wed: ${schedule.wednesday_start}-${schedule.wednesday_end}`);
      console.log(`  Thu: ${schedule.thursday_start}-${schedule.thursday_end}`);
      console.log(`  Fri: ${schedule.friday_start}-${schedule.friday_end}`);
    } else {
      console.log('  No records found');
    }
    
    // 3. employees table fallback
    const employeeData = await pool.query(`
      SELECT custom_start_hour, custom_end_hour FROM employees
      WHERE id = $1
    `, [chrisId]);
    
    console.log('employees table fallback:');
    if (employeeData.rows.length > 0) {
      const emp = employeeData.rows[0];
      console.log(`  Custom hours: ${emp.custom_start_hour}-${emp.custom_end_hour}`);
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

debugTimeOffFunction();