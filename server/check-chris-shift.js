const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:sassysalad@localhost:5432/cnc_scheduler'
});

async function checkChrisShift() {
  try {
    const result = await pool.query(`
      SELECT 
        employee_id,
        first_name,
        last_name,
        shift_type,
        start_time,
        end_time,
        numeric_id
      FROM employees 
      WHERE first_name ILIKE '%chris%' AND last_name ILIKE '%johnson%'
    `);
    
    console.log('Chris Johnson employee data:');
    console.log(result.rows);
    
    if (result.rows.length > 0) {
      const chris = result.rows[0];
      console.log('\nShift classification logic would assign:');
      console.log('shift_type:', chris.shift_type);
      
      if (chris.start_time) {
        const startHour = parseInt(chris.start_time.split(':')[0]);
        console.log('start_time:', chris.start_time, '(hour:', startHour, ')');
        
        if (chris.shift_type === 'day') {
          console.log('-> 1st shift (via shift_type field)');
        } else if (chris.shift_type === 'night') {
          console.log('-> 2nd shift (via shift_type field)');
        } else {
          if (startHour >= 4 && startHour <= 15) {
            console.log('-> 1st shift (via fallback logic)');
          } else {
            console.log('-> 2nd shift (via fallback logic)');
          }
        }
      }
      
      // Check scheduled hours for Chris
      console.log('\nChecking Chris scheduled hours...');
      const scheduleResult = await pool.query(`
        SELECT 
          ss.start_datetime,
          ss.duration_minutes,
          ss.slot_date,
          j.job_number,
          jr.operation_name
        FROM schedule_slots ss
        JOIN job_routings jr ON ss.job_routing_id = jr.id
        JOIN jobs j ON jr.job_id = j.id
        WHERE ss.employee_id = $1
        AND ss.status IN ('scheduled', 'in_progress')
        ORDER BY ss.start_datetime
        LIMIT 10
      `, [chris.numeric_id]);
      
      console.log('Chris recent scheduled jobs:');
      scheduleResult.rows.forEach(slot => {
        console.log(`- ${slot.job_number}: ${slot.operation_name} on ${slot.slot_date} (${slot.duration_minutes} min)`);
      });
      
      const totalMinutes = scheduleResult.rows.reduce((sum, slot) => sum + slot.duration_minutes, 0);
      console.log(`Total scheduled: ${totalMinutes} minutes (${(totalMinutes/60).toFixed(1)} hours)`);
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

checkChrisShift();