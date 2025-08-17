const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:sassysalad@localhost:5432/cnc_scheduler'
});

async function fixWorkingHoursFunction() {
  try {
    console.log('Fixing get_employee_working_hours function to use correct column names...\n');
    
    // Drop and recreate the function with the correct column references
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
        
        -- First check employee_work_schedules (primary source) - using correct column names
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
            CASE v_day_of_week
              WHEN 1 THEN ess.monday_start
              WHEN 2 THEN ess.tuesday_start
              WHEN 3 THEN ess.wednesday_start
              WHEN 4 THEN ess.thursday_start
              WHEN 5 THEN ess.friday_start
              WHEN 6 THEN ess.saturday_start
              WHEN 7 THEN ess.sunday_start
            END,
            CASE v_day_of_week
              WHEN 1 THEN ess.monday_end
              WHEN 2 THEN ess.tuesday_end
              WHEN 3 THEN ess.wednesday_end
              WHEN 4 THEN ess.thursday_end
              WHEN 5 THEN ess.friday_end
              WHEN 6 THEN ess.saturday_end
              WHEN 7 THEN ess.sunday_end
            END
          INTO v_start_hour, v_end_hour
          FROM employee_shift_schedule ess
          WHERE ess.employee_id = emp_id
          LIMIT 1;
          
          -- Determine if it's a working day based on shift schedule
          v_is_working := (v_start_hour IS NOT NULL AND v_end_hour IS NOT NULL);
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
    console.log('✅ Created new function with correct column references');
    
    // Test the function
    console.log('\nTesting function with Chris Johnson (ID 7):');
    const testResult = await pool.query(`
      SELECT * FROM get_employee_working_hours(7, '2025-08-17'::date)
    `);
    console.log('Result:', testResult.rows[0]);
    
    console.log('\n✨ Function successfully fixed!');
    
  } catch (error) {
    console.error('Error fixing function:', error);
  } finally {
    await pool.end();
  }
}

fixWorkingHoursFunction();