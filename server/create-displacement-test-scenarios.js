const { Pool } = require('pg');
const path = require('path');
const DisplacementService = require('./services/displacementService');
const SchedulingService = require('./services/schedulingService');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function createDisplacementTestScenarios() {
  try {
    console.log('🎭 Creating displacement test scenarios...\n');
    
    const displacementService = new DisplacementService(pool);
    const schedulingService = new SchedulingService(pool);
    
    // Step 1: Clear existing schedules to start fresh
    console.log('🧹 Step 1: Clearing existing schedules...');
    await pool.query('DELETE FROM schedule_slots');
    console.log('   ✅ Cleared all schedule slots\n');
    
    // Step 2: Get test jobs with different priorities
    const jobsResult = await pool.query(`
      SELECT id, job_number, priority_score, customer_name, promised_date
      FROM jobs 
      WHERE status != 'completed'
      ORDER BY priority_score ASC 
      LIMIT 10
    `);
    
    if (jobsResult.rows.length < 5) {
      console.log('❌ Need at least 5 jobs to create displacement test scenarios');
      return;
    }
    
    console.log('📋 Step 2: Available test jobs:');
    jobsResult.rows.forEach((job, index) => {
      console.log(`   ${index + 1}. ${job.job_number} (${job.customer_name}) - Score: ${job.priority_score}`);
    });
    
    // Select jobs for the scenario
    const lowPriorityJob1 = jobsResult.rows[0]; // Lowest priority
    const lowPriorityJob2 = jobsResult.rows[1]; 
    const mediumPriorityJob = jobsResult.rows[2];
    const highPriorityJob1 = jobsResult.rows[jobsResult.rows.length - 2]; // High priority
    const highPriorityJob2 = jobsResult.rows[jobsResult.rows.length - 1]; // Highest priority
    
    console.log(`\n🎯 Selected jobs for displacement scenario:`);
    console.log(`   Low Priority #1: ${lowPriorityJob1.job_number} (Score: ${lowPriorityJob1.priority_score})`);
    console.log(`   Low Priority #2: ${lowPriorityJob2.job_number} (Score: ${lowPriorityJob2.priority_score})`);
    console.log(`   Medium Priority: ${mediumPriorityJob.job_number} (Score: ${mediumPriorityJob.priority_score})`);
    console.log(`   High Priority #1: ${highPriorityJob1.job_number} (Score: ${highPriorityJob1.priority_score})`);
    console.log(`   High Priority #2: ${highPriorityJob2.job_number} (Score: ${highPriorityJob2.priority_score})`);
    
    // Step 3: Schedule lower priority jobs first to create conflicts
    console.log('\n📅 Step 3: Scheduling lower priority jobs first to create conflicts...');
    
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
    
    console.log(`   Scheduling ${mediumPriorityJob.job_number}...`);
    const schedule3 = await schedulingService.scheduleJob(mediumPriorityJob.id);
    console.log(`   Result: ${schedule3.success ? '✅ Success' : '❌ Failed: ' + schedule3.message}`);
    
    if (schedule3.success) {
      console.log(`   Scheduled ${schedule3.scheduledOperations?.length || 0} operations`);
    }
    
    // Step 4: Check current schedule status
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
    
    // Step 5: Now schedule high priority jobs to trigger displacement
    console.log('\n⚡ Step 5: Scheduling high priority jobs to trigger displacement...');
    
    console.log(`   Attempting displacement scheduling for ${highPriorityJob1.job_number}...`);
    const displacementResult1 = await displacementService.scheduleWithDisplacement(
      highPriorityJob1.id,
      { test: false } // Actually perform displacement
    );
    
    console.log(`   Result: ${displacementResult1.success ? '✅ Success' : '❌ Failed'}`);
    console.log(`   Scheduled normally: ${displacementResult1.scheduledNormally || false}`);
    console.log(`   Displacement used: ${displacementResult1.displacementUsed || false}`);
    console.log(`   Message: ${displacementResult1.message}`);
    
    if (displacementResult1.displacementUsed && displacementResult1.displacementResult) {
      const dr = displacementResult1.displacementResult;
      console.log(`   📋 Displacement details:`);
      console.log(`      Jobs displaced: ${dr.displacedJobs?.length || 0}`);
      console.log(`      Jobs rescheduled: ${dr.rescheduledJobs?.length || 0}`);
      console.log(`      Hours freed: ${dr.totalHoursFreed?.toFixed(2) || 0}h`);
      console.log(`      Execution time: ${dr.executionTimeMs || 0}ms`);
    }
    
    // Wait a moment for database operations to complete
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    console.log(`\n   Attempting displacement scheduling for ${highPriorityJob2.job_number}...`);
    const displacementResult2 = await displacementService.scheduleWithDisplacement(
      highPriorityJob2.id,
      { test: false } // Actually perform displacement
    );
    
    console.log(`   Result: ${displacementResult2.success ? '✅ Success' : '❌ Failed'}`);
    console.log(`   Scheduled normally: ${displacementResult2.scheduledNormally || false}`);
    console.log(`   Displacement used: ${displacementResult2.displacementUsed || false}`);
    console.log(`   Message: ${displacementResult2.message}`);
    
    if (displacementResult2.displacementUsed && displacementResult2.displacementResult) {
      const dr = displacementResult2.displacementResult;
      console.log(`   📋 Displacement details:`);
      console.log(`      Jobs displaced: ${dr.displacedJobs?.length || 0}`);
      console.log(`      Jobs rescheduled: ${dr.rescheduledJobs?.length || 0}`);
      console.log(`      Hours freed: ${dr.totalHoursFreed?.toFixed(2) || 0}h`);
      console.log(`      Execution time: ${dr.executionTimeMs || 0}ms`);
    }
    
    // Step 6: Check final displacement history
    console.log('\n📚 Step 6: Final displacement history...');
    const history = await displacementService.getDisplacementHistory({ limit: 10 });
    
    console.log(`   Total displacement events: ${history.length}`);
    if (history.length > 0) {
      console.log('   Recent displacement events:');
      history.forEach((entry, index) => {
        console.log(`     ${index + 1}. Job ${entry.trigger_job_number} (${entry.timestamp})`);
        console.log(`        Success: ${entry.success ? '✅' : '❌'}, Displaced: ${entry.total_displaced}, Rescheduled: ${entry.total_rescheduled}`);
        console.log(`        Customers affected: ${entry.customers_affected?.join(', ') || 'None'}`);
      });
    }
    
    // Step 7: Get analytics
    console.log('\n📊 Step 7: Displacement analytics...');
    const analytics = await displacementService.getDisplacementAnalytics();
    
    console.log(`   Total displacements: ${analytics.summary.total_displacements || 0}`);
    console.log(`   Success rate: ${analytics.summary.successful_displacements || 0}/${analytics.summary.total_displacements || 0}`);
    console.log(`   Average jobs displaced: ${parseFloat(analytics.summary.avg_jobs_displaced || 0).toFixed(1)}`);
    console.log(`   Average execution time: ${parseFloat(analytics.summary.avg_execution_time || 0).toFixed(0)}ms`);
    
    console.log('\n🎉 Displacement test scenarios completed successfully!');
    console.log('\n💡 Now you can view the displacement logs in the frontend at:');
    console.log('   http://localhost:3000/displacement-logs');
    
  } catch (error) {
    console.error('❌ Displacement test scenario creation failed:', error.message);
    console.error(error.stack);
  } finally {
    await pool.end();
  }
}

// Run the test scenario creation
createDisplacementTestScenarios();