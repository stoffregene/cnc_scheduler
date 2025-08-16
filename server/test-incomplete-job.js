const http = require('http');

console.log('Testing incomplete job routing status...');

const options = {
  hostname: 'localhost',
  port: 5000,
  path: '/api/jobs/592/routings', // Incomplete test job
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
      console.log('✅ Job 592 (TEST-SHIP-INCOMPLETE) routing status:');
      
      if (routings.length > 0) {
        routings.forEach((routing) => {
          console.log(`${routing.operation_name}: Status = "${routing.routing_status || 'NULL'}" ${routing.routing_status === 'C' ? '(COMPLETED)' : '(NOT COMPLETED)'}`);
        });
        
        const completedOps = routings.filter(r => r.routing_status === 'C').length;
        console.log(`\nSummary: ${completedOps}/${routings.length} operations completed`);
        
        if (completedOps === routings.length) {
          console.log('✅ ALL OPERATIONS COMPLETED - Should appear in awaiting shipping');
        } else {
          console.log('❌ Not all operations completed - Should NOT appear in awaiting shipping');
        }
      }
      
    } catch (error) {
      console.error('❌ Error:', error.message);
    }
  });
});

req.on('error', (err) => {
  console.log('❌ Error:', err.message);
});

req.end();