const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function checkDrewDetails() {
  try {
    // Check Drew's complete employee record
    const drewResult = await pool.query(`
      SELECT 
        id, first_name, last_name, shift_type, work_days,
        start_time, end_time, shift_pattern_id,
        custom_start_hour, custom_end_hour, custom_duration_hours
      FROM employees 
      WHERE id = 9
    `);
    
    console.log('Drew Darling complete schedule info:');
    console.log(JSON.stringify(drewResult.rows[0], null, 2));
    
    // Check shift pattern if he has one
    if (drewResult.rows[0].shift_pattern_id) {
      const patternResult = await pool.query(`
        SELECT * FROM shift_patterns WHERE id = $1
      `, [drewResult.rows[0].shift_pattern_id]);
      
      console.log('\nShift pattern details:');
      console.log(JSON.stringify(patternResult.rows[0], null, 2));
    }
    
    // Check his recent scheduled time slots to see actual vs expected
    const recentSlots = await pool.query(`
      SELECT 
        ss.id,
        ss.start_datetime,
        ss.end_datetime,
        ss.duration_minutes,
        j.job_number,
        jr.operation_name,
        EXTRACT(HOUR FROM ss.start_datetime) as start_hour,
        EXTRACT(HOUR FROM ss.end_datetime) as end_hour
      FROM schedule_slots ss
      JOIN jobs j ON ss.job_id = j.id
      JOIN job_routings jr ON ss.job_routing_id = jr.id
      WHERE ss.employee_id = 9
      ORDER BY ss.start_datetime DESC
      LIMIT 5
    `);
    
    console.log('\nDrew\'s recent scheduled slots with hours:');
    recentSlots.rows.forEach(slot => {
      const start = new Date(slot.start_datetime);
      const end = new Date(slot.end_datetime);
      console.log(`  ${slot.job_number} - ${slot.operation_name}:`);
      console.log(`    Start: ${start.toLocaleString()} (Hour: ${slot.start_hour})`);
      console.log(`    End: ${end.toLocaleString()} (Hour: ${slot.end_hour})`);
      console.log(`    Duration: ${slot.duration_minutes} minutes\n`);
    });
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

checkDrewDetails();