const axios = require('axios');

async function testUnscheduleAll() {
  const baseURL = 'http://localhost:5000';
  
  try {
    console.log('🔧 Testing Unschedule All Endpoint\n');
    
    // First check how many slots exist
    console.log('1. Checking current schedule slots...');
    const slotsResponse = await axios.get(`${baseURL}/api/scheduling/slots`);
    const currentSlots = slotsResponse.data.length;
    console.log(`Current schedule slots: ${currentSlots}`);
    
    if (currentSlots === 0) {
      console.log('No slots to unschedule. Test complete.');
      return;
    }
    
    // Test unschedule all
    console.log('\n2. Testing unschedule all...');
    const unscheduleResponse = await axios.delete(`${baseURL}/api/scheduling/unschedule-all`);
    
    console.log('Response:', unscheduleResponse.data);
    
    // Verify slots are removed
    console.log('\n3. Verifying slots are removed...');
    const verifyResponse = await axios.get(`${baseURL}/api/scheduling/slots`);
    const remainingSlots = verifyResponse.data.length;
    
    console.log(`Remaining schedule slots: ${remainingSlots}`);
    
    if (remainingSlots === 0) {
      console.log('✅ Unschedule all test PASSED - all slots removed');
    } else {
      console.log('❌ Unschedule all test FAILED - some slots remain');
    }
    
  } catch (error) {
    console.error('❌ Error testing unschedule all:', error.response?.data || error.message);
  }
}

testUnscheduleAll();