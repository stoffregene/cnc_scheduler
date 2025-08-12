const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function fixWorkingHoursFunction() {
  try {
    console.log('Updating get_employee_working_hours function to use employee_work_schedules table...');
    
    // Drop the existing function first
    await pool.query('DROP FUNCTION IF EXISTS get_employee_working_hours(integer, date)');
    console.log('Dropped existing function...');
    
    // Recreate the function to use the correct table
    const updateFunctionSQL = `
    CREATE OR REPLACE FUNCTION get_employee_working_hours(emp_id INTEGER, target_date DATE)
    RETURNS TABLE (
      start_hour INTEGER,
      end_hour INTEGER,
      duration_hours DECIMAL,
      is_overnight BOOLEAN,
      is_working_day BOOLEAN
    ) AS $$
    BEGIN
      -- First check employee_work_schedules table (the correct source)
      RETURN QUERY
      SELECT 
        EXTRACT(hour FROM ews.start_time)::INTEGER as start_hour,
        EXTRACT(hour FROM ews.end_time)::INTEGER as end_hour,
        EXTRACT(epoch FROM (ews.end_time - ews.start_time)) / 3600.0 as duration_hours,
        false as is_overnight, -- Assuming no overnight shifts for now
        ews.enabled as is_working_day
      FROM employee_work_schedules ews
      WHERE ews.employee_id = emp_id 
        AND ews.day_of_week = EXTRACT(dow FROM target_date)
        AND ews.enabled = true
      LIMIT 1;
      
      -- If no employee_work_schedules entry, check employee_shift_schedule
      IF NOT FOUND THEN
        RETURN QUERY
        SELECT 
          ess.start_hour,
          ess.end_hour,
          ess.duration_hours,
          ess.is_overnight,
          ess.is_working_day
        FROM employee_shift_schedule ess
        WHERE ess.employee_id = emp_id 
          AND ess.day_of_week = EXTRACT(dow FROM target_date)
          AND ess.effective_date <= target_date
        ORDER BY ess.effective_date DESC
        LIMIT 1;
      END IF;
      
      -- Final fallback to employee custom hours and shift patterns
      IF NOT FOUND THEN
        RETURN QUERY
        SELECT 
          COALESCE(e.custom_start_hour, sp.start_hour, 6) as start_hour,
          COALESCE(e.custom_end_hour, sp.end_hour, 18) as end_hour,
          COALESCE(e.custom_duration_hours, sp.duration_hours, 12.0) as duration_hours,
          COALESCE(sp.is_overnight, false) as is_overnight,
          CASE 
            WHEN e.work_days IS NOT NULL THEN EXTRACT(dow FROM target_date) = ANY(e.work_days)
            ELSE (EXTRACT(dow FROM target_date) BETWEEN 1 AND 5) -- Mon-Fri default
          END as is_working_day
        FROM employees e
        LEFT JOIN shift_patterns sp ON e.shift_pattern_id = sp.id
        WHERE e.id = emp_id;
      END IF;
    END;
    $$ LANGUAGE plpgsql;
    `;
    
    await pool.query(updateFunctionSQL);
    
    console.log('✅ Function updated successfully!');
    console.log('\nTesting the updated function...');
    
    // Test with Drew
    const drewResult = await pool.query('SELECT * FROM get_employee_working_hours(9, CURRENT_DATE)');
    console.log(`Drew (ID 9): ${JSON.stringify(drewResult.rows[0], null, 2)}`);
    
    // Test with Kyle 
    const kyleResult = await pool.query('SELECT * FROM get_employee_working_hours(13, CURRENT_DATE)');
    console.log(`Kyle (ID 13): ${JSON.stringify(kyleResult.rows[0], null, 2)}`);
    
    console.log('\n✅ The scheduling service will now use the correct employee work schedules!');
    console.log('Drew should show: 4:30 AM - 3:00 PM (10.5 hours)');
    console.log('Kyle should show: 6:00 AM - 4:30 PM (10.5 hours)');
    
  } catch (error) {
    console.error('Error updating function:', error);
  } finally {
    await pool.end();
  }
}

fixWorkingHoursFunction();