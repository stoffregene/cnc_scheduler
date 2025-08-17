const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:sassysalad@localhost:5432/cnc_scheduler'
});

async function debugSlotDate() {
  try {
    console.log('=== DEBUGGING SLOT DATE FORMAT ===\n');
    
    // Check Chris Johnson's actual schedule_slots
    console.log('Chris Johnson schedule slots:');
    const chrisSlots = await pool.query(`
      SELECT 
        ss.slot_date,
        ss.start_datetime,
        ss.duration_minutes,
        ss.status,
        j.job_number
      FROM schedule_slots ss
      JOIN job_routings jr ON ss.job_routing_id = jr.id
      JOIN jobs j ON jr.job_id = j.id
      WHERE ss.employee_id = 7 -- Chris Johnson
      ORDER BY ss.start_datetime
    `);
    
    chrisSlots.rows.forEach(slot => {
      console.log(`- Job ${slot.job_number}: slot_date=${slot.slot_date}, start_datetime=${slot.start_datetime}, status=${slot.status}`);
    });
    
    // Test the exact query from the shift-capacity route
    console.log('\n=== TESTING ROUTE QUERY ===');
    const startDate = '2025-08-18';  // Monday
    const endDate = '2025-08-24';    // Sunday
    console.log(`Date range: ${startDate} to ${endDate}`);
    
    const routeQuery = `
      SELECT 
        e.employee_id,
        e.first_name,
        e.last_name,
        e.position,
        COALESCE(SUM(ss.duration_minutes), 0) as total_scheduled_minutes,
        COUNT(DISTINCT ss.slot_date) as working_days
      FROM employees e
      LEFT JOIN schedule_slots ss ON e.id = ss.employee_id
        AND ss.slot_date BETWEEN $1::date AND $2::date
        AND ss.status IN ('scheduled', 'in_progress')
      WHERE e.status = 'active' AND e.first_name = 'Chris' AND e.last_name = 'Johnson'
      GROUP BY e.employee_id, e.first_name, e.last_name, e.position
      ORDER BY e.first_name, e.last_name
    `;
    
    const routeResult = await pool.query(routeQuery, [startDate, endDate]);
    
    console.log('Route query result for Chris:');
    console.log(routeResult.rows[0]);
    
    // Check if the slot_date is in the range
    console.log('\n=== CHECKING DATE RANGE MATCH ===');
    const dateCheck = await pool.query(`
      SELECT 
        slot_date,
        slot_date >= $1::date as is_after_start,
        slot_date <= $2::date as is_before_end,
        slot_date BETWEEN $1::date AND $2::date as is_in_range
      FROM schedule_slots ss
      WHERE ss.employee_id = 7
      LIMIT 5
    `, [startDate, endDate]);
    
    dateCheck.rows.forEach(check => {
      console.log(`slot_date: ${check.slot_date}, after_start: ${check.is_after_start}, before_end: ${check.is_before_end}, in_range: ${check.is_in_range}`);
    });
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

debugSlotDate();