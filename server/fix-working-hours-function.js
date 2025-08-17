const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:sassysalad@localhost:5432/cnc_scheduler'
});

async function fixWorkingHoursFunction() {
  try {
    console.log('Fixing get_employee_working_hours function...\n');
    
    // Drop and recreate the function with correct column names
    await pool.query('DROP FUNCTION IF EXISTS get_employee_working_hours(INTEGER, DATE)');
    
    const functionSQL = `
      CREATE OR REPLACE FUNCTION get_employee_working_hours(emp_id INTEGER, work_date DATE)
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
            0::INTEGER,
            0::INTEGER,
            0::NUMERIC,
            FALSE,
            FALSE;
          RETURN;
        END IF;
        
        -- First check employee_work_schedules (primary source) - FIX: use start_time/end_time
        SELECT 
          CASE 
            WHEN ews.day_of_week = v_day_of_week THEN EXTRACT(HOUR FROM ews.start_time)::INTEGER
            ELSE NULL
          END,
          CASE 
            WHEN ews.day_of_week = v_day_of_week THEN EXTRACT(HOUR FROM ews.end_time)::INTEGER
            ELSE NULL
          END,
          CASE 
            WHEN ews.day_of_week = v_day_of_week THEN ews.enabled
            ELSE FALSE
          END
        INTO v_start_hour, v_end_hour, v_is_working
        FROM employee_work_schedules ews
        WHERE ews.employee_id = emp_id
        AND ews.day_of_week = v_day_of_week
        AND ews.enabled = true
        LIMIT 1;
        
        -- Default to standard hours if nothing found
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
            END,
            v_end_hour < v_start_hour,
            TRUE;
        ELSE
          RETURN QUERY SELECT 
            0::INTEGER,
            0::INTEGER,
            0::NUMERIC,
            FALSE,
            FALSE;
        END IF;
      END;
      $$ LANGUAGE plpgsql;
    `;
    
    await pool.query(functionSQL);
    console.log('✅ Fixed get_employee_working_hours function');
    
    // Test the function with Chris Johnson
    console.log('\nTesting with Chris Johnson:');
    const chrisResult = await pool.query(`
      SELECT id FROM employees WHERE first_name = 'Chris' AND last_name = 'Johnson'
    `);
    
    if (chrisResult.rows.length > 0) {
      const chrisId = chrisResult.rows[0].id;
      const workingHours = await pool.query(`
        SELECT * FROM get_employee_working_hours($1, CURRENT_DATE)
      `, [chrisId]);
      
      console.log('Chris Johnson working hours:', workingHours.rows[0]);
      
      const wh = workingHours.rows[0];
      const shift = (wh.start_hour >= 4 && wh.start_hour <= 15) ? '1st shift' : '2nd shift';
      console.log(`Shift assignment: ${shift}`);
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

fixWorkingHoursFunction();
