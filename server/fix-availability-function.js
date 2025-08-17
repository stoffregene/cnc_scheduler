const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://postgres:sassysalad@localhost:5432/cnc_scheduler'
});

async function updateFunction() {
  try {
    console.log('Updating get_employee_working_hours function to check time off...');
    
    // Drop and recreate the function with time off checking
    await pool.query(`
      CREATE OR REPLACE FUNCTION get_employee_working_hours(
        emp_id INTEGER, 
        target_date DATE
      )
      RETURNS TABLE(
        start_hour DECIMAL,
        end_hour DECIMAL,
        duration_hours DECIMAL,
        is_overnight BOOLEAN,
        is_working_day BOOLEAN
      )
      LANGUAGE plpgsql
      AS $$
      BEGIN
        -- FIRST: Check if employee has time off/unavailability for this date
        IF EXISTS (
          SELECT 1 
          FROM employee_availability ea
          WHERE ea.employee_id = emp_id 
            AND ea.date = target_date
            AND ea.status = 'unavailable'
            AND ea.affects_scheduling = true
        ) THEN
          -- Employee is unavailable - return no working hours
          RETURN QUERY
          SELECT 
            0::DECIMAL as start_hour,
            0::DECIMAL as end_hour,
            0::DECIMAL as duration_hours,
            false as is_overnight,
            false as is_working_day;
          RETURN;
        END IF;
        
        -- Check employee_work_schedules table (the primary source)
        RETURN QUERY
        SELECT 
          -- Convert time to decimal hours for proper calculations
          EXTRACT(hour FROM ews.start_time) + EXTRACT(minute FROM ews.start_time)/60.0 as start_hour,
          EXTRACT(hour FROM ews.end_time) + EXTRACT(minute FROM ews.end_time)/60.0 as end_hour,
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
            ess.start_hour::DECIMAL,
            ess.end_hour::DECIMAL,
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
            COALESCE(e.custom_start_hour, sp.start_hour, 6)::DECIMAL as start_hour,
            COALESCE(e.custom_end_hour, sp.end_hour, 18)::DECIMAL as end_hour,
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
      $$
    `);
    
    console.log('✅ Function updated successfully!');
    
    // Test the updated function with Drew's time off
    console.log('\n🧪 Testing updated function with Drew\'s time off...');
    
    // Test Monday (should be unavailable)
    const mondayResult = await pool.query(`
      SELECT * FROM get_employee_working_hours(9, '2025-08-18'::date)
    `);
    
    console.log('\nDrew\'s availability on Monday Aug 18, 2025:');
    const monday = mondayResult.rows[0];
    console.log(`  Working day: ${monday.is_working_day} (should be false)`);
    console.log(`  Start hour: ${monday.start_hour}`);
    console.log(`  End hour: ${monday.end_hour}`);
    console.log(`  Duration: ${monday.duration_hours} hours`);
    
    // Test Thursday (should be available)
    const thursdayResult = await pool.query(`
      SELECT * FROM get_employee_working_hours(9, '2025-08-21'::date)
    `);
    
    console.log('\nDrew\'s availability on Thursday Aug 21, 2025:');
    const thursday = thursdayResult.rows[0];
    console.log(`  Working day: ${thursday.is_working_day} (should be true)`);
    console.log(`  Start hour: ${thursday.start_hour}`);
    console.log(`  End hour: ${thursday.end_hour}`);
    console.log(`  Duration: ${thursday.duration_hours} hours`);
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    console.error('Details:', error);
    process.exit(1);
  }
}

updateFunction();