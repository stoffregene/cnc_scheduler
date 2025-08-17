// Simple test to call the API endpoint directly and see the sequence ordering
const fetch = require('node-fetch');

async function testJobRoutings() {
  try {
    console.log('Testing job 583 (job number 57710) routing order...');
    
    // We need a valid token, let's try without auth first
    const response = await fetch('http://localhost:5000/api/jobs/583/routings?debug=true', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      console.log('Auth required, response status:', response.status);
      const text = await response.text();
      console.log('Response:', text);
      return;
    }
    
    const data = await response.json();
    console.log('\n=== API Response Data ===');
    console.log('Number of operations:', data.length);
    
    data.forEach((routing, index) => {
      console.log(`${index + 1}. Op ${routing.operation_number}: ${routing.operation_name} | Sequence: ${routing.sequence_order} (${typeof routing.sequence_order})`);
    });
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testJobRoutings();