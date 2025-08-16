const axios = require('axios');

async function testDeleteAllJobs() {
  try {
    console.log('🗑️ Testing delete all jobs functionality...\n');
    
    // First check current job count
    console.log('📊 Checking current job count...');
    const jobsResponse = await axios.get('http://localhost:5000/api/jobs');
    console.log(`Current jobs: ${jobsResponse.data.length}`);
    
    if (jobsResponse.data.length > 0) {
      console.log('\n🔄 Deleting all jobs via API...');
      
      const deleteResponse = await axios.delete('http://localhost:5000/api/jobs/delete-all');
      
      console.log('✅ Delete response:', deleteResponse.data);
      
      // Verify deletion
      console.log('\n🔍 Verifying deletion...');
      const verifyResponse = await axios.get('http://localhost:5000/api/jobs');
      console.log(`Jobs remaining: ${verifyResponse.data.length}`);
      
      if (verifyResponse.data.length === 0) {
        console.log('✅ All jobs successfully deleted!');
      } else {
        console.log('⚠️ Some jobs still remain');
      }
    } else {
      console.log('ℹ️ No jobs to delete');
    }
    
  } catch (error) {
    console.error('❌ Delete test failed:');
    if (error.response) {
      console.error(`   Status: ${error.response.status}`);
      console.error(`   Error: ${error.response.data.error || error.response.data.message}`);
    } else {
      console.error(error.message);
    }
  }
}

// Run the test
testDeleteAllJobs();