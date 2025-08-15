const axios = require('axios');

async function testAutoSchedulerAvailability() {
  const baseURL = 'http://localhost:5000';
  
  try {
    console.log('🔧 Testing Auto-Scheduler Availability After Fix\n');
    
    // 1. Check available jobs for scheduling
    console.log('1. Testing auto-scheduler endpoint...');
    
    try {
      const response = await axios.post(`${baseURL}/api/scheduling/auto-schedule`);
      const results = response.data;
      
      console.log('Auto-Schedule Results:');
      console.log(`  Total Jobs Processed: ${results.total_jobs}`);
      console.log(`  Successfully Scheduled: ${results.successful}`);
      console.log(`  Failed to Schedule: ${results.failed}`);
      
      if (results.details && results.details.length > 0) {
        console.log('\nFirst few results:');
        results.details.slice(0, 5).forEach(detail => {
          const status = detail.success ? '✅' : '❌';
          console.log(`  ${status} Job ${detail.job_id}: ${detail.message}`);
        });
        
        if (results.details.length > 5) {
          console.log(`  ... and ${results.details.length - 5} more jobs`);
        }
      }
      
      // 2. Check schedule slots after auto-scheduling
      console.log('\n2. Checking schedule slots created...');
      const slotsResponse = await axios.get(`${baseURL}/api/scheduling/slots`);
      const slots = slotsResponse.data;
      
      console.log(`Schedule slots created: ${slots.length}`);
      
      if (slots.length > 0) {
        console.log('Sample schedule slots:');
        slots.slice(0, 3).forEach(slot => {
          console.log(`  ${slot.job_number} on ${slot.machine_name} (${slot.slot_date})`);
        });
      }
      
    } catch (error) {
      if (error.response) {
        console.log(`❌ Auto-scheduler error: ${error.response.status} - ${error.response.data.error || error.response.data}`);
      } else {
        console.log(`❌ Auto-scheduler error: ${error.message}`);
      }
    }
    
  } catch (error) {
    console.error('❌ Error testing auto-scheduler:', error.message);
  }
}

testAutoSchedulerAvailability();