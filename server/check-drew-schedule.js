const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function checkDrewSchedule() {
  try {
    // Find Drew's employee ID and basic info
    const drewResult = await pool.query(`
      SELECT id, first_name, last_name, status
      FROM employees 
      WHERE LOWER(first_name || ' ' || last_name) LIKE '%drew%darling%'
         OR LOWER(first_name || ' ' || last_name) LIKE '%darling%'
    `);
    
    console.log('Drew Darling employee info:');
    console.log(JSON.stringify(drewResult.rows, null, 2));
    
    if (drewResult.rows.length > 0) {
      const drewId = drewResult.rows[0].id;
      
      // Check Drew's shift schedule
      const shiftResult = await pool.query(`
        SELECT 
          es.*,
          s.shift_name,
          s.start_time,
          s.end_time,
          s.days_of_week
        FROM employee_shifts es
        JOIN shifts s ON es.shift_id = s.id
        WHERE es.employee_id = $1
      `, [drewId]);
      
      console.log('\nDrew\'s shift schedule:');
      console.log(JSON.stringify(shiftResult.rows, null, 2));
      
      // Check any recent scheduled slots for Drew
      const recentSlots = await pool.query(`
        SELECT 
          ss.id,
          ss.start_datetime,
          ss.end_datetime,
          ss.duration_minutes,
          j.job_number,
          jr.operation_name
        FROM schedule_slots ss
        JOIN jobs j ON ss.job_id = j.id
        JOIN job_routings jr ON ss.job_routing_id = jr.id
        WHERE ss.employee_id = $1
        AND ss.slot_date >= CURRENT_DATE - INTERVAL '7 days'
        ORDER BY ss.start_datetime
        LIMIT 10
      `, [drewId]);
      
      console.log('\nDrew\'s recent scheduled slots:');
      recentSlots.rows.forEach(slot => {
        const start = new Date(slot.start_datetime);
        const end = new Date(slot.end_datetime);
        console.log(`  ${slot.job_number} - ${slot.operation_name}: ${start.toLocaleString()} to ${end.toLocaleString()} (${slot.duration_minutes} min)`);
      });
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

checkDrewSchedule();