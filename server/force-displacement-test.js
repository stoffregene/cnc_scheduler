const { Pool } = require('pg');
const path = require('path');
const DisplacementService = require('./services/displacementService');
const SchedulingService = require('./services/schedulingService');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5732/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function forceDisplacementTest() {
  try {
    console.log('🎯 Creating forced displacement scenario...\n');
    
    const displacementService = new DisplacementService(pool);
    const schedulingService = new SchedulingService(pool);
    
    // Step 1: Clear existing schedules
    console.log('🧹 Clearing existing schedules...');
    await pool.query('DELETE FROM schedule_slots');
    console.log('   ✅ Cleared all schedule slots\n');
    
    // Step 2: Temporarily modify job priorities to create a clear displacement scenario
    console.log('🔧 Creating displacement scenario by adjusting priorities...');
    
    // Get some jobs to work with
    const jobsResult = await pool.query(`
      SELECT id, job_number, priority_score, customer_name
      FROM jobs 
      WHERE status != 'completed'
      ORDER BY id ASC
      LIMIT 5
    `);
    
    if (jobsResult.rows.length < 3) {
      console.log('❌ Need at least 3 jobs for displacement test');
      return;
    }
    
    const lowPriorityJob = jobsResult.rows[0];
    const mediumPriorityJob = jobsResult.rows[1]; 
    const highPriorityJob = jobsResult.rows[2];
    
    // Temporarily set priorities to create clear displacement scenario
    await pool.query('UPDATE jobs SET priority_score = 10 WHERE id = $1', [lowPriorityJob.id]);
    await pool.query('UPDATE jobs SET priority_score = 15 WHERE id = $1', [mediumPriorityJob.id]);
    await pool.query('UPDATE jobs SET priority_score = 1000 WHERE id = $1', [highPriorityJob.id]);
    
    console.log(`   Low Priority: ${lowPriorityJob.job_number} (Score: 10)`);
    console.log(`   Medium Priority: ${mediumPriorityJob.job_number} (Score: 15)`);
    console.log(`   High Priority: ${highPriorityJob.job_number} (Score: 1000)`);
    
    // Step 3: Schedule lower priority jobs first
    console.log('\n📅 Step 3: Scheduling lower priority jobs...');
    
    console.log(`   Scheduling ${lowPriorityJob.job_number}...`);
    const schedule1 = await schedulingService.scheduleJob(lowPriorityJob.id);
    if (schedule1.success) {
      console.log(`   ✅ Successfully scheduled ${schedule1.scheduledOperations?.length || 0} operations`);
    } else {
      console.log(`   ❌ Failed: ${schedule1.message}`);
    }
    
    // Add some delay to ensure different timestamps
    await new Promise(resolve => setTimeout(resolve, 100));
    
    console.log(`   Scheduling ${mediumPriorityJob.job_number}...`);
    const schedule2 = await schedulingService.scheduleJob(mediumPriorityJob.id);
    if (schedule2.success) {
      console.log(`   ✅ Successfully scheduled ${schedule2.scheduledOperations?.length || 0} operations`);
    } else {
      console.log(`   ❌ Failed: ${schedule2.message}`);
    }
    
    // Check current schedule
    const currentSlots = await pool.query('SELECT COUNT(*) as count FROM schedule_slots');
    console.log(`\n   Current schedule slots: ${currentSlots.rows[0].count}`);
    
    if (currentSlots.rows[0].count === 0) {
      console.log('❌ No jobs were scheduled - cannot test displacement');
      return;
    }
    
    // Step 4: Now force displacement with high priority job
    console.log('\n⚡ Step 4: Forcing displacement with high priority job...');
    
    // First check opportunities
    const opportunities = await displacementService.findDisplacementOpportunities(
      highPriorityJob.id,
      new Date(),
      8 // Need 8 hours
    );
    
    console.log(`   Found ${opportunities.opportunities.length} displacement opportunities`);
    console.log(`   Total hours available: ${opportunities.totalHoursAvailable.toFixed(2)}h`);
    console.log(`   Sufficient for scheduling: ${opportunities.sufficient ? 'YES' : 'NO'}`);
    
    if (opportunities.opportunities.length > 0) {
      console.log('\n   📋 Available opportunities:');
      opportunities.opportunities.forEach((opp, index) => {
        console.log(`     ${index + 1}. ${opp.displacedJob.job_number} - Hours: ${opp.hoursFreed.toFixed(2)}h`);
        console.log(`        Reason: ${opp.reason}`);
      });
      
      // Execute displacement
      console.log(`\n   🚀 Executing displacement...`);
      const displacementResult = await displacementService.executeDisplacement(
        highPriorityJob.id,
        opportunities.opportunities.slice(0, 2), // Displace up to 2 jobs
        { test: false }
      );
      
      if (displacementResult.success) {
        console.log(`   ✅ Displacement executed successfully!`);
        console.log(`   Jobs displaced: ${displacementResult.displacedJobs.length}`);
        console.log(`   Jobs rescheduled: ${displacementResult.rescheduledJobs.length}`);
        console.log(`   Hours freed: ${displacementResult.totalHoursFreed.toFixed(2)}h`);
        console.log(`   Execution time: ${displacementResult.executionTimeMs}ms`);
        console.log(`   Log ID: ${displacementResult.logId}`);
        
        if (displacementResult.displacedJobs.length > 0) {
          console.log('\n   📋 Displaced jobs:');
          displacementResult.displacedJobs.forEach((job, index) => {
            console.log(`     ${index + 1}. ${job.jobNumber} - ${job.reason}`);
          });
        }
        
        if (displacementResult.rescheduledJobs.length > 0) {
          console.log('\n   🔄 Rescheduled jobs:');
          displacementResult.rescheduledJobs.forEach((job, index) => {
            const delayText = job.delayHours > 0 ? `+${job.delayHours.toFixed(1)}h delay` : 'No delay';
            console.log(`     ${index + 1}. ${job.jobNumber}: ${job.status} (${delayText})`);
          });
        }
      } else {
        console.log(`   ❌ Displacement failed: ${displacementResult.error}`);
      }
    } else {
      console.log('   ⚠️ No displacement opportunities found');
    }
    
    // Step 5: Schedule the high priority job using scheduleWithDisplacement 
    console.log('\n🎯 Step 5: Scheduling high priority job with displacement API...');
    const scheduleWithDisplacementResult = await displacementService.scheduleWithDisplacement(
      highPriorityJob.id,
      { test: false }
    );
    
    console.log(`   Result: ${scheduleWithDisplacementResult.success ? '✅ Success' : '❌ Failed'}`);
    console.log(`   Scheduled normally: ${scheduleWithDisplacementResult.scheduledNormally || false}`);
    console.log(`   Displacement used: ${scheduleWithDisplacementResult.displacementUsed || false}`);
    console.log(`   Message: ${scheduleWithDisplacementResult.message}`);
    
    // Step 6: Show final displacement history
    console.log('\n📚 Step 6: Final displacement history...');
    const history = await displacementService.getDisplacementHistory({ limit: 10 });
    
    console.log(`   Total displacement events: ${history.length}`);
    if (history.length > 0) {
      console.log('   Recent displacement events:');
      history.forEach((entry, index) => {
        console.log(`     ${index + 1}. Job ${entry.trigger_job_number} - ${entry.timestamp}`);
        console.log(`        Success: ${entry.success ? '✅' : '❌'}, Displaced: ${entry.total_displaced}, Rescheduled: ${entry.total_rescheduled}`);
      });
    }
    
    // Step 7: Get analytics
    console.log('\n📊 Step 7: Displacement analytics...');
    const analytics = await displacementService.getDisplacementAnalytics();
    
    console.log(`   Total displacements: ${analytics.summary.total_displacements || 0}`);
    console.log(`   Success rate: ${analytics.summary.successful_displacements || 0}/${analytics.summary.total_displacements || 0}`);
    console.log(`   Average execution time: ${parseFloat(analytics.summary.avg_execution_time || 0).toFixed(0)}ms`);
    
    console.log('\n🎉 Forced displacement test completed!');
    console.log('\n💻 View the displacement logs at: http://localhost:3000/displacement-logs');
    
  } catch (error) {
    console.error('❌ Forced displacement test failed:', error.message);
    console.error(error.stack);
  } finally {
    await pool.end();
  }
}

// Run the test
forceDisplacementTest();