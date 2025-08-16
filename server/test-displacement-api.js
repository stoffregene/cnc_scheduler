const axios = require('axios');

const API_BASE = 'http://localhost:5000/api';

async function testDisplacementAPI() {
  try {
    console.log('🌐 Testing Displacement Engine API Endpoints...\n');
    
    // Step 1: Get some jobs to work with
    console.log('📋 Step 1: Getting jobs for testing...');
    const jobsResponse = await axios.get(`${API_BASE}/jobs`);
    const jobs = jobsResponse.data.slice(0, 5); // Get first 5 jobs
    
    if (jobs.length < 2) {
      console.log('❌ Need at least 2 jobs to test displacement API');
      return;
    }
    
    const highPriorityJob = jobs.find(j => j.priority_score > 200) || jobs[0];
    const testJobId = highPriorityJob.id;
    
    console.log(`   Selected test job: ${highPriorityJob.job_number} (Score: ${highPriorityJob.priority_score})`);
    
    // Step 2: Test displacement opportunities endpoint
    console.log('\n🔍 Step 2: Testing displacement opportunities endpoint...');
    
    try {
      const opportunitiesResponse = await axios.get(`${API_BASE}/displacement/opportunities/${testJobId}`, {
        params: {
          startDate: new Date().toISOString(),
          requiredHours: 8
        }
      });
      
      const opportunities = opportunitiesResponse.data.opportunities;
      console.log(`   ✅ GET /displacement/opportunities/${testJobId}`);
      console.log(`   Found ${opportunities.opportunities.length} displacement opportunities`);
      console.log(`   Sufficient capacity: ${opportunities.sufficient ? 'YES' : 'NO'}`);
      console.log(`   Total hours available: ${opportunities.totalHoursAvailable.toFixed(2)}h`);
      
    } catch (error) {
      console.log(`   ❌ Error: ${error.response?.data?.error || error.message}`);
    }
    
    // Step 3: Test displacement impact endpoint
    console.log('\n📊 Step 3: Testing displacement impact endpoint...');
    
    try {
      const impactResponse = await axios.get(`${API_BASE}/displacement/impact/${testJobId}`);
      const impact = impactResponse.data.impact;
      
      console.log(`   ✅ GET /displacement/impact/${testJobId}`);
      console.log(`   Can displace: ${impact.canDisplace ? 'YES' : 'NO'}`);
      console.log(`   Jobs affected: ${impact.jobsAffected}`);
      console.log(`   Total hours freed: ${impact.totalHoursFreed.toFixed(2)}h`);
      console.log(`   Estimated delay: ${impact.estimatedDelay} days`);
      
    } catch (error) {
      console.log(`   ❌ Error: ${error.response?.data?.error || error.message}`);
    }
    
    // Step 4: Test schedule with displacement endpoint
    console.log('\n🎯 Step 4: Testing schedule with displacement endpoint...');
    
    try {
      const scheduleResponse = await axios.post(`${API_BASE}/displacement/schedule/${testJobId}`, {
        test: true // Add test flag
      });
      
      const result = scheduleResponse.data;
      console.log(`   ✅ POST /displacement/schedule/${testJobId}`);
      console.log(`   Success: ${result.success ? 'YES' : 'NO'}`);
      console.log(`   Scheduled normally: ${result.scheduledNormally || false}`);
      console.log(`   Displacement used: ${result.displacementUsed || false}`);
      console.log(`   Message: ${result.message}`);
      
    } catch (error) {
      console.log(`   ❌ Error: ${error.response?.data?.error || error.message}`);
    }
    
    // Step 5: Test displacement history endpoint
    console.log('\n📚 Step 5: Testing displacement history endpoint...');
    
    try {
      const historyResponse = await axios.get(`${API_BASE}/displacement/history`, {
        params: {
          limit: 10,
          successOnly: false
        }
      });
      
      const history = historyResponse.data.history;
      console.log(`   ✅ GET /displacement/history`);
      console.log(`   Historical displacements: ${history.length}`);
      
      if (history.length > 0) {
        console.log('   Recent entries:');
        history.slice(0, 3).forEach((entry, index) => {
          console.log(`     ${index + 1}. Job ${entry.trigger_job_number} - ${entry.timestamp}`);
          console.log(`        Success: ${entry.success}, Displaced: ${entry.total_displaced}`);
        });
      }
      
    } catch (error) {
      console.log(`   ❌ Error: ${error.response?.data?.error || error.message}`);
    }
    
    // Step 6: Test displacement analytics endpoint
    console.log('\n📈 Step 6: Testing displacement analytics endpoint...');
    
    try {
      const analyticsResponse = await axios.get(`${API_BASE}/displacement/analytics`);
      const analytics = analyticsResponse.data.analytics;
      
      console.log(`   ✅ GET /displacement/analytics`);
      console.log(`   Total displacements: ${analytics.summary.total_displacements || 0}`);
      console.log(`   Success rate: ${analytics.summary.successful_displacements || 0}/${analytics.summary.total_displacements || 0}`);
      console.log(`   Average execution time: ${parseFloat(analytics.summary.avg_execution_time || 0).toFixed(0)}ms`);
      
    } catch (error) {
      console.log(`   ❌ Error: ${error.response?.data?.error || error.message}`);
    }
    
    // Step 7: Test displacement details endpoint (if we have logs)
    console.log('\n📋 Step 7: Testing displacement details endpoint...');
    
    try {
      // First get a log ID from history
      const historyResponse = await axios.get(`${API_BASE}/displacement/history`, { params: { limit: 1 } });
      
      if (historyResponse.data.history.length > 0) {
        const logId = historyResponse.data.history[0].id;
        
        const detailsResponse = await axios.get(`${API_BASE}/displacement/details/${logId}`);
        const details = detailsResponse.data.details;
        
        console.log(`   ✅ GET /displacement/details/${logId}`);
        console.log(`   Detail records: ${details.length}`);
        
        if (details.length > 0) {
          console.log('   Sample details:');
          details.slice(0, 2).forEach((detail, index) => {
            console.log(`     ${index + 1}. ${detail.displaced_job_number} - ${detail.reschedule_status}`);
            console.log(`        Hours freed: ${detail.hours_freed}, Delay: ${detail.reschedule_delay_hours || 0}h`);
          });
        }
      } else {
        console.log(`   ℹ️ No displacement history available for details test`);
      }
      
    } catch (error) {
      console.log(`   ❌ Error: ${error.response?.data?.error || error.message}`);
    }
    
    // Step 8: Test manual displacement execution endpoint
    console.log('\n⚡ Step 8: Testing manual displacement execution endpoint...');
    
    try {
      // Create a sample displacement request
      const manualDisplacementData = {
        triggerJobId: testJobId,
        displacements: [
          // This would normally come from findDisplacementOpportunities
          // For testing, we'll use a simplified structure
        ],
        options: {
          test: true,
          reason: 'API test execution'
        }
      };
      
      const executeResponse = await axios.post(`${API_BASE}/displacement/execute`, manualDisplacementData);
      
      console.log(`   ✅ POST /displacement/execute`);
      console.log(`   Success: ${executeResponse.data.success ? 'YES' : 'NO'}`);
      
    } catch (error) {
      console.log(`   ❌ Error: ${error.response?.data?.error || error.message}`);
      // This is expected to fail without proper displacement data
      if (error.response?.status === 400) {
        console.log(`   ℹ️ Expected error - no valid displacements provided for test`);
      }
    }
    
    console.log('\n🎉 Displacement API testing completed!');
    
    // Summary of API endpoints tested
    console.log('\n📋 API Endpoints Tested:');
    console.log('   ✅ GET /api/displacement/opportunities/:jobId');
    console.log('   ✅ GET /api/displacement/impact/:jobId');
    console.log('   ✅ POST /api/displacement/schedule/:jobId');
    console.log('   ✅ GET /api/displacement/history');
    console.log('   ✅ GET /api/displacement/analytics');
    console.log('   ✅ GET /api/displacement/details/:logId');
    console.log('   ✅ POST /api/displacement/execute');
    
    console.log('\n💡 To see displacement in action:');
    console.log('   1. Schedule some lower priority jobs first');
    console.log('   2. Try to schedule a higher priority job');
    console.log('   3. The system will automatically use displacement if needed');
    
  } catch (error) {
    console.error('❌ API test failed:', error.message);
    if (error.response) {
      console.error(`   Status: ${error.response.status}`);
      console.error(`   Error: ${error.response.data.error || error.response.data.message}`);
    }
  }
}

// Run the API tests
testDisplacementAPI();