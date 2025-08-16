const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5732/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function checkAutoScheduleResults() {
  try {
    console.log('🎯 Auto-Schedule Results Analysis...\n');
    
    // 1. Overall job status
    console.log('📊 Job Status Summary:');
    const jobStatusResult = await pool.query(`
      SELECT 
        status,
        COUNT(*) as count,
        COUNT(*) FILTER (WHERE auto_scheduled = true) as auto_scheduled_count
      FROM jobs
      GROUP BY status
      ORDER BY count DESC
    `);
    
    jobStatusResult.rows.forEach(row => {
      console.log(`   ${row.status}: ${row.count} jobs (${row.auto_scheduled_count} auto-scheduled)`);
    });
    
    // 2. Schedule slots summary
    console.log('\n⏰ Schedule Slots Summary:');
    const slotsResult = await pool.query(`
      SELECT 
        COUNT(*) as total_slots,
        COUNT(DISTINCT job_id) as unique_jobs_scheduled,
        MIN(start_datetime) as earliest_start,
        MAX(end_datetime) as latest_end
      FROM schedule_slots
    `);
    
    const slots = slotsResult.rows[0];
    console.log(`   Total slots created: ${slots.total_slots}`);
    console.log(`   Unique jobs scheduled: ${slots.unique_jobs_scheduled}`);
    console.log(`   Schedule span: ${slots.earliest_start} to ${slots.latest_end}`);
    
    // 3. Inspection queue
    console.log('\n🔍 Inspection Queue:');
    const inspectionResult = await pool.query(`
      SELECT 
        COUNT(*) as total_items,
        COUNT(*) FILTER (WHERE status = 'awaiting') as awaiting_count
      FROM inspection_queue
    `);
    
    console.log(`   Total items: ${inspectionResult.rows[0].total_items}`);
    console.log(`   Awaiting inspection: ${inspectionResult.rows[0].awaiting_count}`);
    
    // 4. Success/failure analysis
    console.log('\n📈 Success/Failure Analysis:');
    const totalJobs = 292;
    const scheduledJobs = parseInt(slots.unique_jobs_scheduled);
    const failedJobs = totalJobs - scheduledJobs;
    const successRate = (scheduledJobs / totalJobs * 100).toFixed(1);
    
    console.log(`   Total jobs imported: ${totalJobs}`);
    console.log(`   Successfully scheduled: ${scheduledJobs}`);
    console.log(`   Failed to schedule: ${failedJobs}`);
    console.log(`   Success rate: ${successRate}%`);
    
    // 5. Sample scheduled jobs (actual CSV jobs)
    console.log('\n📋 Sample Scheduled Jobs (CSV Import):');
    const sampleResult = await pool.query(`
      SELECT j.job_number, j.customer_name, j.status, j.auto_scheduled,
             COUNT(ss.id) as scheduled_operations,
             MIN(ss.start_datetime) as first_operation,
             MAX(ss.end_datetime) as last_operation
      FROM jobs j
      LEFT JOIN schedule_slots ss ON j.id = ss.job_id
      WHERE j.auto_scheduled = true
      GROUP BY j.id, j.job_number, j.customer_name, j.status, j.auto_scheduled
      ORDER BY j.job_number
      LIMIT 10
    `);
    
    sampleResult.rows.forEach(job => {
      console.log(`   ${job.job_number} (${job.customer_name}): ${job.scheduled_operations} ops, ${job.first_operation} to ${job.last_operation}`);
    });
    
    // 6. Jobs that failed to schedule (check for patterns)
    console.log('\n❌ Jobs That Failed to Schedule (sample):');
    const failedResult = await pool.query(`
      SELECT j.job_number, j.customer_name, j.status,
             COUNT(jr.id) as total_operations,
             COUNT(*) FILTER (WHERE jr.machine_id IS NULL AND jr.machine_group_id IS NULL) as null_machine_ops
      FROM jobs j
      LEFT JOIN job_routings jr ON j.id = jr.job_id
      WHERE j.auto_scheduled = false OR j.auto_scheduled IS NULL
      GROUP BY j.id, j.job_number, j.customer_name, j.status
      ORDER BY j.job_number
      LIMIT 10
    `);
    
    failedResult.rows.forEach(job => {
      console.log(`   ${job.job_number} (${job.customer_name}): ${job.total_operations} ops, ${job.null_machine_ops} NULL machines`);
    });
    
    // 7. Machine utilization
    console.log('\n🏭 Machine Utilization:');
    const machineResult = await pool.query(`
      SELECT m.name as machine_name, 
             COUNT(ss.id) as slots_count,
             SUM(ss.duration_minutes) as total_minutes
      FROM schedule_slots ss
      JOIN machines m ON ss.machine_id = m.id
      GROUP BY m.id, m.name
      ORDER BY slots_count DESC
      LIMIT 5
    `);
    
    machineResult.rows.forEach(machine => {
      const hours = (machine.total_minutes / 60).toFixed(1);
      console.log(`   ${machine.machine_name}: ${machine.slots_count} slots, ${hours} hours`);
    });
    
    console.log('\n✅ Auto-Schedule Analysis Complete!');
    
  } catch (error) {
    console.error('Error analyzing results:', error);
  } finally {
    await pool.end();
  }
}

checkAutoScheduleResults();