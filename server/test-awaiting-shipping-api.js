const http = require('http');

console.log('Testing awaiting shipping endpoint with real data...');

const options = {
  hostname: 'localhost',
  port: 5000,
  path: '/api/jobs/awaiting-shipping',
  method: 'GET'
};

const req = http.request(options, (res) => {
  let data = '';
  
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    try {
      const response = JSON.parse(data);
      console.log('✅ API Response:');
      console.log('Jobs found:', response.jobs.length);
      
      if (response.jobs.length > 0) {
        console.log('\nAwaiting Shipping Jobs:');
        response.jobs.forEach(job => {
          console.log(`- Job ${job.job_number}: ${job.customer_name} - ${job.part_name}`);
          console.log(`  Quantity: ${job.quantity}, Due: ${job.due_date}`);
          console.log(`  Operations: ${job.total_operations} total, ${job.completed_operations} completed`);
          console.log('');
        });
      } else {
        console.log('❌ No jobs found in awaiting shipping');
      }
      
      console.log('Totals Summary:');
      console.log(`- Total jobs: ${response.totals.total_jobs}`);
      console.log(`- Overdue: ${response.totals.overdue}`);
      console.log(`- Due today: ${response.totals.due_today}`);
      console.log(`- Urgent: ${response.totals.urgent}`);
      console.log(`- Soon: ${response.totals.soon}`);
      console.log(`- On schedule: ${response.totals.on_schedule}`);
      console.log(`- No date: ${response.totals.no_date}`);
      
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