const { Pool } = require('pg');
const path = require('path');
const axios = require('axios');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5732/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

const baseURL = 'http://localhost:5000';

async function testScheduleAllComprehensive() {
  try {
    console.log('🎯 Comprehensive Schedule All Test - Post Improvements...\n');
    
    // Step 1: Clear existing schedules and analyze current state
    console.log('🧹 Step 1: Clearing existing schedules...');
    await axios.delete(`${baseURL}/api/scheduling/unschedule-all`);
    console.log('   ✅ All schedules cleared');
    
    // Step 2: Analyze the job landscape
    console.log('\n📊 Step 2: Analyzing job landscape...');
    const jobsResult = await pool.query(`
      SELECT 
        COUNT(*) as total_jobs,
        COUNT(*) FILTER (WHERE status = 'pending') as pending_jobs,
        COUNT(*) FILTER (WHERE status = 'completed') as completed_jobs,
        COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress_jobs
      FROM jobs
    `);
    
    const landscape = jobsResult.rows[0];
    console.log(`   Total jobs: ${landscape.total_jobs}`);
    console.log(`   Pending: ${landscape.pending_jobs}`);
    console.log(`   Completed: ${landscape.completed_jobs}`);
    console.log(`   In Progress: ${landscape.in_progress_jobs}`);
    
    // Step 3: Analyze routing issues
    console.log('\n🔍 Step 3: Pre-scheduling analysis...');
    
    // Check for NULL machine assignments (our known issue)
    const nullMachinesResult = await pool.query(`
      SELECT COUNT(*) as null_machine_count
      FROM job_routings jr
      JOIN jobs j ON jr.job_id = j.id
      WHERE j.status = 'pending' 
        AND jr.machine_id IS NULL 
        AND jr.machine_group_id IS NULL
    `);
    
    console.log(`   Operations with NULL machines: ${nullMachinesResult.rows[0].null_machine_count}`);
    
    // Check INSPECT operations
    const inspectResult = await pool.query(`
      SELECT COUNT(*) as inspect_count
      FROM job_routings jr
      JOIN jobs j ON jr.job_id = j.id
      WHERE j.status = 'pending' 
        AND jr.operation_name ILIKE '%INSPECT%'
    `);
    
    console.log(`   INSPECT operations: ${inspectResult.rows[0].inspect_count}`);
    
    // Step 4: Get a sample of pending jobs to schedule
    console.log('\n📋 Step 4: Selecting jobs for scheduling test...');
    const sampleJobsResult = await pool.query(`
      SELECT j.id, j.job_number, j.customer_name, j.priority_score, j.status,
             COUNT(jr.id) as operation_count,
             COUNT(*) FILTER (WHERE jr.machine_id IS NULL AND jr.machine_group_id IS NULL) as null_machine_ops,
             COUNT(*) FILTER (WHERE jr.operation_name ILIKE '%INSPECT%') as inspect_ops
      FROM jobs j
      LEFT JOIN job_routings jr ON j.id = jr.job_id
      WHERE j.status = 'pending'
      GROUP BY j.id, j.job_number, j.customer_name, j.priority_score, j.status
      ORDER BY j.priority_score::numeric DESC
      LIMIT 10
    `);
    
    console.log(`   Selected ${sampleJobsResult.rows.length} highest priority jobs for initial test:`);
    sampleJobsResult.rows.forEach((job, idx) => {
      console.log(`     ${idx + 1}. ${job.job_number} (${job.customer_name})`);
      console.log(`        Priority: ${job.priority_score}, Operations: ${job.operation_count}`);
      console.log(`        NULL machines: ${job.null_machine_ops}, INSPECT ops: ${job.inspect_ops}`);
    });
    
    // Step 5: Test scheduling individual high-priority jobs first
    console.log('\n⏰ Step 5: Testing individual job scheduling...');
    
    const schedulingResults = {
      total_attempted: 0,
      successful: 0,
      failed: 0,
      null_machine_failures: 0,
      inspect_queue_additions: 0,
      other_failures: 0,
      error_details: []
    };
    
    // Test first 5 jobs individually to understand patterns
    for (let i = 0; i < Math.min(5, sampleJobsResult.rows.length); i++) {
      const job = sampleJobsResult.rows[i];
      schedulingResults.total_attempted++;
      
      console.log(`\n   🎯 Scheduling job ${job.job_number}...`);
      
      try {
        const response = await axios.post(`${baseURL}/api/scheduling/schedule-job/${job.id}`);
        
        if (response.data.success) {
          schedulingResults.successful++;
          console.log(`   ✅ SUCCESS: ${job.job_number} scheduled`);
          
          // Check if any operations were added to inspection queue
          if (response.data.operations) {
            const inspectQueueOps = response.data.operations.filter(op => op.inspection_queue);
            if (inspectQueueOps.length > 0) {
              schedulingResults.inspect_queue_additions += inspectQueueOps.length;
              console.log(`   🔍 Added ${inspectQueueOps.length} INSPECT operations to queue`);
            }
          }
        } else {
          schedulingResults.failed++;
          console.log(`   ❌ FAILED: ${job.job_number} - ${response.data.error || 'Unknown error'}`);
          schedulingResults.error_details.push({
            job: job.job_number,
            error: response.data.error || 'Unknown error'
          });
        }
        
      } catch (error) {
        schedulingResults.failed++;
        const errorMsg = error.response?.data?.error || error.message;
        console.log(`   ❌ FAILED: ${job.job_number} - ${errorMsg}`);
        
        // Categorize the error
        if (errorMsg.includes('NULL MACHINE ASSIGNMENT')) {
          schedulingResults.null_machine_failures++;
        } else {
          schedulingResults.other_failures++;
        }
        
        schedulingResults.error_details.push({
          job: job.job_number,
          error: errorMsg
        });
      }
      
      // Small delay to prevent overwhelming the system
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // Step 6: Analyze results and provide insights
    console.log('\n📈 Step 6: Individual scheduling results analysis...');
    console.log(`   Total attempted: ${schedulingResults.total_attempted}`);
    console.log(`   Successful: ${schedulingResults.successful}`);
    console.log(`   Failed: ${schedulingResults.failed}`);
    console.log(`   NULL machine failures: ${schedulingResults.null_machine_failures}`);
    console.log(`   INSPECT queue additions: ${schedulingResults.inspect_queue_additions}`);
    console.log(`   Other failures: ${schedulingResults.other_failures}`);
    
    if (schedulingResults.error_details.length > 0) {
      console.log('\n   📋 Error breakdown:');
      const errorCounts = {};
      schedulingResults.error_details.forEach(detail => {
        const key = detail.error.substring(0, 100); // First 100 chars for grouping
        errorCounts[key] = (errorCounts[key] || 0) + 1;
      });
      
      Object.entries(errorCounts).forEach(([error, count]) => {
        console.log(`     ${count}x: ${error}${error.length > 100 ? '...' : ''}`);
      });
    }
    
    // Step 7: Check inspection queue
    console.log('\n🔍 Step 7: Checking inspection queue status...');
    try {
      const queueResponse = await axios.get(`${baseURL}/api/inspection/queue`);
      console.log(`   Inspection queue items: ${queueResponse.data.count}`);
      
      if (queueResponse.data.count > 0) {
        console.log(`   Recent additions:`);
        queueResponse.data.queue.slice(0, 3).forEach(item => {
          console.log(`     ${item.job_number} Op ${item.operation_number}: ${item.operation_name}`);
        });
      }
    } catch (error) {
      console.log(`   ⚠️ Could not check inspection queue: ${error.message}`);
    }
    
    // Step 8: Questions and recommendations
    console.log('\n❓ Step 8: Analysis and Questions...');
    
    if (schedulingResults.null_machine_failures > 0) {
      console.log('\n   🚨 NULL MACHINE ASSIGNMENT ISSUE DETECTED:');
      console.log(`   - ${schedulingResults.null_machine_failures} jobs failed due to NULL machine assignments`);
      console.log('   - This appears to be a CSV import issue where machine_id and machine_group_id are both NULL');
      console.log('   - QUESTION: Should we fix the CSV import to properly assign machines, or');
      console.log('   - QUESTION: Should we implement a fallback mechanism to auto-assign machine groups?');
    }
    
    if (schedulingResults.successful > 0) {
      console.log('\n   ✅ SCHEDULING SUCCESS DETECTED:');
      console.log(`   - ${schedulingResults.successful} jobs scheduled successfully`);
      console.log(`   - ${schedulingResults.inspect_queue_additions} INSPECT operations added to queue`);
      console.log('   - INSPECT operations are now working as 0-duration queue items ✅');
    }
    
    if (schedulingResults.other_failures > 0) {
      console.log('\n   ⚠️ OTHER SCHEDULING ISSUES:');
      console.log(`   - ${schedulingResults.other_failures} jobs failed for other reasons`);
      console.log('   - Review error details above for patterns');
    }
    
    // Step 9: Recommendations for next steps
    console.log('\n🎯 Step 9: Recommendations for Schedule All...');
    
    const successRate = (schedulingResults.successful / schedulingResults.total_attempted) * 100;
    console.log(`   Current success rate: ${successRate.toFixed(1)}%`);
    
    if (successRate >= 80) {
      console.log('   ✅ READY: High success rate, schedule all should work well');
      console.log('   - Proceed with schedule all jobs');
      console.log('   - NULL machine jobs will fail (expected)');
    } else if (successRate >= 50) {
      console.log('   ⚠️ PARTIAL: Moderate success rate, issues need addressing');
      console.log('   - Consider fixing NULL machine assignments first');
      console.log('   - Or proceed with schedule all accepting some failures');
    } else {
      console.log('   🚨 ISSUES: Low success rate, major problems detected');
      console.log('   - Do NOT proceed with schedule all yet');
      console.log('   - Fix identified issues first');
    }
    
    console.log('\n📊 COMPREHENSIVE SCHEDULE ALL TEST COMPLETED!');
    
    return {
      success_rate: successRate,
      results: schedulingResults,
      recommendation: successRate >= 80 ? 'PROCEED' : successRate >= 50 ? 'PARTIAL' : 'FIX_ISSUES'
    };
    
  } catch (error) {
    console.error('❌ Comprehensive test failed:', error.message);
    throw error;
  } finally {
    await pool.end();
  }
}

// Run the comprehensive test
testScheduleAllComprehensive()
  .then(result => {
    console.log(`\n🎯 FINAL RECOMMENDATION: ${result.recommendation}`);
    if (result.recommendation === 'PROCEED') {
      console.log('✅ System ready for schedule all jobs!');
    }
  })
  .catch(error => {
    console.error('Test failed:', error);
    process.exit(1);
  });