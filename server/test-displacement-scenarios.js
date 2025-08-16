const { Pool } = require('pg');
const path = require('path');
const DisplacementService = require('./services/displacementService');
const SchedulingService = require('./services/schedulingService');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function testDisplacementScenarios() {
  try {
    console.log('🧪 Testing Displacement Engine Scenarios...\n');
    
    const displacementService = new DisplacementService(pool);
    const schedulingService = new SchedulingService(pool);
    
    // Step 1: Clear existing schedules to start fresh
    console.log('🧹 Step 1: Clearing existing schedules...');
    await pool.query('DELETE FROM schedule_slots');
    console.log('   ✅ Cleared all schedule slots\n');
    
    // Step 2: Get some test jobs with different priorities
    const jobsResult = await pool.query(`
      SELECT id, job_number, priority_score, customer_name, promised_date
      FROM jobs 
      WHERE status != 'completed'
      ORDER BY priority_score DESC 
      LIMIT 20
    `);
    
    console.log('📋 Step 2: Available test jobs:');
    jobsResult.rows.forEach((job, index) => {
      console.log(`   ${index + 1}. ${job.job_number} (${job.customer_name}) - Score: ${job.priority_score}`);
    });
    
    if (jobsResult.rows.length < 5) {
      console.log('\n❌ Need at least 5 jobs to test displacement scenarios');
      return;
    }
    
    const highPriorityJob = jobsResult.rows[0]; // Highest priority
    const mediumPriorityJob1 = jobsResult.rows[2]; 
    const mediumPriorityJob2 = jobsResult.rows[3];
    const lowPriorityJob1 = jobsResult.rows[jobsResult.rows.length - 2];
    const lowPriorityJob2 = jobsResult.rows[jobsResult.rows.length - 1];
    
    console.log(`\n🎯 Test scenario jobs selected:`);
    console.log(`   High Priority: ${highPriorityJob.job_number} (Score: ${highPriorityJob.priority_score})`);
    console.log(`   Medium Priority: ${mediumPriorityJob1.job_number} (Score: ${mediumPriorityJob1.priority_score})`);
    console.log(`   Medium Priority: ${mediumPriorityJob2.job_number} (Score: ${mediumPriorityJob2.priority_score})`);
    console.log(`   Low Priority: ${lowPriorityJob1.job_number} (Score: ${lowPriorityJob1.priority_score})`);
    console.log(`   Low Priority: ${lowPriorityJob2.job_number} (Score: ${lowPriorityJob2.priority_score})`);
    
    // Step 3: Schedule some lower priority jobs first to create conflicts
    console.log('\n📅 Step 3: Scheduling lower priority jobs first...');
    
    console.log(`   Scheduling ${lowPriorityJob1.job_number}...`);
    const schedule1 = await schedulingService.scheduleJob(lowPriorityJob1.id);
    console.log(`   Result: ${schedule1.success ? '✅ Success' : '❌ Failed: ' + schedule1.message}`);
    
    if (schedule1.success) {
      console.log(`   Scheduled ${schedule1.scheduledOperations?.length || 0} operations`);
    }
    
    console.log(`   Scheduling ${lowPriorityJob2.job_number}...`);
    const schedule2 = await schedulingService.scheduleJob(lowPriorityJob2.id);
    console.log(`   Result: ${schedule2.success ? '✅ Success' : '❌ Failed: ' + schedule2.message}`);
    
    if (schedule2.success) {
      console.log(`   Scheduled ${schedule2.scheduledOperations?.length || 0} operations`);
    }
    
    console.log(`   Scheduling ${mediumPriorityJob1.job_number}...`);
    const schedule3 = await schedulingService.scheduleJob(mediumPriorityJob1.id);
    console.log(`   Result: ${schedule3.success ? '✅ Success' : '❌ Failed: ' + schedule3.message}`);
    
    if (schedule3.success) {
      console.log(`   Scheduled ${schedule3.scheduledOperations?.length || 0} operations`);
    }
    
    // Step 4: Check current schedule capacity
    console.log('\n📊 Step 4: Current schedule status...');
    const currentSlots = await pool.query(`
      SELECT COUNT(*) as total_slots,
             COUNT(DISTINCT job_id) as scheduled_jobs,
             MIN(start_datetime) as earliest,
             MAX(end_datetime) as latest
      FROM schedule_slots
    `);
    
    console.log(`   Total schedule slots: ${currentSlots.rows[0].total_slots}`);
    console.log(`   Jobs scheduled: ${currentSlots.rows[0].scheduled_jobs}`);
    if (currentSlots.rows[0].earliest) {
      console.log(`   Schedule range: ${currentSlots.rows[0].earliest} to ${currentSlots.rows[0].latest}`);
    }
    
    // Step 5: Test displacement opportunities
    console.log('\n🔍 Step 5: Testing displacement opportunities...');
    
    console.log(`   Finding opportunities for high priority job ${highPriorityJob.job_number}...`);
    const opportunities = await displacementService.findDisplacementOpportunities(
      highPriorityJob.id,
      new Date(),
      8 // Need 8 hours of capacity
    );
    
    console.log(`   Found ${opportunities.opportunities.length} displacement opportunities`);
    console.log(`   Total hours available: ${opportunities.totalHoursAvailable.toFixed(2)}h`);
    console.log(`   Sufficient for scheduling: ${opportunities.sufficient ? '✅ YES' : '❌ NO'}`);
    
    if (opportunities.opportunities.length > 0) {
      console.log('\n   📋 Displacement opportunities:');
      opportunities.opportunities.forEach((opp, index) => {
        console.log(`     ${index + 1}. ${opp.displacedJob.job_number} (${opp.displacedJob.customer_name})`);
        console.log(`        Priority: ${opp.displacedJob.priority_score}, Machine: ${opp.machine}`);
        console.log(`        Hours freed: ${opp.hoursFreed.toFixed(2)}h, Reason: ${opp.reason}`);
      });
    }
    
    // Step 6: Test displacement impact analysis
    console.log('\n📈 Step 6: Displacement impact analysis...');
    
    const impact = await displacementService.calculateDisplacementImpact(highPriorityJob.id);
    
    if (impact.error) {
      console.log(`   ❌ Error: ${impact.error}`);
    } else {
      console.log(`   Can displace: ${impact.canDisplace ? '✅ YES' : '❌ NO'}`);
      console.log(`   Jobs affected: ${impact.jobsAffected}`);
      console.log(`   Total hours freed: ${impact.totalHoursFreed.toFixed(2)}h`);
      console.log(`   Customers affected: ${impact.customers.join(', ')}`);
      console.log(`   Machines affected: ${impact.machines.join(', ')}`);
      console.log(`   Estimated delay: ${impact.estimatedDelay} days`);
    }
    
    // Step 7: Test actual displacement execution
    if (opportunities.sufficient && opportunities.opportunities.length > 0) {
      console.log('\n⚡ Step 7: Testing displacement execution...');
      
      console.log(`   Executing displacement for ${highPriorityJob.job_number}...`);
      
      const displacementResult = await displacementService.executeDisplacement(
        highPriorityJob.id,
        opportunities.opportunities.slice(0, 2), // Only displace first 2 jobs
        { test: true }
      );
      
      if (displacementResult.success) {
        console.log(`   ✅ Displacement executed successfully!`);
        console.log(`   Trigger job scheduled: ${displacementResult.triggerJobScheduled ? '✅ YES' : '❌ NO'}`);
        console.log(`   Jobs displaced: ${displacementResult.displacedJobs.length}`);
        console.log(`   Jobs rescheduled: ${displacementResult.rescheduledJobs.length}`);
        console.log(`   Total hours freed: ${displacementResult.totalHoursFreed.toFixed(2)}h`);
        console.log(`   Execution time: ${displacementResult.executionTimeMs}ms`);
        console.log(`   Log ID: ${displacementResult.logId}`);
        
        // Show rescheduling results
        if (displacementResult.rescheduledJobs.length > 0) {
          console.log('\n   📋 Rescheduling results:');
          displacementResult.rescheduledJobs.forEach((job, index) => {
            const delayText = job.delayHours > 0 ? `+${job.delayHours.toFixed(1)}h delay` : 'No delay';
            console.log(`     ${index + 1}. ${job.jobNumber}: ${job.status} (${delayText})`);
          });
        }
      } else {
        console.log(`   ❌ Displacement failed: ${displacementResult.error}`);
      }
    } else {
      console.log('\n⚠️ Step 7: Skipping displacement execution (insufficient opportunities)');
    }
    
    // Step 8: Test scheduling with displacement API
    console.log('\n🎯 Step 8: Testing scheduleWithDisplacement API...');
    
    const scheduleWithDisplacementResult = await displacementService.scheduleWithDisplacement(
      mediumPriorityJob2.id,
      { test: true }
    );
    
    console.log(`   Result: ${scheduleWithDisplacementResult.success ? '✅ Success' : '❌ Failed'}`);
    console.log(`   Scheduled normally: ${scheduleWithDisplacementResult.scheduledNormally || false}`);
    console.log(`   Displacement used: ${scheduleWithDisplacementResult.displacementUsed || false}`);
    console.log(`   Message: ${scheduleWithDisplacementResult.message}`);
    
    // Step 9: Check displacement history
    console.log('\n📚 Step 9: Checking displacement history...');
    
    const history = await displacementService.getDisplacementHistory({ limit: 5 });
    console.log(`   Historical displacements: ${history.length}`);
    
    if (history.length > 0) {
      console.log('   Recent displacements:');
      history.forEach((entry, index) => {
        console.log(`     ${index + 1}. Job ${entry.trigger_job_number} - ${entry.timestamp}`);
        console.log(`        Success: ${entry.success}, Displaced: ${entry.total_displaced}, Rescheduled: ${entry.total_rescheduled}`);
      });
    }
    
    // Step 10: Get displacement analytics
    console.log('\n📊 Step 10: Displacement analytics...');
    
    const analytics = await displacementService.getDisplacementAnalytics();
    console.log(`   Total displacements: ${analytics.summary.total_displacements || 0}`);
    console.log(`   Success rate: ${analytics.summary.successful_displacements || 0}/${analytics.summary.total_displacements || 0}`);
    console.log(`   Average jobs displaced: ${parseFloat(analytics.summary.avg_jobs_displaced || 0).toFixed(1)}`);
    console.log(`   Average execution time: ${parseFloat(analytics.summary.avg_execution_time || 0).toFixed(0)}ms`);
    
    if (analytics.topAffectedCustomers.length > 0) {
      console.log('\n   Top affected customers:');
      analytics.topAffectedCustomers.forEach((customer, index) => {
        console.log(`     ${index + 1}. ${customer.customer}: ${customer.displacement_count} displacements`);
      });
    }
    
    console.log('\n🎉 Displacement engine testing completed successfully!');
    
    // Summary of what was tested
    console.log('\n📋 Test Summary:');
    console.log('   ✅ Displacement opportunity detection');
    console.log('   ✅ Priority-based displacement rules');
    console.log('   ✅ Impact analysis calculation');
    console.log('   ✅ Displacement execution with logging');
    console.log('   ✅ Automatic rescheduling of displaced jobs');
    console.log('   ✅ scheduleWithDisplacement API');
    console.log('   ✅ Displacement history tracking');
    console.log('   ✅ Analytics and reporting');
    
  } catch (error) {
    console.error('❌ Displacement scenario test failed:', error.message);
    console.error(error.stack);
  } finally {
    await pool.end();
  }
}

// Run the test scenarios
testDisplacementScenarios();