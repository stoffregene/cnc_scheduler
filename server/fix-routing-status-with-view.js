const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:sassysalad@localhost:5432/cnc_scheduler'
});

async function fixRoutingStatusWithView() {
  try {
    console.log('Fixing routing_status column length...');
    
    // 1. Drop the view temporarily
    await pool.query(`
      DROP VIEW IF EXISTS outsourced_operations_view CASCADE
    `);
    console.log('✅ Dropped outsourced_operations_view');
    
    // 2. Fix the column length
    await pool.query(`
      ALTER TABLE job_routings 
      ALTER COLUMN routing_status TYPE VARCHAR(50)
    `);
    console.log('✅ Extended routing_status to VARCHAR(50)');
    
    // 3. Recreate the view (if it was important)
    await pool.query(`
      CREATE OR REPLACE VIEW outsourced_operations_view AS
      SELECT 
        jr.id,
        j.job_number,
        jr.operation_name,
        jr.vendor_name,
        jr.vendor_lead_days,
        jr.routing_status,
        j.priority_score
      FROM job_routings jr
      JOIN jobs j ON jr.job_id = j.id
      WHERE jr.is_outsourced = true
      ORDER BY j.priority_score DESC
    `);
    console.log('✅ Recreated outsourced_operations_view');
    
    // 4. Verify the change
    const verifyResult = await pool.query(`
      SELECT character_maximum_length 
      FROM information_schema.columns 
      WHERE table_name = 'job_routings' 
      AND column_name = 'routing_status'
    `);
    
    console.log('✅ New routing_status max length:', verifyResult.rows[0]?.character_maximum_length);
    
    // 5. Also fix the trigger to use shorter status value
    await pool.query(`
      CREATE OR REPLACE FUNCTION handle_time_off_advanced()
      RETURNS TRIGGER AS $$
      DECLARE
        affected_slot RECORD;
        substitute_operator RECORD;
        operator_return_date DATE;
        job_count INTEGER := 0;
        substituted_count INTEGER := 0;
        pushed_count INTEGER := 0;
        log_id INTEGER;
      BEGIN
        -- Calculate operator return date (day after time off ends)
        operator_return_date := NEW.end_date + INTERVAL '1 day';
        
        -- Create displacement log entry
        INSERT INTO displacement_logs (
          trigger_type,
          trigger_details,
          execution_status,
          created_at
        ) VALUES (
          'time_off_advanced',
          json_build_object(
            'employee_id', NEW.employee_id,
            'start_date', NEW.start_date,
            'end_date', NEW.end_date,
            'return_date', operator_return_date,
            'reason', NEW.reason
          ),
          'processing',
          CURRENT_TIMESTAMP
        ) RETURNING id INTO log_id;
        
        -- Process all affected schedule slots ordered by priority (highest first)
        FOR affected_slot IN 
          SELECT 
            ss.id as slot_id,
            ss.job_routing_id,
            ss.machine_id,
            ss.start_datetime,
            ss.end_datetime,
            ss.status,
            jr.job_id,
            jr.operation_name,
            jr.sequence_order,
            j.job_number,
            j.priority_score,
            j.promised_date,
            j.schedule_locked,
            e.first_name || ' ' || e.last_name as employee_name,
            m.name as machine_name,
            -- Check status flags
            (ss.status IN ('in_progress', 'started')) as is_in_progress,
            (j.promised_date - CURRENT_DATE) <= 14 as in_firm_zone
          FROM schedule_slots ss
          JOIN job_routings jr ON ss.job_routing_id = jr.id
          JOIN jobs j ON jr.job_id = j.id
          JOIN employees e ON ss.employee_id = e.id
          JOIN machines m ON ss.machine_id = m.id
          WHERE ss.employee_id = NEW.employee_id
          AND ss.start_datetime::date BETWEEN NEW.start_date AND NEW.end_date
          ORDER BY 
            (ss.status IN ('in_progress', 'started')) DESC,  -- In-progress jobs first
            j.priority_score DESC  -- Then by priority
        LOOP
          job_count := job_count + 1;
          
          -- RULE 2: If job is in progress, push to operator return date
          IF affected_slot.is_in_progress THEN
            RAISE NOTICE 'Job % is in progress - pushing to operator return date %', 
              affected_slot.job_number, operator_return_date;
            
            -- Calculate new datetime based on return date and original time
            UPDATE schedule_slots
            SET 
              start_datetime = operator_return_date::timestamp + (affected_slot.start_datetime::time)::interval,
              end_datetime = operator_return_date::timestamp + (affected_slot.end_datetime::time)::interval,
              slot_date = operator_return_date,
              notes = COALESCE(notes, '') || ' | Pushed due to operator absence (was in progress)'
            WHERE id = affected_slot.slot_id;
            
            pushed_count := pushed_count + 1;
            
            -- Mark downstream operations for rescheduling (using shorter status)
            UPDATE job_routings
            SET routing_status = 'reschedule'
            WHERE job_id = affected_slot.job_id
            AND sequence_order > affected_slot.sequence_order;
            
            CONTINUE; -- Move to next job
          END IF;
          
          -- RULE 3: For non-in-progress jobs, try operator substitution
          -- Look for operators working on lower priority jobs
          SELECT 
            ss2.employee_id,
            e2.first_name || ' ' || e2.last_name as operator_name,
            j2.job_number as current_job,
            j2.priority_score as current_priority
          INTO substitute_operator
          FROM schedule_slots ss2
          JOIN job_routings jr2 ON ss2.job_routing_id = jr2.id
          JOIN jobs j2 ON jr2.job_id = j2.id
          JOIN employees e2 ON ss2.employee_id = e2.id
          JOIN operator_machine_assignments oma ON oma.employee_id = e2.id
          WHERE 
            -- Must be qualified for the machine
            oma.machine_id = affected_slot.machine_id
            -- Not the absent operator
            AND ss2.employee_id != NEW.employee_id
            -- Working during the same time period
            AND ss2.start_datetime::date = affected_slot.start_datetime::date
            AND ss2.start_datetime::time <= affected_slot.start_datetime::time
            AND ss2.end_datetime::time >= affected_slot.end_datetime::time
            -- Working on lower priority job (15% rule)
            AND j2.priority_score < (affected_slot.priority_score * 0.85)
            -- Not working on locked or in-progress jobs
            AND ss2.status NOT IN ('in_progress', 'started', 'completed')
            AND j2.schedule_locked = FALSE
          ORDER BY j2.priority_score ASC  -- Take from lowest priority first
          LIMIT 1;
          
          IF substitute_operator.employee_id IS NOT NULL THEN
            -- Reassign to substitute operator
            UPDATE schedule_slots
            SET 
              employee_id = substitute_operator.employee_id,
              notes = COALESCE(notes, '') || format(' | Operator substituted from job %s due to absence', 
                substitute_operator.current_job)
            WHERE id = affected_slot.slot_id;
            
            substituted_count := substituted_count + 1;
            
            -- Mark the lower priority job for rescheduling
            UPDATE job_routings jr3
            SET routing_status = 'reschedule'
            FROM schedule_slots ss3
            WHERE ss3.job_routing_id = jr3.id
            AND ss3.employee_id = substitute_operator.employee_id
            AND ss3.start_datetime = affected_slot.start_datetime;
            
            -- Delete the lower priority job's slot
            DELETE FROM schedule_slots
            WHERE employee_id = substitute_operator.employee_id
            AND start_datetime = affected_slot.start_datetime
            AND job_routing_id != affected_slot.job_routing_id;
            
            CONTINUE; -- Move to next job
          END IF;
          
          -- No substitute found - delete slot and mark for rescheduling
          DELETE FROM schedule_slots WHERE id = affected_slot.slot_id;
          
          -- Mark entire job for rescheduling (all operations) with shorter status
          UPDATE job_routings
          SET routing_status = 'reschedule'
          WHERE job_id = affected_slot.job_id
          AND sequence_order >= affected_slot.sequence_order;
          
        END LOOP;
        
        -- Update displacement log summary
        UPDATE displacement_logs
        SET 
          affected_jobs = job_count,
          execution_status = 'completed',
          execution_details = json_build_object(
            'total_jobs_affected', job_count,
            'jobs_pushed_to_return', pushed_count,
            'jobs_with_substitutes', substituted_count,
            'jobs_needing_reschedule', job_count - pushed_count - substituted_count
          ),
          completed_at = CURRENT_TIMESTAMP
        WHERE id = log_id;
        
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
    console.log('✅ Updated trigger function with shorter status values');
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

fixRoutingStatusWithView();