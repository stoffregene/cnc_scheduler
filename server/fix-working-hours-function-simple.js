const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:sassysalad@localhost:5432/cnc_scheduler'
});

async function fixWorkingHoursFunctionSimple() {
  try {
    console.log('Creating simplified get_employee_working_hours function...\n');
    
    // Drop and recreate the function with correct logic
    await pool.query(`
      DROP FUNCTION IF EXISTS get_employee_working_hours(INTEGER, DATE);
    `);
    console.log('✅ Dropped old function');
    
    await pool.query(`
      CREATE OR REPLACE FUNCTION get_employee_working_hours(
        emp_id INTEGER,
        work_date DATE
      )
      RETURNS TABLE(
        start_hour INTEGER,
        end_hour INTEGER,
        duration_hours NUMERIC,
        is_overnight BOOLEAN,
        is_working_day BOOLEAN
      ) AS $$
      DECLARE
        v_day_of_week INTEGER;
        v_start_hour INTEGER;
        v_end_hour INTEGER;
        v_is_working BOOLEAN;
        v_has_time_off BOOLEAN;
      BEGIN
        -- Get day of week (1=Monday, 7=Sunday)
        v_day_of_week := EXTRACT(ISODOW FROM work_date);
        
        -- Check if employee has time off for this date
        SELECT EXISTS(
          SELECT 1 FROM employee_time_off
          WHERE employee_id = emp_id
          AND work_date BETWEEN start_date AND end_date
        ) INTO v_has_time_off;
        
        -- If employee has time off, return not working
        IF v_has_time_off THEN
          RETURN QUERY SELECT 
            0::INTEGER as start_hour,
            0::INTEGER as end_hour,
            0::NUMERIC as duration_hours,
            FALSE as is_overnight,
            FALSE as is_working_day;
          RETURN;
        END IF;
        
        -- First check employee_work_schedules (primary source)
        SELECT 
          ews.start_hour,
          ews.end_hour,
          ews.is_working_day
        INTO v_start_hour, v_end_hour, v_is_working
        FROM employee_work_schedules ews
        WHERE ews.employee_id = emp_id
        AND ews.day_of_week = v_day_of_week
        LIMIT 1;
        
        -- If no schedule found in employee_work_schedules, check employee_shift_schedule
        IF v_start_hour IS NULL THEN
          SELECT 
            ess.start_hour,
            ess.end_hour,
            ess.is_working_day
          INTO v_start_hour, v_end_hour, v_is_working
          FROM employee_shift_schedule ess
          WHERE ess.employee_id = emp_id
          AND ess.day_of_week = v_day_of_week
          LIMIT 1;
        END IF;
        
        -- If still no schedule found, use employees table as fallback
        IF v_start_hour IS NULL THEN
          SELECT 
            CASE 
              WHEN v_day_of_week BETWEEN 1 AND 5 THEN 
                CASE 
                  WHEN e.custom_start_hour IS NOT NULL THEN e.custom_start_hour
                  WHEN e.start_time IS NOT NULL THEN EXTRACT(HOUR FROM e.start_time)::INTEGER
                  ELSE NULL
                END
              ELSE NULL
            END,
            CASE 
              WHEN v_day_of_week BETWEEN 1 AND 5 THEN 
                CASE 
                  WHEN e.custom_end_hour IS NOT NULL THEN e.custom_end_hour
                  WHEN e.end_time IS NOT NULL THEN EXTRACT(HOUR FROM e.end_time)::INTEGER
                  ELSE NULL
                END
              ELSE NULL
            END
          INTO v_start_hour, v_end_hour
          FROM employees e
          WHERE e.id = emp_id;
          
          -- For fallback, assume Monday-Friday are working days
          v_is_working := (v_day_of_week BETWEEN 1 AND 5 AND v_start_hour IS NOT NULL);
        END IF;
        
        -- Default to standard hours if still nothing found
        IF v_start_hour IS NULL AND v_day_of_week BETWEEN 1 AND 5 THEN
          v_start_hour := 8;
          v_end_hour := 17;
          v_is_working := TRUE;
        ELSIF v_start_hour IS NULL THEN
          v_is_working := FALSE;
        END IF;
        
        -- Calculate duration and overnight status
        IF v_is_working THEN
          RETURN QUERY SELECT 
            v_start_hour,
            v_end_hour,
            CASE 
              WHEN v_end_hour > v_start_hour THEN (v_end_hour - v_start_hour)::NUMERIC
              ELSE (24 - v_start_hour + v_end_hour)::NUMERIC
            END as duration_hours,
            v_end_hour < v_start_hour as is_overnight,
            TRUE as is_working_day;
        ELSE
          RETURN QUERY SELECT 
            0::INTEGER as start_hour,
            0::INTEGER as end_hour,
            0::NUMERIC as duration_hours,
            FALSE as is_overnight,
            FALSE as is_working_day;
        END IF;
      END;
      $$ LANGUAGE plpgsql;
    `);
    console.log('✅ Created simplified function');
    
    // Test the function with Chris Johnson
    console.log('\nTesting function with Chris Johnson (ID 7):');
    const testResult = await pool.query(`
      SELECT * FROM get_employee_working_hours(7, '2025-08-17'::date)
    `);
    console.log('Result:', testResult.rows[0]);
    
    // Test with a few other employees
    console.log('\nTesting with other employees:');
    const employees = await pool.query('SELECT id, first_name, last_name FROM employees WHERE status = \'active\' LIMIT 3');
    
    for (const emp of employees.rows) {
      const result = await pool.query(`
        SELECT * FROM get_employee_working_hours($1, '2025-08-17'::date)
      `, [emp.id]);
      
      const wh = result.rows[0];
      const shift = wh.is_working_day ? 
        (wh.start_hour >= 4 && wh.start_hour <= 15 ? '1st shift' : '2nd shift') : 
        'not working';
      
      console.log(`${emp.first_name} ${emp.last_name}: ${wh.start_hour}:00-${wh.end_hour}:00 (${wh.duration_hours}h) → ${shift}`);
    }
    
    console.log('\n✨ Function successfully fixed!');
    
  } catch (error) {
    console.error('Error fixing function:', error);
  } finally {
    await pool.end();
  }
}

fixWorkingHoursFunctionSimple();