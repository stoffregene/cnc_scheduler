const { Pool } = require('pg');
const SchedulingService = require('./server/services/schedulingService');

async function testDuplicateSlotsFix() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/scheduler'
  });
  
  const schedulingService = new SchedulingService(pool);
  
  try {
    console.log('🧪 Testing duplicate slots fix...\n');
    
    // First, find a job that's already scheduled
    const existingJobsResult = await pool.query(`
      SELECT DISTINCT j.id, j.job_number, j.auto_scheduled, COUNT(ss.id) as slot_count
      FROM jobs j
      JOIN schedule_slots ss ON j.id = ss.job_id
      WHERE ss.status IN ('scheduled', 'in_progress')
      GROUP BY j.id, j.job_number, j.auto_scheduled
      HAVING COUNT(ss.id) > 0
      ORDER BY j.id
      LIMIT 1
    `);
    
    if (existingJobsResult.rows.length === 0) {
      console.log('❌ No scheduled jobs found to test with');
      return;
    }
    
    const testJob = existingJobsResult.rows[0];
    console.log(`📋 Testing with Job ${testJob.job_number} (ID: ${testJob.id})`);
    console.log(`   Current slots: ${testJob.slot_count}`);
    console.log(`   Auto-scheduled: ${testJob.auto_scheduled}\n`);
    
    // Count slots before attempting to schedule again
    const beforeCount = await pool.query(
      'SELECT COUNT(*) as count FROM schedule_slots WHERE job_id = $1 AND status IN (\'scheduled\', \'in_progress\')',
      [testJob.id]
    );
    
    console.log(`📊 Slots before re-scheduling: ${beforeCount.rows[0].count}`);
    
    // Try to schedule the job again (without forceReschedule)
    console.log('🔄 Attempting to schedule already-scheduled job...\n');
    
    const result = await schedulingService.scheduleJob(testJob.id, false); // forceReschedule = false
    
    // Count slots after
    const afterCount = await pool.query(
      'SELECT COUNT(*) as count FROM schedule_slots WHERE job_id = $1 AND status IN (\'scheduled\', \'in_progress\')',
      [testJob.id]
    );
    
    console.log(`📊 Slots after re-scheduling: ${afterCount.rows[0].count}`);
    
    // Check if duplicates were created
    if (beforeCount.rows[0].count === afterCount.rows[0].count) {
      console.log('✅ SUCCESS: No duplicate slots created!');
      console.log(`📝 Result: ${result.message || 'Job scheduling completed'}`);
    } else {
      console.log('❌ FAILED: Duplicate slots were created!');
      console.log(`   Expected: ${beforeCount.rows[0].count} slots`);
      console.log(`   Actual: ${afterCount.rows[0].count} slots`);
      console.log(`   Duplicates: ${afterCount.rows[0].count - beforeCount.rows[0].count}`);
    }
    
    // Show any operations that were skipped
    if (result.scheduled_operations) {
      const skippedOps = result.scheduled_operations.filter(op => op.skipped_existing);
      if (skippedOps.length > 0) {
        console.log(`\n⏭️  Skipped ${skippedOps.length} already-scheduled operations:`);
        skippedOps.forEach(op => {
          console.log(`   - Operation ${op.operation_number}: ${op.operation_name}`);
        });
      }
    }
    
  } catch (error) {
    console.error('❌ Test failed with error:', error.message);
  } finally {
    await pool.end();
  }
}

// Run the test
testDuplicateSlotsFix();