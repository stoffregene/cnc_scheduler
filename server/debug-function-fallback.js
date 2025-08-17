const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:sassysalad@localhost:5432/cnc_scheduler'
});

async function debugFallback() {
  try {
    console.log('=== DEBUGGING FUNCTION FALLBACK ===\n');
    
    // Get Chris Johnson ID
    const chrisResult = await pool.query(`
      SELECT id FROM employees WHERE first_name = 'Chris' AND last_name = 'Johnson'
    `);
    const chrisId = chrisResult.rows[0].id;
    
    const monday = '2025-01-20';
    const dayOfWeek = 1; // Monday
    
    console.log(`Testing Chris (ID: ${chrisId}) for Monday (${monday}, day_of_week: ${dayOfWeek})`);
    
    // Test the exact query from the function
    console.log('\n1. Testing employee_work_schedules query:');
    const scheduleQuery = `
      SELECT 
        CASE 
          WHEN ews.day_of_week = $2 THEN EXTRACT(HOUR FROM ews.start_time)::INTEGER
          ELSE NULL
        END as start_hour,
        CASE 
          WHEN ews.day_of_week = $2 THEN EXTRACT(HOUR FROM ews.end_time)::INTEGER  
          ELSE NULL
        END as end_hour,
        CASE 
          WHEN ews.day_of_week = $2 THEN ews.enabled
          ELSE FALSE
        END as is_working
      FROM employee_work_schedules ews
      WHERE ews.employee_id = $1
      AND ews.day_of_week = $2
      AND ews.enabled = true
      LIMIT 1
    `;
    
    const scheduleResult = await pool.query(scheduleQuery, [chrisId, dayOfWeek]);
    console.log('Query result:', scheduleResult.rows);
    
    if (scheduleResult.rows.length === 0) {
      console.log('❌ No rows returned - this is the problem!');
      
      // Check what data exists
      console.log('\n2. What schedules exist for Chris?');
      const allSchedules = await pool.query(`
        SELECT employee_id, day_of_week, start_time, end_time, enabled
        FROM employee_work_schedules
        WHERE employee_id = $1
      `, [chrisId]);
      
      console.log('All Chris schedules:', allSchedules.rows);
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

debugFallback();
