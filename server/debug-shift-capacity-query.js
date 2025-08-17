const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:sassysalad@localhost:5432/cnc_scheduler'
});

async function debugShiftCapacityQuery() {
  try {
    console.log('=== DEBUGGING SHIFT CAPACITY QUERY ===\n');
    
    const targetDate = '2025-08-17';
    console.log('Target date:', targetDate);
    
    // Run the exact query from shift-capacity.js
    const capacityQuery = `
      SELECT 
        e.id as numeric_id,
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
      WHERE e.status = 'active'
      GROUP BY e.id, e.employee_id, e.first_name, e.last_name, e.position
      ORDER BY e.first_name, e.last_name
    `;
    
    const result = await pool.query(capacityQuery, [targetDate, targetDate]);
    
    console.log(`Found ${result.rows.length} active employees:\n`);
    
    for (const employee of result.rows) {
      console.log(`--- ${employee.first_name} ${employee.last_name} (ID: ${employee.numeric_id}) ---`);
      console.log(`  Scheduled minutes: ${employee.total_scheduled_minutes}`);
      console.log(`  Working days: ${employee.working_days}`);
      
      // Test the get_employee_working_hours function for this employee
      try {
        const workingHours = await pool.query(`
          SELECT * FROM get_employee_working_hours($1, $2::date)
        `, [employee.numeric_id, targetDate]);
        
        if (workingHours.rows.length > 0) {
          const wh = workingHours.rows[0];
          console.log(`  Working hours: ${wh.start_hour}:00-${wh.end_hour}:00 (${wh.duration_hours}h, working: ${wh.is_working_day})`);
          
          if (wh.is_working_day) {
            const shiftType = (wh.start_hour >= 4 && wh.start_hour <= 15) ? '1st shift' : '2nd shift';
            console.log(`  → ${shiftType}`);
          } else {
            console.log(`  → Not working today`);
          }
        } else {
          console.log('  → No working hours found');
        }
      } catch (error) {
        console.log(`  → ERROR getting working hours: ${error.message}`);
      }
      console.log('');
    }
    
    // Check if the get_employee_working_hours function exists and works
    console.log('Testing get_employee_working_hours function directly:');
    try {
      const funcTest = await pool.query(`
        SELECT * FROM get_employee_working_hours(7, '2025-08-17'::date)
      `);
      console.log('Chris Johnson (ID 7) test result:', funcTest.rows[0]);
    } catch (error) {
      console.log('Function test ERROR:', error.message);
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

debugShiftCapacityQuery();