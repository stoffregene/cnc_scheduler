const { Pool } = require('pg');
const path = require('path');
const DisplacementService = require('./services/displacementService');
const SchedulingService = require('./services/schedulingService');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5732/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function simpleDisplacementTest() {
  try {
    console.log('🎯 Simple displacement test - scheduling jobs with different priorities...\n');
    
    const displacementService = new DisplacementService(pool);
    const schedulingService = new SchedulingService(pool);
    
    // Step 1: Clear existing schedules
    console.log('🧹 Clearing existing schedules...');
    await pool.query('DELETE FROM schedule_slots');
    console.log('   ✅ Cleared all schedule slots\n');
    
    // Step 2: Find jobs without INSPECT operations that can actually be scheduled
    const jobsResult = await pool.query(`
      SELECT DISTINCT j.id, j.job_number, j.priority_score, j.customer_name
      FROM jobs j
      JOIN job_routings jr ON j.id = jr.job_id
      WHERE j.status != 'completed' 
        AND jr.operation_name NOT LIKE '%INSPECT%'
        AND jr.operation_name IN ('SAW-001', 'HMC-001', 'VMC-001', 'VMC-002', 'LATHE-001')
      ORDER BY j.priority_score ASC 
      LIMIT 10
    `);
    
    if (jobsResult.rows.length < 2) {
      console.log('❌ Need at least 2 jobs without INSPECT operations');
      return;
    }
    
    console.log('📋 Available jobs (without INSPECT operations):');
    jobsResult.rows.forEach((job, index) => {
      console.log(`   ${index + 1}. ${job.job_number} - Score: ${job.priority_score} (${job.customer_name})`);
    });
    
    // Select jobs for test
    const lowPriorityJob = jobsResult.rows[0];
    const highPriorityJob = jobsResult.rows[jobsResult.rows.length - 1];
    
    console.log(`\n🎯 Selected for displacement test:`);
    console.log(`   Low Priority: ${lowPriorityJob.job_number} (Score: ${lowPriorityJob.priority_score})`);
    console.log(`   High Priority: ${highPriorityJob.job_number} (Score: ${highPriorityJob.priority_score})`);
    
    const priorityDiff = (highPriorityJob.priority_score - lowPriorityJob.priority_score) / lowPriorityJob.priority_score * 100;
    console.log(`   Priority difference: ${priorityDiff.toFixed(1)}% (need 15% for displacement)`);
    
    if (priorityDiff < 15) {
      console.log('⚠️ Priority difference too small for displacement, but will proceed for testing...');
    }
    
    // Step 3: Schedule low priority job first
    console.log('\n📅 Step 3: Scheduling low priority job...');
    const lowPriorityResult = await schedulingService.scheduleJob(lowPriorityJob.id);
    console.log(`   ${lowPriorityJob.job_number}: ${lowPriorityResult.success ? '✅ Success' : '❌ Failed'}`);
    
    if (!lowPriorityResult.success) {
      console.log('❌ Cannot proceed - low priority job failed to schedule');
      console.log(`   Error: ${lowPriorityResult.message}`);
      return;
    }
    
    // Check if we have any slots scheduled
    const slotsCount = await pool.query('SELECT COUNT(*) as count FROM schedule_slots');
    console.log(`   Scheduled slots: ${slotsCount.rows[0].count}`);
    
    if (slotsCount.rows[0].count === 0) {
      console.log('❌ No slots were actually created for low priority job');
      return;
    }
    
    // Step 4: Try scheduling high priority job with displacement
    console.log('\n⚡ Step 4: Scheduling high priority job with displacement...');
    const displacementResult = await displacementService.scheduleWithDisplacement(
      highPriorityJob.id,
      { test: false }
    );
    
    console.log(`   ${highPriorityJob.job_number}: ${displacementResult.success ? '✅ Success' : '❌ Failed'}`);
    console.log(`   Scheduled normally: ${displacementResult.scheduledNormally || false}`);
    console.log(`   Displacement used: ${displacementResult.displacementUsed || false}`);
    
    if (displacementResult.displacementUsed && displacementResult.displacementResult) {
      const dr = displacementResult.displacementResult;
      console.log(`\n   📊 Displacement Results:`);
      console.log(`      Jobs displaced: ${dr.displacedJobs?.length || 0}`);
      console.log(`      Jobs rescheduled: ${dr.rescheduledJobs?.length || 0}`);
      console.log(`      Hours freed: ${dr.totalHoursFreed?.toFixed(2) || 0}h`);
      console.log(`      Execution time: ${dr.executionTimeMs || 0}ms`);
      console.log(`      Log ID: ${dr.logId}`);
    }
    
    // Step 5: Show displacement history
    console.log('\n📚 Step 5: Current displacement history...');
    const history = await displacementService.getDisplacementHistory({ limit: 3 });
    
    console.log(`   Total displacement events: ${history.length}`);
    if (history.length > 0) {
      console.log('   Recent events:');
      history.forEach((entry, index) => {
        console.log(`     ${index + 1}. ${entry.trigger_job_number} - ${entry.success ? 'SUCCESS' : 'FAILED'}`);
        console.log(`        Displaced: ${entry.total_displaced}, Rescheduled: ${entry.total_rescheduled}`);
        console.log(`        Time: ${new Date(entry.timestamp).toLocaleString()}`);
      });
    }
    
    // Step 6: Final schedule check
    const finalSlots = await pool.query('SELECT COUNT(*) as count FROM schedule_slots');
    console.log(`\n📊 Final schedule slots: ${finalSlots.rows[0].count}`);
    
    console.log('\n🎉 Displacement test completed!');
    console.log('\n💻 View the displacement logs at: http://localhost:3000/displacement-logs');
    
  } catch (error) {
    console.error('❌ Displacement test failed:', error.message);
    console.error(error.stack);
  } finally {
    await pool.end();
  }
}

// Run the test
simpleDisplacementTest();