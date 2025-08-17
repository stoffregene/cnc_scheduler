const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:sassysalad@localhost:5432/cnc_scheduler'
});

async function createTimeOffTable() {
  try {
    console.log('Creating employee_time_off table and related functions...\n');
    
    // 1. Create the employee_time_off table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS employee_time_off (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        reason VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT valid_date_range CHECK (end_date >= start_date)
      )
    `);
    console.log('✅ Created employee_time_off table');
    
    // 2. Create index for faster lookups
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_time_off_employee_dates 
      ON employee_time_off(employee_id, start_date, end_date)
    `);
    console.log('✅ Created index on employee_time_off');
    
    // 3. Update the get_employee_working_hours function to check time off
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
          CASE 
            WHEN ews.day_of_week = v_day_of_week THEN ews.start_hour
            ELSE NULL
          END,
          CASE 
            WHEN ews.day_of_week = v_day_of_week THEN ews.end_hour
            ELSE NULL
          END,
          CASE 
            WHEN ews.day_of_week = v_day_of_week THEN ews.is_working_day
            ELSE FALSE
          END
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
              WHEN v_day_of_week BETWEEN 1 AND 5 THEN e.custom_start_hour
              ELSE NULL
            END,
            CASE 
              WHEN v_day_of_week BETWEEN 1 AND 5 THEN e.custom_end_hour
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
    console.log('✅ Updated get_employee_working_hours function to check time off');
    
    // 4. Create a trigger function to handle displacement when time off is added
    await pool.query(`
      CREATE OR REPLACE FUNCTION handle_time_off_displacement()
      RETURNS TRIGGER AS $$
      DECLARE
        affected_slot RECORD;
        alternate_employee_id INTEGER;
      BEGIN
        -- Find all schedule slots affected by the new time off
        FOR affected_slot IN 
          SELECT ss.*, jr.job_id, jr.operation_id
          FROM schedule_slots ss
          JOIN job_routings jr ON ss.job_routing_id = jr.id
          WHERE ss.employee_id = NEW.employee_id
          AND ss.start_time::date BETWEEN NEW.start_date AND NEW.end_date
          AND ss.status != 'completed'
        LOOP
          -- Try to find an alternate employee
          SELECT oma.employee_id INTO alternate_employee_id
          FROM operator_machine_assignments oma
          JOIN employees e ON oma.employee_id = e.id
          WHERE oma.machine_id = affected_slot.machine_id
          AND oma.employee_id != NEW.employee_id
          AND NOT EXISTS (
            SELECT 1 FROM employee_time_off eto
            WHERE eto.employee_id = oma.employee_id
            AND affected_slot.start_time::date BETWEEN eto.start_date AND eto.end_date
          )
          LIMIT 1;
          
          IF alternate_employee_id IS NOT NULL THEN
            -- Reassign to alternate employee
            UPDATE schedule_slots
            SET employee_id = alternate_employee_id,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = affected_slot.id;
            
            RAISE NOTICE 'Reassigned slot % to employee %', affected_slot.id, alternate_employee_id;
          ELSE
            -- No alternate found, mark slot for rescheduling
            UPDATE schedule_slots
            SET status = 'needs_rescheduling',
                employee_id = NULL,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = affected_slot.id;
            
            RAISE NOTICE 'Marked slot % for rescheduling', affected_slot.id;
          END IF;
        END LOOP;
        
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
    console.log('✅ Created handle_time_off_displacement function');
    
    // 5. Create trigger for automatic displacement
    await pool.query(`
      CREATE TRIGGER trigger_time_off_displacement
      AFTER INSERT OR UPDATE ON employee_time_off
      FOR EACH ROW
      EXECUTE FUNCTION handle_time_off_displacement();
    `);
    console.log('✅ Created trigger for automatic displacement on time off');
    
    console.log('\n✨ Time off system successfully created!');
    console.log('The system will now:');
    console.log('  1. Track employee time off in the employee_time_off table');
    console.log('  2. Automatically exclude time off dates from availability');
    console.log('  3. Attempt to reassign or reschedule jobs when time off is added');
    
  } catch (error) {
    console.error('Error creating time off system:', error);
  } finally {
    await pool.end();
  }
}

createTimeOffTable();