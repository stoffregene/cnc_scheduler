const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:sassysalad@localhost:5432/cnc_scheduler'
});

async function createSmartTimeOffHandler() {
  try {
    console.log('Creating intelligent time off displacement system...\n');
    
    // 1. Drop the old simple trigger
    await pool.query(`
      DROP TRIGGER IF EXISTS trigger_time_off_displacement ON employee_time_off;
    `);
    console.log('✅ Removed old simple displacement trigger');
    
    // 2. Create a smarter displacement function that considers priorities
    await pool.query(`
      CREATE OR REPLACE FUNCTION handle_time_off_displacement_smart()
      RETURNS TRIGGER AS $$
      DECLARE
        affected_slot RECORD;
        job_priority NUMERIC;
        can_displace BOOLEAN;
        new_start_date TIMESTAMP;
        cascade_job RECORD;
      BEGIN
        -- Find all schedule slots affected by the new time off
        FOR affected_slot IN 
          SELECT 
            ss.*,
            jr.job_id,
            jr.operation_name,
            jr.sequence_order,
            j.job_number,
            j.priority_score,
            j.promised_date,
            j.schedule_locked
          FROM schedule_slots ss
          JOIN job_routings jr ON ss.job_routing_id = jr.id
          JOIN jobs j ON jr.job_id = j.id
          WHERE ss.employee_id = NEW.employee_id
          AND ss.start_datetime::date BETWEEN NEW.start_date AND NEW.end_date
          AND ss.status != 'completed'
          ORDER BY j.priority_score DESC, ss.start_datetime ASC
        LOOP
          -- Check if job is locked (high priority or started)
          IF affected_slot.schedule_locked THEN
            RAISE NOTICE 'Job % is locked and cannot be displaced by time off. Manual intervention required.', 
              affected_slot.job_number;
            CONTINUE;
          END IF;
          
          -- Determine if job can be pushed based on priority and promise date
          can_displace := TRUE;
          
          -- High priority jobs (>700) should trigger a warning
          IF affected_slot.priority_score > 700 THEN
            RAISE WARNING 'High priority job % (score: %) affected by time off for employee %', 
              affected_slot.job_number, affected_slot.priority_score, NEW.employee_id;
          END IF;
          
          -- Calculate new start date (push to after time off ends)
          new_start_date := (NEW.end_date + INTERVAL '1 day')::timestamp;
          
          -- Check if pushing would violate promise date
          IF new_start_date::date > affected_slot.promised_date THEN
            RAISE WARNING 'Displacing job % would push it past promise date %', 
              affected_slot.job_number, affected_slot.promised_date;
          END IF;
          
          -- Delete the affected slot (it will need to be rescheduled)
          DELETE FROM schedule_slots WHERE id = affected_slot.id;
          
          -- Mark the job routing as needing rescheduling
          UPDATE job_routings 
          SET routing_status = 'needs_rescheduling'
          WHERE id = affected_slot.job_routing_id;
          
          -- Find and mark all subsequent operations in the job for rescheduling
          FOR cascade_job IN
            SELECT jr.id, jr.operation_name, jr.sequence_order
            FROM job_routings jr
            WHERE jr.job_id = affected_slot.job_id
            AND jr.sequence_order > affected_slot.sequence_order
          LOOP
            DELETE FROM schedule_slots WHERE job_routing_id = cascade_job.id;
            UPDATE job_routings 
            SET routing_status = 'needs_rescheduling'
            WHERE id = cascade_job.id;
            
            RAISE NOTICE 'Cascaded deletion for operation % (sequence %) of job %', 
              cascade_job.operation_name, cascade_job.sequence_order, affected_slot.job_number;
          END LOOP;
          
          -- Log the displacement
          INSERT INTO displacement_log (
            job_id, 
            job_number,
            original_start,
            reason,
            displaced_by,
            priority_score,
            created_at
          ) VALUES (
            affected_slot.job_id,
            affected_slot.job_number,
            affected_slot.start_datetime,
            'Employee time off: ' || NEW.reason,
            'Employee #' || NEW.employee_id,
            affected_slot.priority_score,
            CURRENT_TIMESTAMP
          );
          
        END LOOP;
        
        -- Trigger a notification that rescheduling is needed
        PERFORM pg_notify('schedule_update', json_build_object(
          'action', 'time_off_added',
          'employee_id', NEW.employee_id,
          'start_date', NEW.start_date,
          'end_date', NEW.end_date,
          'requires_rescheduling', true
        )::text);
        
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
    console.log('✅ Created smart displacement function with priority evaluation');
    
    // 3. Create displacement log table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS displacement_log (
        id SERIAL PRIMARY KEY,
        job_id INTEGER REFERENCES jobs(id),
        job_number VARCHAR(255),
        original_start TIMESTAMP,
        new_start TIMESTAMP,
        reason TEXT,
        displaced_by VARCHAR(255),
        priority_score NUMERIC,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Created displacement log table');
    
    // 4. Create the new trigger
    await pool.query(`
      CREATE TRIGGER trigger_time_off_displacement_smart
      AFTER INSERT OR UPDATE ON employee_time_off
      FOR EACH ROW
      EXECUTE FUNCTION handle_time_off_displacement_smart();
    `);
    console.log('✅ Created smart displacement trigger');
    
    // 5. Create a function to find the best rescheduling slots
    await pool.query(`
      CREATE OR REPLACE FUNCTION reschedule_displaced_jobs(
        emp_id INTEGER,
        after_date DATE
      )
      RETURNS TABLE(
        job_id INTEGER,
        job_number VARCHAR,
        routing_id INTEGER,
        operation_name VARCHAR,
        suggested_start TIMESTAMP,
        suggested_end TIMESTAMP,
        priority_score NUMERIC
      ) AS $$
      BEGIN
        RETURN QUERY
        SELECT 
          j.id as job_id,
          j.job_number,
          jr.id as routing_id,
          jr.operation_name,
          -- Find next available slot after time off
          (after_date + INTERVAL '1 day' + 
           (CASE 
            WHEN jr.sequence_order = 1 THEN INTERVAL '0 hours'
            WHEN jr.sequence_order = 2 THEN INTERVAL '24 hours' 
            ELSE INTERVAL '48 hours'
           END))::timestamp as suggested_start,
          (after_date + INTERVAL '1 day' + 
           (CASE 
            WHEN jr.sequence_order = 1 THEN INTERVAL '8 hours'
            WHEN jr.sequence_order = 2 THEN INTERVAL '32 hours'
            ELSE INTERVAL '56 hours'
           END))::timestamp as suggested_end,
          j.priority_score
        FROM job_routings jr
        JOIN jobs j ON jr.job_id = j.id
        WHERE jr.routing_status = 'needs_rescheduling'
        ORDER BY j.priority_score DESC, jr.sequence_order ASC;
      END;
      $$ LANGUAGE plpgsql;
    `);
    console.log('✅ Created function to suggest rescheduling slots');
    
    // 6. Create a view to show jobs needing rescheduling
    await pool.query(`
      CREATE OR REPLACE VIEW jobs_needing_reschedule AS
      SELECT 
        j.id,
        j.job_number,
        j.customer_name,
        j.priority_score,
        j.promised_date,
        COUNT(jr.id) as operations_to_schedule,
        STRING_AGG(jr.operation_name, ', ' ORDER BY jr.sequence_order) as operations
      FROM jobs j
      JOIN job_routings jr ON j.id = jr.job_id
      WHERE jr.routing_status = 'needs_rescheduling'
      GROUP BY j.id, j.job_number, j.customer_name, j.priority_score, j.promised_date
      ORDER BY j.priority_score DESC;
    `);
    console.log('✅ Created view for jobs needing rescheduling');
    
    console.log('\n✨ Smart time off displacement system created!');
    console.log('\nKey Features:');
    console.log('  1. Evaluates job priorities before displacing');
    console.log('  2. Handles cascading effects on subsequent operations');
    console.log('  3. Warns about high-priority jobs and promise date violations');
    console.log('  4. Logs all displacements for tracking');
    console.log('  5. Marks jobs for rescheduling rather than arbitrary reassignment');
    console.log('  6. Respects job locks for critical/started work');
    console.log('\nNext Steps:');
    console.log('  - Run auto-scheduler to reschedule displaced jobs');
    console.log('  - Check jobs_needing_reschedule view for pending work');
    console.log('  - Review displacement_log for impact analysis');
    
  } catch (error) {
    console.error('Error creating smart time off system:', error);
  } finally {
    await pool.end();
  }
}

createSmartTimeOffHandler();