const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function testChrisSchedule() {
  try {
    console.log('Testing Chris Johnson\'s work schedule with the updated function...\n');
    
    // Test the database function
    const functionResult = await pool.query('SELECT * FROM get_employee_working_hours(7, CURRENT_DATE)');
    console.log('Chris Johnson (ID 7) from get_employee_working_hours function:');
    console.log(JSON.stringify(functionResult.rows[0], null, 2));
    
    // Also check the raw data from employee_work_schedules
    const rawData = await pool.query(`
      SELECT day_of_week, start_time, end_time, enabled,
             EXTRACT(hour FROM start_time) + EXTRACT(minute FROM start_time)/60.0 as start_decimal,
             EXTRACT(hour FROM end_time) + EXTRACT(minute FROM end_time)/60.0 as end_decimal,
             EXTRACT(epoch FROM (end_time - start_time)) / 3600.0 as duration_decimal
      FROM employee_work_schedules 
      WHERE employee_id = 7 AND day_of_week = EXTRACT(dow FROM CURRENT_DATE)
    `);
    
    console.log('\nRaw data from employee_work_schedules:');
    console.log(JSON.stringify(rawData.rows[0], null, 2));
    
    // Verify the fix
    const scheduleData = functionResult.rows[0];
    if (scheduleData) {
      console.log(`\n✅ Analysis:`);
      console.log(`Start: ${scheduleData.start_hour} hours (${scheduleData.start_hour}:${((scheduleData.start_hour % 1) * 60).toFixed(0).padStart(2, '0')})`);
      console.log(`End: ${scheduleData.end_hour} hours (${Math.floor(scheduleData.end_hour)}:${((scheduleData.end_hour % 1) * 60).toFixed(0).padStart(2, '0')})`);
      console.log(`Duration: ${scheduleData.duration_hours} hours`);
      
      if (scheduleData.duration_hours >= 11.5) {
        console.log(`\n🎉 SUCCESS: Chris can now work ${scheduleData.duration_hours}h shifts, which is enough for 11.5h HMC operations!`);
      } else {
        console.log(`\n❌ STILL BROKEN: Chris can only work ${scheduleData.duration_hours}h, not enough for 11.5h operations`);
      }
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

testChrisSchedule();