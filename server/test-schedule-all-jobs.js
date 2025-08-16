const { Pool } = require('pg');
const path = require('path');
const SchedulingService = require('./services/schedulingService');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function testScheduleAllJobs() {
  try {
    console.log('🚀 Testing scheduling of all imported jobs...\n');
    
    const client = await pool.connect();
    const schedulingService = new SchedulingService(pool);
    
    // Get job statistics
    const jobStats = await client.query(`
      SELECT 
        COUNT(*) as total_jobs,
        COUNT(CASE WHEN priority_score > 0 THEN 1 END) as jobs_with_priority,
        COUNT(CASE WHEN schedule_locked = true THEN 1 END) as locked_jobs,
        COUNT(DISTINCT customer_name) as unique_customers
      FROM jobs
      WHERE status != 'completed'
    `);
    
    console.log('📊 Job Statistics:');
    console.log(`   Total active jobs: ${jobStats.rows[0].total_jobs}`);
    console.log(`   Jobs with priority score: ${jobStats.rows[0].jobs_with_priority}`);
    console.log(`   Locked jobs: ${jobStats.rows[0].locked_jobs}`);
    console.log(`   Unique customers: ${jobStats.rows[0].unique_customers}`);
    
    // Get top priority jobs
    const topJobs = await client.query(`
      SELECT job_number, customer_name, priority_score, promised_date,
             has_outsourcing, is_expedite, schedule_locked
      FROM jobs
      WHERE status != 'completed'
      ORDER BY priority_score DESC, promised_date ASC
      LIMIT 10
    `);
    
    console.log('\n🏆 Top 10 Priority Jobs to Schedule:');
    topJobs.rows.forEach((job, index) => {
      const flags = [];
      if (job.has_outsourcing) flags.push('OUTSOURCED');
      if (job.is_expedite) flags.push('EXPEDITE');
      if (job.schedule_locked) flags.push('LOCKED');
      
      console.log(`   ${index + 1}. ${job.job_number} (${job.customer_name})`);
      console.log(`      Score: ${job.priority_score}, Due: ${job.promised_date}`);
      if (flags.length > 0) {
        console.log(`      Flags: ${flags.join(', ')}`);
      }
    });
    
    // Check current schedule status
    const scheduleStatus = await client.query(`
      SELECT 
        COUNT(DISTINCT job_id) as scheduled_jobs,
        COUNT(*) as total_slots,
        MIN(start_datetime) as earliest_start,
        MAX(end_datetime) as latest_end
      FROM schedule_slots
    `);
    
    console.log('\n📅 Current Schedule Status:');
    console.log(`   Scheduled jobs: ${scheduleStatus.rows[0].scheduled_jobs}`);
    console.log(`   Total time slots: ${scheduleStatus.rows[0].total_slots}`);
    if (scheduleStatus.rows[0].earliest_start) {
      console.log(`   Schedule range: ${scheduleStatus.rows[0].earliest_start} to ${scheduleStatus.rows[0].latest_end}`);
    }
    
    // Test scheduling a batch of high-priority jobs
    console.log('\n🔄 Attempting to schedule top priority jobs...');
    
    const unscheduledJobs = await client.query(`
      SELECT j.id, j.job_number, j.customer_name, j.priority_score
      FROM jobs j
      LEFT JOIN schedule_slots ss ON j.id = ss.job_id
      WHERE j.status != 'completed'
      AND ss.id IS NULL
      AND j.schedule_locked = false
      ORDER BY j.priority_score DESC, j.promised_date ASC
      LIMIT 20
    `);
    
    console.log(`\n📋 Found ${unscheduledJobs.rows.length} unscheduled jobs to process`);
    
    let successCount = 0;
    let failCount = 0;
    const errors = [];
    
    for (const job of unscheduledJobs.rows) {
      try {
        console.log(`\n   Scheduling ${job.job_number} (Score: ${job.priority_score})...`);
        
        const result = await schedulingService.scheduleJob(job.id);
        
        if (result.success) {
          successCount++;
          console.log(`     ✅ Scheduled successfully`);
          console.log(`        Operations: ${result.scheduledOperations.length}`);
          if (result.scheduledOperations.length > 0) {
            const firstOp = result.scheduledOperations[0];
            console.log(`        First operation: ${firstOp.machine_name} at ${firstOp.start_time}`);
          }
        } else {
          failCount++;
          console.log(`     ❌ Failed: ${result.message}`);
          errors.push({ job: job.job_number, error: result.message });
        }
      } catch (error) {
        failCount++;
        console.log(`     ❌ Error: ${error.message}`);
        errors.push({ job: job.job_number, error: error.message });
      }
    }
    
    console.log('\n📊 Scheduling Results:');
    console.log(`   Successfully scheduled: ${successCount} jobs`);
    console.log(`   Failed to schedule: ${failCount} jobs`);
    
    if (errors.length > 0) {
      console.log('\n⚠️ Scheduling Errors:');
      errors.slice(0, 5).forEach(err => {
        console.log(`   - ${err.job}: ${err.error}`);
      });
    }
    
    // Check machine utilization
    const machineUtil = await client.query(`
      SELECT 
        m.name as machine_name,
        mg.name as machine_group,
        COUNT(DISTINCT ss.job_id) as jobs_scheduled,
        COUNT(ss.id) as total_slots,
        SUM(ss.actual_duration) as total_hours
      FROM machines m
      LEFT JOIN machine_groups mg ON m.machine_group_id = mg.id
      LEFT JOIN schedule_slots ss ON m.id = ss.machine_id
      GROUP BY m.id, m.name, mg.name
      HAVING COUNT(ss.id) > 0
      ORDER BY COUNT(ss.id) DESC
      LIMIT 10
    `);
    
    if (machineUtil.rows.length > 0) {
      console.log('\n🏭 Machine Utilization:');
      machineUtil.rows.forEach(machine => {
        console.log(`   ${machine.machine_name} (${machine.machine_group || 'No group'})`);
        console.log(`      Jobs: ${machine.jobs_scheduled}, Slots: ${machine.total_slots}, Hours: ${machine.total_hours || 0}`);
      });
    }
    
    // Check for scheduling conflicts or issues
    const conflicts = await client.query(`
      SELECT COUNT(*) as conflict_count
      FROM scheduling_conflicts
      WHERE resolved = false
    `);
    
    if (conflicts.rows[0].conflict_count > 0) {
      console.log(`\n⚠️ Unresolved scheduling conflicts: ${conflicts.rows[0].conflict_count}`);
    }
    
    client.release();
    
    console.log('\n✅ Scheduling test completed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
  } finally {
    await pool.end();
  }
}

// Run the test
testScheduleAllJobs();