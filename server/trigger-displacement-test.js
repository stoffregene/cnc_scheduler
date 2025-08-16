const { Pool } = require('pg');
const path = require('path');
const DisplacementService = require('./services/displacementService');
const SchedulingService = require('./services/schedulingService');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5732/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function triggerDisplacementTest() {
  try {
    console.log('🚀 Creating displacement test with priority-based displacement...\n');
    
    const displacementService = new DisplacementService(pool);
    const schedulingService = new SchedulingService(pool);
    
    // Step 1: Clear existing schedules to start fresh
    console.log('🧹 Step 1: Clearing existing schedules...');
    await pool.query('DELETE FROM schedule_slots');
    console.log('   ✅ Cleared all schedule slots\n');
    
    // Step 2: Get jobs with different priorities 
    const lowPriorityJobsResult = await pool.query(`
      SELECT id, job_number, priority_score, customer_name, promised_date
      FROM jobs 
      WHERE status != 'completed' AND priority_score <= 50
      ORDER BY priority_score ASC 
      LIMIT 3
    `);
    
    const highPriorityJobsResult = await pool.query(`
      SELECT id, job_number, priority_score, customer_name, promised_date
      FROM jobs 
      WHERE status != 'completed' AND priority_score >= 200
      ORDER BY priority_score DESC 
      LIMIT 2
    `);
    
    if (lowPriorityJobsResult.rows.length === 0) {
      console.log('❌ No low priority jobs found');
      return;
    }
    
    if (highPriorityJobsResult.rows.length === 0) {
      console.log('❌ No high priority jobs found');
      return;
    }
    
    const lowPriorityJob = lowPriorityJobsResult.rows[0];
    const highPriorityJob = highPriorityJobsResult.rows[0];
    
    console.log(`📋 Selected jobs for displacement test:`);
    console.log(`   Low Priority: ${lowPriorityJob.job_number} (Score: ${lowPriorityJob.priority_score})`);
    console.log(`   High Priority: ${highPriorityJob.job_number} (Score: ${highPriorityJob.priority_score})`);
    
    const priorityDifference = (highPriorityJob.priority_score - lowPriorityJob.priority_score) / lowPriorityJob.priority_score * 100;
    console.log(`   Priority difference: ${priorityDifference.toFixed(1)}% (need 15% for displacement)`);
    
    // Step 3: Schedule low priority job first
    console.log('\n📅 Step 3: Scheduling low priority job first...');
    console.log(`   Scheduling ${lowPriorityJob.job_number}...`);
    const scheduleResult = await schedulingService.scheduleJob(lowPriorityJob.id);
    console.log(`   Result: ${scheduleResult.success ? '✅ Success' : '❌ Failed: ' + scheduleResult.message}`);
    
    if (!scheduleResult.success) {
      console.log('❌ Cannot proceed - low priority job failed to schedule');
      return;
    }
    
    console.log(`   Scheduled ${scheduleResult.scheduledOperations?.length || 0} operations`);
    
    // Step 4: Check current schedule
    const slotsResult = await pool.query('SELECT COUNT(*) as count FROM schedule_slots');
    console.log(`   Current schedule slots: ${slotsResult.rows[0].count}`);
    
    // Step 5: Try to schedule high priority job with displacement
    console.log('\n⚡ Step 5: Attempting to schedule high priority job with displacement...');
    console.log(`   Scheduling ${highPriorityJob.job_number} with displacement...`);
    
    const displacementResult = await displacementService.scheduleWithDisplacement(
      highPriorityJob.id,
      { test: false } // Actually perform displacement
    );
    
    console.log(`   Result: ${displacementResult.success ? '✅ Success' : '❌ Failed'}`);
    console.log(`   Scheduled normally: ${displacementResult.scheduledNormally || false}`);
    console.log(`   Displacement used: ${displacementResult.displacementUsed || false}`);
    console.log(`   Message: ${displacementResult.message}`);
    
    if (displacementResult.displacementUsed && displacementResult.displacementResult) {
      const dr = displacementResult.displacementResult;
      console.log(`\n   📊 Displacement details:`);
      console.log(`      Jobs displaced: ${dr.displacedJobs?.length || 0}`);
      console.log(`      Jobs rescheduled: ${dr.rescheduledJobs?.length || 0}`);
      console.log(`      Hours freed: ${dr.totalHoursFreed?.toFixed(2) || 0}h`);
      console.log(`      Execution time: ${dr.executionTimeMs || 0}ms`);
      console.log(`      Log ID: ${dr.logId}`);
      
      if (dr.displacedJobs && dr.displacedJobs.length > 0) {
        console.log(`\n   📋 Displaced jobs:`);
        dr.displacedJobs.forEach((job, index) => {
          console.log(`      ${index + 1}. ${job.jobNumber} - ${job.reason}`);
        });
      }
      
      if (dr.rescheduledJobs && dr.rescheduledJobs.length > 0) {
        console.log(`\n   🔄 Rescheduled jobs:`);
        dr.rescheduledJobs.forEach((job, index) => {
          const delayText = job.delayHours > 0 ? `+${job.delayHours.toFixed(1)}h delay` : 'No delay';
          console.log(`      ${index + 1}. ${job.jobNumber}: ${job.status} (${delayText})`);
        });
      }
    }
    
    // Step 6: Check final displacement history
    console.log('\n📚 Step 6: Displacement history summary...');
    const history = await displacementService.getDisplacementHistory({ limit: 5 });
    
    console.log(`   Total displacement events: ${history.length}`);
    if (history.length > 0) {
      const latest = history[0];
      console.log(`   Latest displacement:`);
      console.log(`      Trigger job: ${latest.trigger_job_number}`);
      console.log(`      Success: ${latest.success ? '✅' : '❌'}`);
      console.log(`      Jobs displaced: ${latest.total_displaced}`);
      console.log(`      Jobs rescheduled: ${latest.total_rescheduled}`);
      console.log(`      Execution time: ${latest.execution_time_ms}ms`);
    }
    
    // Step 7: Get analytics
    console.log('\n📊 Step 7: Current displacement analytics...');
    const analytics = await displacementService.getDisplacementAnalytics();
    
    console.log(`   Total displacements: ${analytics.summary.total_displacements || 0}`);
    console.log(`   Success rate: ${analytics.summary.successful_displacements || 0}/${analytics.summary.total_displacements || 0}`);
    console.log(`   Average execution time: ${parseFloat(analytics.summary.avg_execution_time || 0).toFixed(0)}ms`);
    
    console.log('\n🎉 Displacement test completed successfully!');
    console.log('\n💡 View the displacement logs in the frontend at:');
    console.log('   http://localhost:3000/displacement-logs');
    
  } catch (error) {
    console.error('❌ Displacement test failed:', error.message);
    console.error(error.stack);
  } finally {
    await pool.end();
  }
}

// Run the displacement test
triggerDisplacementTest();