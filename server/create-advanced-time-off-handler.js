const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:sassysalad@localhost:5432/cnc_scheduler'
});

async function createAdvancedTimeOffHandler() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    console.log('Creating advanced time off handler with force displacement and operator substitution...\n');
    
    // 1. Drop old triggers
    await client.query(`
      DROP TRIGGER IF EXISTS trigger_time_off_displacement ON employee_time_off;
      DROP TRIGGER IF EXISTS trigger_time_off_displacement_smart ON employee_time_off;
      DROP TRIGGER IF EXISTS trigger_time_off_integrated ON employee_time_off;
    `);
    console.log('✅ Removed old triggers');
    
    // 2. Create advanced handler with force displacement and substitution logic
    await client.query(`
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
          
          -- RULE 1: Force displacement despite firm zone
          -- For operator absence, we must displace even if in firm zone
          
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
            
            -- Create critical alert for in-progress job push
            INSERT INTO system_alerts (
              alert_type, severity, message, details, created_at
            ) VALUES (
              'in_progress_job_pushed',
              'critical',
              'In-progress job pushed due to operator absence',
              json_build_object(
                'job_number', affected_slot.job_number,
                'original_date', affected_slot.start_datetime,
                'new_date', operator_return_date,
                'operator', affected_slot.employee_name,
                'machine', affected_slot.machine_name
              ),
              CURRENT_TIMESTAMP
            );
            
            -- Mark downstream operations for rescheduling
            UPDATE job_routings
            SET routing_status = 'needs_rescheduling'
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
            RAISE NOTICE 'Found substitute operator % from job % (priority %) for job % (priority %)',
              substitute_operator.operator_name,
              substitute_operator.current_job,
              substitute_operator.current_priority,
              affected_slot.job_number,
              affected_slot.priority_score;
            
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
            SET routing_status = 'needs_rescheduling'
            FROM schedule_slots ss3
            WHERE ss3.job_routing_id = jr3.id
            AND ss3.employee_id = substitute_operator.employee_id
            AND ss3.start_datetime = affected_slot.start_datetime;
            
            -- Delete the lower priority job's slot
            DELETE FROM schedule_slots
            WHERE employee_id = substitute_operator.employee_id
            AND start_datetime = affected_slot.start_datetime
            AND job_routing_id != affected_slot.job_routing_id;
            
            -- Log the substitution
            INSERT INTO displacement_details (
              log_id, job_id, job_number,
              original_start, priority_score,
              displacement_reason, created_at
            ) VALUES (
              log_id,
              affected_slot.job_id,
              affected_slot.job_number,
              affected_slot.start_datetime,
              affected_slot.priority_score,
              format('Operator substituted from %s to %s', 
                affected_slot.employee_name, substitute_operator.operator_name),
              CURRENT_TIMESTAMP
            );
            
            -- Create alert for operator substitution
            INSERT INTO system_alerts (
              alert_type, severity, message, details, created_at
            ) VALUES (
              'operator_substitution',
              'medium',
              'Operator substituted due to absence',
              json_build_object(
                'high_priority_job', affected_slot.job_number,
                'high_priority_score', affected_slot.priority_score,
                'displaced_job', substitute_operator.current_job,
                'displaced_priority', substitute_operator.current_priority,
                'substitute_operator', substitute_operator.operator_name
              ),
              CURRENT_TIMESTAMP
            );
            
            CONTINUE; -- Move to next job
          END IF;
          
          -- No substitute found - delete slot and mark for rescheduling
          RAISE NOTICE 'No substitute found for job % - marking for rescheduling', 
            affected_slot.job_number;
          
          DELETE FROM schedule_slots WHERE id = affected_slot.slot_id;
          
          -- Mark entire job for rescheduling (all operations)
          UPDATE job_routings
          SET routing_status = 'needs_rescheduling'
          WHERE job_id = affected_slot.job_id
          AND sequence_order >= affected_slot.sequence_order;
          
          -- Delete downstream slots
          DELETE FROM schedule_slots
          WHERE job_routing_id IN (
            SELECT id FROM job_routings
            WHERE job_id = affected_slot.job_id
            AND sequence_order > affected_slot.sequence_order
          );
          
          -- Create alert for high priority jobs without substitutes
          IF affected_slot.priority_score > 700 THEN
            INSERT INTO system_alerts (
              alert_type, severity, message, details, created_at
            ) VALUES (
              'high_priority_no_substitute',
              'high',
              'High priority job affected with no substitute available',
              json_build_object(
                'job_number', affected_slot.job_number,
                'priority_score', affected_slot.priority_score,
                'promised_date', affected_slot.promised_date,
                'original_operator', affected_slot.employee_name,
                'action_required', 'Needs immediate rescheduling through DisplacementService'
              ),
              CURRENT_TIMESTAMP
            );
          END IF;
          
          -- Log the displacement
          INSERT INTO displacement_details (
            log_id, job_id, job_number,
            original_start, priority_score,
            displacement_reason, created_at
          ) VALUES (
            log_id,
            affected_slot.job_id,
            affected_slot.job_number,
            affected_slot.start_datetime,
            affected_slot.priority_score,
            'No substitute available - marked for rescheduling',
            CURRENT_TIMESTAMP
          );
          
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
            'jobs_needing_reschedule', job_count - pushed_count - substituted_count,
            'operator_return_date', operator_return_date,
            'rules_applied', ARRAY[
              'Force displacement despite firm zone',
              'Push in-progress jobs to return date',
              'Substitute from lower priority jobs'
            ]
          ),
          completed_at = CURRENT_TIMESTAMP
        WHERE id = log_id;
        
        -- Notify system to trigger DisplacementService for remaining jobs
        PERFORM pg_notify('displacement_required', json_build_object(
          'trigger', 'time_off_advanced',
          'employee_id', NEW.employee_id,
          'jobs_affected', job_count,
          'jobs_needing_reschedule', job_count - pushed_count - substituted_count,
          'return_date', operator_return_date
        )::text);
        
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
    console.log('✅ Created advanced time off handler with:');
    console.log('   - Force displacement (ignores firm zone)');
    console.log('   - In-progress job pushing to return date');
    console.log('   - Operator substitution from lower priority jobs');
    
    // 3. Create the trigger
    await client.query(`
      CREATE TRIGGER trigger_time_off_advanced
      AFTER INSERT OR UPDATE ON employee_time_off
      FOR EACH ROW
      EXECUTE FUNCTION handle_time_off_advanced();
    `);
    console.log('✅ Created advanced trigger');
    
    // 4. Create view to show substitution opportunities
    await client.query(`
      CREATE OR REPLACE VIEW operator_substitution_opportunities AS
      SELECT 
        ss1.id as high_priority_slot,
        j1.job_number as high_priority_job,
        j1.priority_score as high_priority_score,
        e1.first_name || ' ' || e1.last_name as current_operator,
        ss2.id as low_priority_slot,
        j2.job_number as low_priority_job,
        j2.priority_score as low_priority_score,
        e2.first_name || ' ' || e2.last_name as potential_substitute,
        m.name as machine_name,
        ss1.start_datetime,
        (j1.priority_score - j2.priority_score) as priority_difference,
        ROUND(((j1.priority_score - j2.priority_score)::numeric / j1.priority_score) * 100, 2) as priority_diff_percent
      FROM schedule_slots ss1
      JOIN job_routings jr1 ON ss1.job_routing_id = jr1.id
      JOIN jobs j1 ON jr1.job_id = j1.id
      JOIN employees e1 ON ss1.employee_id = e1.id
      JOIN machines m ON ss1.machine_id = m.id
      JOIN schedule_slots ss2 ON 
        ss2.machine_id = ss1.machine_id
        AND ss2.start_datetime = ss1.start_datetime
        AND ss2.id != ss1.id
      JOIN job_routings jr2 ON ss2.job_routing_id = jr2.id
      JOIN jobs j2 ON jr2.job_id = j2.id
      JOIN employees e2 ON ss2.employee_id = e2.id
      WHERE j1.priority_score > j2.priority_score * 1.15  -- 15% rule
      AND ss1.status NOT IN ('completed', 'in_progress')
      AND ss2.status NOT IN ('completed', 'in_progress')
      ORDER BY priority_difference DESC;
    `);
    console.log('✅ Created substitution opportunities view');
    
    await client.query('COMMIT');
    
    console.log('\n✨ Advanced time off handler created successfully!');
    console.log('\nBusiness Rules Implemented:');
    console.log('  1. ⚡ Force Displacement: Ignores firm zone for operator absence');
    console.log('  2. 📅 In-Progress Jobs: Pushed to operator return date');
    console.log('  3. 🔄 Operator Substitution: Takes operators from lower priority jobs (15% rule)');
    console.log('  4. 🎯 Priority Order: Handles highest priority jobs first');
    console.log('  5. 📊 Cascade Effects: Marks downstream operations for rescheduling');
    
    console.log('\nSubstitution Logic:');
    console.log('  - Finds operators working on jobs with 15% lower priority');
    console.log('  - Takes from lowest priority job first');
    console.log('  - Displaced lower priority job gets rescheduled');
    console.log('  - All substitutions are logged and alerted');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating advanced handler:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

createAdvancedTimeOffHandler();