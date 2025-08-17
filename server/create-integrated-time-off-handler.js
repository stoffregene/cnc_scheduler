const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:sassysalad@localhost:5432/cnc_scheduler'
});

async function createIntegratedTimeOffHandler() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    console.log('Creating integrated time off handler with DisplacementService...\n');
    
    // 1. Drop old triggers
    await client.query(`
      DROP TRIGGER IF EXISTS trigger_time_off_displacement ON employee_time_off;
      DROP TRIGGER IF EXISTS trigger_time_off_displacement_smart ON employee_time_off;
    `);
    console.log('✅ Removed old displacement triggers');
    
    // 2. Create integrated time off handler that works with DisplacementService
    await client.query(`
      CREATE OR REPLACE FUNCTION handle_time_off_integrated()
      RETURNS TRIGGER AS $$
      DECLARE
        affected_slot RECORD;
        job_count INTEGER := 0;
        high_priority_count INTEGER := 0;
        critical_jobs TEXT := '';
        firm_zone_violations INTEGER := 0;
        locked_job_conflicts INTEGER := 0;
      BEGIN
        -- Log the time off entry
        INSERT INTO displacement_logs (
          trigger_type,
          trigger_details,
          execution_status,
          created_at
        ) VALUES (
          'time_off',
          json_build_object(
            'employee_id', NEW.employee_id,
            'start_date', NEW.start_date,
            'end_date', NEW.end_date,
            'reason', NEW.reason
          ),
          'processing',
          CURRENT_TIMESTAMP
        ) RETURNING id INTO NEW.id;
        
        -- Find and process all affected schedule slots
        FOR affected_slot IN 
          SELECT 
            ss.id as slot_id,
            ss.job_routing_id,
            ss.start_datetime,
            ss.end_datetime,
            jr.job_id,
            jr.operation_name,
            jr.sequence_order,
            j.job_number,
            j.priority_score,
            j.promised_date,
            j.schedule_locked,
            e.first_name || ' ' || e.last_name as employee_name,
            -- Check if in firm zone (14 days)
            (j.promised_date - CURRENT_DATE) <= 14 as in_firm_zone,
            -- Check if job is locked
            (j.schedule_locked = true OR ss.locked = true) as is_locked
          FROM schedule_slots ss
          JOIN job_routings jr ON ss.job_routing_id = jr.id
          JOIN jobs j ON jr.job_id = j.id
          JOIN employees e ON ss.employee_id = e.id
          WHERE ss.employee_id = NEW.employee_id
          AND ss.start_datetime::date BETWEEN NEW.start_date AND NEW.end_date
          AND ss.status NOT IN ('completed', 'in_progress')
          ORDER BY j.priority_score DESC
        LOOP
          job_count := job_count + 1;
          
          -- Track high priority jobs (>700)
          IF affected_slot.priority_score > 700 THEN
            high_priority_count := high_priority_count + 1;
            critical_jobs := critical_jobs || affected_slot.job_number || ' (Priority: ' || 
                           affected_slot.priority_score || '), ';
            
            -- Generate alert for high priority jobs
            INSERT INTO system_alerts (
              alert_type,
              severity,
              message,
              details,
              created_at
            ) VALUES (
              'high_priority_displacement',
              'high',
              'High priority job affected by time off',
              json_build_object(
                'job_number', affected_slot.job_number,
                'priority_score', affected_slot.priority_score,
                'employee', affected_slot.employee_name,
                'scheduled_date', affected_slot.start_datetime,
                'time_off_reason', NEW.reason
              ),
              CURRENT_TIMESTAMP
            );
          END IF;
          
          -- Track firm zone violations
          IF affected_slot.in_firm_zone THEN
            firm_zone_violations := firm_zone_violations + 1;
            
            -- Special alert for firm zone violations
            INSERT INTO system_alerts (
              alert_type,
              severity,
              message,
              details,
              created_at
            ) VALUES (
              'firm_zone_time_off_conflict',
              'critical',
              'Time off affects job in firm zone (within 14 days of promise date)',
              json_build_object(
                'job_number', affected_slot.job_number,
                'promise_date', affected_slot.promised_date,
                'days_until_promise', (affected_slot.promised_date - CURRENT_DATE),
                'employee', affected_slot.employee_name,
                'priority_score', affected_slot.priority_score
              ),
              CURRENT_TIMESTAMP
            );
          END IF;
          
          -- Track locked job conflicts
          IF affected_slot.is_locked THEN
            locked_job_conflicts := locked_job_conflicts + 1;
            
            -- Critical alert for locked jobs
            INSERT INTO system_alerts (
              alert_type,
              severity,
              message,
              details,
              created_at
            ) VALUES (
              'locked_job_operator_unavailable',
              'critical',
              'Locked/started job has no operator due to time off',
              json_build_object(
                'job_number', affected_slot.job_number,
                'operation', affected_slot.operation_name,
                'scheduled_start', affected_slot.start_datetime,
                'employee', affected_slot.employee_name,
                'action_required', 'Manual intervention needed - find substitute operator or delay job'
              ),
              CURRENT_TIMESTAMP
            );
            
            -- Don't delete locked slots, just flag them
            UPDATE schedule_slots
            SET status = 'operator_unavailable',
                notes = COALESCE(notes, '') || ' | Operator unavailable: ' || NEW.reason
            WHERE id = affected_slot.slot_id;
            
            CONTINUE; -- Skip deletion for locked jobs
          END IF;
          
          -- Delete the schedule slot (will trigger rescheduling)
          DELETE FROM schedule_slots WHERE id = affected_slot.slot_id;
          
          -- Mark routing as needing rescheduling
          UPDATE job_routings 
          SET routing_status = 'needs_rescheduling'
          WHERE id = affected_slot.job_routing_id;
          
          -- Log the displacement detail
          INSERT INTO displacement_details (
            log_id,
            job_id,
            job_number,
            original_start,
            priority_score,
            displacement_reason,
            created_at
          ) VALUES (
            NEW.id,
            affected_slot.job_id,
            affected_slot.job_number,
            affected_slot.start_datetime,
            affected_slot.priority_score,
            'Employee time off: ' || NEW.reason,
            CURRENT_TIMESTAMP
          );
          
          -- Handle cascading operations
          UPDATE job_routings jr2
          SET routing_status = 'needs_rescheduling'
          FROM schedule_slots ss2
          WHERE jr2.id = ss2.job_routing_id
          AND jr2.job_id = affected_slot.job_id
          AND jr2.sequence_order > affected_slot.sequence_order;
          
          DELETE FROM schedule_slots
          WHERE job_routing_id IN (
            SELECT id FROM job_routings
            WHERE job_id = affected_slot.job_id
            AND sequence_order > affected_slot.sequence_order
          );
        END LOOP;
        
        -- Update the displacement log with summary
        UPDATE displacement_logs
        SET 
          affected_jobs = job_count,
          execution_status = 'completed',
          execution_details = json_build_object(
            'total_jobs_affected', job_count,
            'high_priority_jobs', high_priority_count,
            'firm_zone_violations', firm_zone_violations,
            'locked_job_conflicts', locked_job_conflicts,
            'critical_jobs', NULLIF(critical_jobs, ''),
            'action', 'Jobs marked for rescheduling via DisplacementService'
          ),
          completed_at = CURRENT_TIMESTAMP
        WHERE id = NEW.id;
        
        -- Notify the system to trigger DisplacementService
        PERFORM pg_notify('displacement_required', json_build_object(
          'trigger', 'time_off',
          'employee_id', NEW.employee_id,
          'jobs_affected', job_count,
          'high_priority_affected', high_priority_count,
          'start_date', NEW.start_date,
          'end_date', NEW.end_date
        )::text);
        
        -- If there are high priority jobs affected, also send urgent notification
        IF high_priority_count > 0 THEN
          PERFORM pg_notify('urgent_rescheduling', json_build_object(
            'reason', 'time_off_high_priority',
            'employee_id', NEW.employee_id,
            'critical_jobs', critical_jobs,
            'message', 'High priority jobs need immediate rescheduling due to operator absence'
          )::text);
        END IF;
        
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
    console.log('✅ Created integrated time off handler');
    
    // 3. Create system_alerts table if it doesn't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS system_alerts (
        id SERIAL PRIMARY KEY,
        alert_type VARCHAR(100),
        severity VARCHAR(20) CHECK (severity IN ('low', 'medium', 'high', 'critical')),
        message TEXT,
        details JSONB,
        acknowledged BOOLEAN DEFAULT FALSE,
        acknowledged_by INTEGER REFERENCES users(id),
        acknowledged_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE INDEX IF NOT EXISTS idx_alerts_severity ON system_alerts(severity);
      CREATE INDEX IF NOT EXISTS idx_alerts_acknowledged ON system_alerts(acknowledged);
    `);
    console.log('✅ Created system alerts table');
    
    // 4. Create trigger
    await client.query(`
      CREATE TRIGGER trigger_time_off_integrated
      AFTER INSERT OR UPDATE ON employee_time_off
      FOR EACH ROW
      EXECUTE FUNCTION handle_time_off_integrated();
    `);
    console.log('✅ Created integrated trigger');
    
    // 5. Create function to trigger rescheduling through DisplacementService
    await client.query(`
      CREATE OR REPLACE FUNCTION process_time_off_rescheduling()
      RETURNS INTEGER AS $$
      DECLARE
        jobs_to_reschedule RECORD;
        rescheduled_count INTEGER := 0;
      BEGIN
        -- Get all jobs needing rescheduling due to time off
        FOR jobs_to_reschedule IN
          SELECT DISTINCT
            j.id,
            j.job_number,
            j.priority_score,
            j.promised_date
          FROM jobs j
          JOIN job_routings jr ON j.id = jr.job_id
          WHERE jr.routing_status = 'needs_rescheduling'
          ORDER BY j.priority_score DESC
        LOOP
          -- This would trigger the DisplacementService via API
          -- In practice, this would be called from Node.js
          rescheduled_count := rescheduled_count + 1;
          
          RAISE NOTICE 'Job % (priority %) needs rescheduling through DisplacementService', 
            jobs_to_reschedule.job_number, 
            jobs_to_reschedule.priority_score;
        END LOOP;
        
        RETURN rescheduled_count;
      END;
      $$ LANGUAGE plpgsql;
    `);
    console.log('✅ Created rescheduling processor function');
    
    // 6. Create view for monitoring time off impacts
    await client.query(`
      CREATE OR REPLACE VIEW time_off_impact_view AS
      SELECT 
        eto.id as time_off_id,
        e.first_name || ' ' || e.last_name as employee_name,
        eto.start_date,
        eto.end_date,
        eto.reason,
        COUNT(DISTINCT j.id) as jobs_affected,
        COUNT(DISTINCT CASE WHEN j.priority_score > 700 THEN j.id END) as high_priority_jobs,
        COUNT(DISTINCT CASE WHEN j.promised_date - CURRENT_DATE <= 14 THEN j.id END) as firm_zone_jobs,
        STRING_AGG(DISTINCT CASE WHEN j.priority_score > 700 THEN j.job_number END, ', ') as critical_job_numbers
      FROM employee_time_off eto
      JOIN employees e ON eto.employee_id = e.id
      LEFT JOIN schedule_slots ss ON ss.employee_id = eto.employee_id
        AND ss.start_datetime::date BETWEEN eto.start_date AND eto.end_date
      LEFT JOIN job_routings jr ON ss.job_routing_id = jr.id
      LEFT JOIN jobs j ON jr.job_id = j.id
      WHERE eto.end_date >= CURRENT_DATE
      GROUP BY eto.id, e.first_name, e.last_name, eto.start_date, eto.end_date, eto.reason
      ORDER BY eto.start_date;
    `);
    console.log('✅ Created time off impact view');
    
    await client.query('COMMIT');
    
    console.log('\n✨ Integrated time off handler created successfully!');
    console.log('\nKey Features:');
    console.log('  ✅ Uses existing 15% priority rule through DisplacementService');
    console.log('  ✅ Deletes affected slots and marks for rescheduling');
    console.log('  ✅ Triggers DisplacementService via notifications');
    console.log('  ✅ Generates alerts for high-priority jobs (>700)');
    console.log('  ✅ Special handling for firm zone violations');
    console.log('  ✅ Preserves locked jobs but flags for manual intervention');
    console.log('  ✅ Comprehensive logging in displacement_logs table');
    console.log('  ✅ Cascading deletion of dependent operations');
    
    console.log('\nAlert Levels:');
    console.log('  - Priority >700: High severity alert');
    console.log('  - Firm zone (14 days): Critical alert');
    console.log('  - Locked jobs: Critical alert + manual intervention required');
    
    console.log('\nNext Steps:');
    console.log('  1. Node.js service should listen for pg_notify events');
    console.log('  2. On "displacement_required" notification, call DisplacementService');
    console.log('  3. Monitor system_alerts table for critical issues');
    console.log('  4. Check time_off_impact_view for impact analysis');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating integrated handler:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

createIntegratedTimeOffHandler();