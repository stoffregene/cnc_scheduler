const http = require('http');

console.log('Testing Job Management API to verify completed jobs are excluded...');

const options = {
  hostname: 'localhost',
  port: 5000,
  path: '/api/jobs',
  method: 'GET'
};

const req = http.request(options, (res) => {
  let data = '';
  
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    try {
      const jobs = JSON.parse(data);
      console.log(`✅ Job Management API Response: ${jobs.length} jobs found`);
      
      // Check if any of the completed jobs are still appearing
      const completedJobNumbers = [
        'S60062', '58917', '60079', '58804', '58918', '58929', '58990',
        '59258', '60010', '60049', '60081-1', '60084', '60140', 
        '60161', '60172', '60214', 'S59371', 'S59955', '59892-4'
      ];
      
      const foundCompleted = [];
      jobs.forEach(job => {
        if (completedJobNumbers.includes(job.job_number)) {
          foundCompleted.push(job.job_number);
        }
      });
      
      if (foundCompleted.length > 0) {
        console.log(`❌ PROBLEM: Found ${foundCompleted.length} completed jobs that should be excluded:`);
        foundCompleted.forEach(jobNum => console.log(`  - ${jobNum}`));
      } else {
        console.log('✅ SUCCESS: No completed jobs found in Job Management list');
      }
      
      // Show a sample of what jobs are being returned
      console.log('\nSample jobs returned (first 5):');
      jobs.slice(0, 5).forEach(job => {
        console.log(`  ${job.job_number}: ${job.customer_name} - ${job.part_name} (${job.status})`);
      });
      
    } catch (error) {
      console.error('❌ Error parsing response:', error.message);
    }
  });
});

req.on('error', (err) => {
  console.log('❌ Error:', err.message);
});

req.end();