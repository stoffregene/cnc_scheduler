const http = require('http');

console.log('Testing routing status display in job details...');

// Get the first test job and check its routing status
const options = {
  hostname: 'localhost',
  port: 5000,
  path: '/api/jobs/589/routings', // Using the first test job we created
  method: 'GET'
};

const req = http.request(options, (res) => {
  let data = '';
  
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    try {
      const routings = JSON.parse(data);
      console.log('✅ Routing status test results:');
      console.log(`Found ${routings.length} operations for job 589 (TEST-SHIP-SIMPLE)`);
      
      if (routings.length > 0) {
        console.log('\nOperation Details with Status:');
        routings.forEach((routing, index) => {
          console.log(`${index + 1}. Op ${routing.operation_number} - ${routing.operation_name}`);
          console.log(`   Status: "${routing.routing_status}" ${routing.routing_status === 'C' ? '(COMPLETED)' : '(NOT COMPLETED)'}`);
          console.log(`   Estimated Hours: ${routing.estimated_hours}`);
          console.log(`   Machine: ${routing.machine_name || 'Not assigned'}`);
          console.log('');
        });
        
        const completedOps = routings.filter(r => r.routing_status === 'C').length;
        console.log(`Summary: ${completedOps}/${routings.length} operations completed`);
        
        if (completedOps === routings.length) {
          console.log('✅ ALL OPERATIONS COMPLETED - Should appear in awaiting shipping');
        } else {
          console.log('❌ Not all operations completed - Should NOT appear in awaiting shipping');
        }
        
      } else {
        console.log('❌ No routings found for test job');
      }
      
    } catch (error) {
      console.error('❌ Error parsing response:', error.message);
      console.log('Raw response:', data);
    }
  });
});

req.on('error', (err) => {
  console.log('❌ Server not running or error:', err.message);
});

req.end();