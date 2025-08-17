const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:sassysalad@localhost:5432/cnc_scheduler'
});

async function testChrisSchedule() {
  try {
    console.log('=== TESTING CHRIS JOHNSON SCHEDULE ===\n');
    
    // Get Chris Johnson's ID
    const chrisResult = await pool.query(`
      SELECT id FROM employees WHERE first_name = 'Chris' AND last_name = 'Johnson'
    `);
    
    if (chrisResult.rows.length === 0) {
      console.log('Chris Johnson not found');
      return;
    }
    
    const chrisId = chrisResult.rows[0].id;
    console.log(`Chris Johnson ID: ${chrisId}`);
    
    // Check what days he has work schedules for
    console.log('\nChris work schedules:');
    const schedules = await pool.query(`
      SELECT day_of_week, start_time, end_time, enabled
      FROM employee_work_schedules
      WHERE employee_id = $1
      ORDER BY day_of_week
    `, [chrisId]);
    
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    schedules.rows.forEach(s => {
      console.log(`  ${dayNames[s.day_of_week]} (${s.day_of_week}): ${s.start_time}-${s.end_time} (enabled: ${s.enabled})`);
    });
    
    // Test function with Monday (day_of_week = 1)
    console.log('\nTesting function with Monday:');
    const monday = '2025-01-20'; // A Monday
    const workingHours = await pool.query(`
      SELECT * FROM get_employee_working_hours($1, $2::date)
    `, [chrisId, monday]);
    
    console.log('Monday result:', workingHours.rows[0]);
    
    if (workingHours.rows[0]) {
      const wh = workingHours.rows[0];
      const shift = (wh.start_hour >= 4 && wh.start_hour <= 15) ? '1st shift' : '2nd shift';
      console.log(`Shift assignment for Monday: ${shift}`);
    }
    
    // Check what day today is
    const today = new Date();
    const todayDayOfWeek = today.getDay() === 0 ? 7 : today.getDay(); // Convert Sunday from 0 to 7
    console.log(`\nToday is day ${todayDayOfWeek} (${dayNames[todayDayOfWeek]})`);
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

testChrisSchedule();
