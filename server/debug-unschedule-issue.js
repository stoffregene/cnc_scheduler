const { Pool } = require('pg');
require('dotenv').config();

async function debugUnscheduleIssue() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL
  });

  try {
    console.log('🔍 Debugging Unschedule All Issue\n');
    
    // 1. Check current schedule slots
    console.log('1. Current schedule slots...');
    const slotsQuery = `SELECT COUNT(*) as count FROM schedule_slots`;
    const slots = await pool.query(slotsQuery);
    console.log(`Schedule slots: ${slots.rows[0].count}`);
    
    // 2. Check jobs status
    console.log('\n2. Jobs status breakdown...');
    const jobsStatusQuery = `
      SELECT 
        status,
        auto_scheduled,
        COUNT(*) as count
      FROM jobs 
      GROUP BY status, auto_scheduled
      ORDER BY status, auto_scheduled
    `;
    const jobsStatus = await pool.query(jobsStatusQuery);
    
    console.log('Jobs Status:');
    console.log('Status'.padEnd(15) + '| Auto-Scheduled | Count');
    console.log('-'.repeat(45));
    jobsStatus.rows.forEach(row => {
      console.log(`${row.status.padEnd(15)}| ${row.auto_scheduled.toString().padEnd(15)}| ${row.count}`);
    });
    
    // 3. Check what the auto-scheduler sees
    console.log('\n3. Jobs available for scheduling (auto-scheduler view)...');
    const availableJobsQuery = `
      SELECT 
        j.id,
        j.job_number,
        j.status,
        j.auto_scheduled,
        j.promised_date,
        j.due_date,
        COUNT(jr.id) as routing_count,
        COUNT(ss.id) as scheduled_slots
      FROM jobs j
      LEFT JOIN job_routings jr ON j.id = jr.job_id
      LEFT JOIN schedule_slots ss ON j.id = ss.job_id
      WHERE j.status = 'pending'
      GROUP BY j.id, j.job_number, j.status, j.auto_scheduled, j.promised_date, j.due_date
      ORDER BY j.job_number
      LIMIT 10
    `;
    
    const availableJobs = await pool.query(availableJobsQuery);
    
    if (availableJobs.rows.length === 0) {
      console.log('❌ No jobs with status "pending" found!');
      
      // Check what statuses exist
      console.log('\nChecking all job statuses...');
      const allStatusesQuery = `
        SELECT DISTINCT status, COUNT(*) as count 
        FROM jobs 
        GROUP BY status 
        ORDER BY count DESC
      `;
      const allStatuses = await pool.query(allStatusesQuery);
      allStatuses.rows.forEach(row => {
        console.log(`  ${row.status}: ${row.count} jobs`);
      });
    } else {
      console.log('Available jobs for scheduling:');
      console.log('ID'.padEnd(5) + '| Job Number'.padEnd(12) + '| Auto-Scheduled | Routings | Slots');
      console.log('-'.repeat(60));
      availableJobs.rows.forEach(job => {
        console.log(`${job.id.toString().padEnd(5)}| ${job.job_number.padEnd(12)}| ${job.auto_scheduled.toString().padEnd(15)}| ${job.routing_count.padEnd(8)} | ${job.scheduled_slots}`);
      });
    }
    
    // 4. Check what status jobs should have for scheduling
    console.log('\n4. Checking what the auto-scheduler expects...');
    
    // Look at the scheduling service query
    const schedulableJobsQuery = `
      SELECT 
        j.id,
        j.job_number,
        j.status,
        j.auto_scheduled,
        j.promised_date,
        j.due_date,
        (j.promised_date IS NOT NULL OR j.due_date IS NOT NULL) as has_due_date,
        COUNT(jr.id) as routing_count
      FROM jobs j
      LEFT JOIN job_routings jr ON j.id = jr.job_id
      WHERE j.status IN ('pending', 'active') 
      AND j.auto_scheduled = FALSE
      AND (j.promised_date IS NOT NULL OR j.due_date IS NOT NULL)
      GROUP BY j.id, j.job_number, j.status, j.auto_scheduled, j.promised_date, j.due_date
      HAVING COUNT(jr.id) > 0
      ORDER BY j.job_number
      LIMIT 10
    `;
    
    const schedulableJobs = await pool.query(schedulableJobsQuery);
    
    console.log(`Found ${schedulableJobs.rows.length} jobs that should be schedulable:`);
    if (schedulableJobs.rows.length > 0) {
      console.log('ID'.padEnd(5) + '| Job Number'.padEnd(12) + '| Status'.padEnd(10) + '| Has Due Date | Routings');
      console.log('-'.repeat(70));
      schedulableJobs.rows.forEach(job => {
        console.log(`${job.id.toString().padEnd(5)}| ${job.job_number.padEnd(12)}| ${job.status.padEnd(10)}| ${job.has_due_date.toString().padEnd(12)} | ${job.routing_count}`);
      });
    }
    
    // 5. Test dependency check for one job
    if (schedulableJobs.rows.length > 0) {
      const testJobId = schedulableJobs.rows[0].id;
      console.log(`\n5. Testing dependency check for job ${testJobId}...`);
      
      const dependencyQuery = `SELECT * FROM can_job_be_scheduled($1)`;
      const dependencyResult = await pool.query(dependencyQuery, [testJobId]);
      
      if (dependencyResult.rows.length > 0) {
        const dep = dependencyResult.rows[0];
        console.log(`  Can Schedule: ${dep.can_schedule}`);
        console.log(`  Blocking Jobs: ${dep.blocking_job_numbers || 'None'}`);
      }
    }
    
  } catch (error) {
    console.error('❌ Error debugging:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    await pool.end();
  }
}

debugUnscheduleIssue();