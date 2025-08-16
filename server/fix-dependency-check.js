const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function fixDependencyCheck() {
  try {
    console.log('=== UPDATING DEPENDENCY CHECK FUNCTION ===\n');
    
    // Drop and recreate the function with better logic
    await pool.query(`
      DROP FUNCTION IF EXISTS can_job_be_scheduled(integer);
    `);
    
    await pool.query(`
      CREATE OR REPLACE FUNCTION can_job_be_scheduled(job_id integer)
      RETURNS TABLE(
        can_schedule boolean,
        blocking_jobs integer[],
        blocking_job_numbers text[]
      ) AS $$
      DECLARE
        blocking_job_ids integer[];
        blocking_numbers text[];
        earliest_child_end timestamp;
      BEGIN
        -- Check if there are any prerequisite jobs that block this job
        SELECT 
          array_agg(DISTINCT p.id),
          array_agg(DISTINCT p.job_number)
        INTO blocking_job_ids, blocking_numbers
        FROM job_dependencies jd
        INNER JOIN jobs p ON jd.prerequisite_job_id = p.id
        WHERE jd.dependent_job_id = job_id
          AND p.status NOT IN ('completed', 'cancelled');
        
        -- If there are blocking jobs, check if they're scheduled
        IF blocking_job_ids IS NOT NULL AND array_length(blocking_job_ids, 1) > 0 THEN
          -- Get the latest end time of all child job operations
          SELECT MAX(ss.end_datetime)
          INTO earliest_child_end
          FROM jobs j
          INNER JOIN job_routings jr ON j.id = jr.job_id
          INNER JOIN schedule_slots ss ON jr.id = ss.job_routing_id
          WHERE j.id = ANY(blocking_job_ids);
          
          -- If children are scheduled, we can schedule after them
          IF earliest_child_end IS NOT NULL THEN
            -- Return true but with info about when we can start
            RETURN QUERY 
            SELECT 
              true as can_schedule,
              blocking_job_ids as blocking_jobs,
              blocking_numbers as blocking_job_numbers;
          ELSE
            -- Children not scheduled yet, cannot schedule parent
            RETURN QUERY 
            SELECT 
              false as can_schedule,
              blocking_job_ids as blocking_jobs,
              blocking_numbers as blocking_job_numbers;
          END IF;
        ELSE
          -- No blocking jobs, can schedule
          RETURN QUERY 
          SELECT 
            true as can_schedule,
            NULL::integer[] as blocking_jobs,
            NULL::text[] as blocking_job_numbers;
        END IF;
      END;
      $$ LANGUAGE plpgsql;
    `);
    
    console.log('✅ Updated can_job_be_scheduled function');
    
    // Drop existing function if it exists
    await pool.query(`DROP FUNCTION IF EXISTS get_earliest_start_for_dependent_job(integer);`);
    
    // Create a new function to get earliest start time considering dependencies
    await pool.query(`
      CREATE OR REPLACE FUNCTION get_earliest_start_for_dependent_job(p_job_id integer)
      RETURNS timestamp AS $$
      DECLARE
        earliest_start timestamp;
      BEGIN
        -- Get the latest end time of all prerequisite jobs
        SELECT MAX(ss.end_datetime)
        INTO earliest_start
        FROM job_dependencies jd
        INNER JOIN jobs p ON jd.prerequisite_job_id = p.id
        INNER JOIN job_routings jr ON p.id = jr.job_id
        INNER JOIN schedule_slots ss ON jr.id = ss.job_routing_id
        WHERE jd.dependent_job_id = p_job_id;
        
        -- Return the earliest start time (or NULL if no dependencies scheduled)
        RETURN earliest_start;
      END;
      $$ LANGUAGE plpgsql;
    `);
    
    console.log('✅ Created get_earliest_start_for_dependent_job function');
    
    // Test the new function with job 12345
    const testResult = await pool.query('SELECT * FROM can_job_be_scheduled(55)'); // Job 12345
    console.log('\n=== TEST RESULT ===');
    console.log('Can schedule job 12345?', testResult.rows[0]);
    
    if (testResult.rows[0].blocking_jobs) {
      const earliestStart = await pool.query('SELECT get_earliest_start_for_dependent_job(55) as earliest_start');
      console.log('Earliest start time for 12345:', earliestStart.rows[0].earliest_start);
    }
    
    console.log('\n✅ Dependency check function updated successfully!');
    console.log('\nThe scheduler will now:');
    console.log('1. Allow scheduling parent jobs after child jobs are scheduled');
    console.log('2. Automatically start parent jobs after child jobs complete');
    console.log('3. Prevent scheduling parent jobs if children are not scheduled');
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

fixDependencyCheck();