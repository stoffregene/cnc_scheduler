const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:sassysalad@localhost:5432/cnc_scheduler'
});

async function testAug19() {
  try {
    console.log('=== TESTING CHRIS FOR AUGUST 19, 2025 ===\n');
    
    const chrisId = 7; // Chris Johnson ID
    const aug19 = '2025-08-19'; // Tuesday when he has jobs
    
    // Test the function for this specific date
    console.log(`Testing get_employee_working_hours for Chris on ${aug19}:`);
    const result = await pool.query(`
      SELECT * FROM get_employee_working_hours($1, $2::date)
    `, [chrisId, aug19]);
    
    console.log('Function result:', result.rows[0]);
    
    if (result.rows[0]) {
      const wh = result.rows[0];
      const shift = (wh.start_hour >= 4 && wh.start_hour <= 15) ? '1st shift' : '2nd shift';
      console.log(`Shift assignment: ${shift}`);
    }
    
    // Check what day of week August 19, 2025 is
    const date = new Date('2025-08-19');
    const dayOfWeek = date.getDay() === 0 ? 7 : date.getDay(); // Convert Sunday from 0 to 7
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    console.log(`\nAugust 19, 2025 is a ${dayNames[date.getDay()]} (day_of_week: ${dayOfWeek})`);
    
    // Check Chris schedule for that day of week
    console.log(`\nChris schedule for day ${dayOfWeek}:`);
    const schedule = await pool.query(`
      SELECT day_of_week, start_time, end_time, enabled
      FROM employee_work_schedules
      WHERE employee_id = $1 AND day_of_week = $2
    `, [chrisId, dayOfWeek]);
    
    console.log('Schedule result:', schedule.rows);
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

testAug19();