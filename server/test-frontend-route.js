const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const axios = require('axios');

async function testFrontendRoute() {
  try {
    console.log('🧪 Testing frontend CSV import route...\n');
    
    const csvPath = path.join(__dirname, '..', 'AttachedAssets', 'data - data.csv.csv');
    
    // Create form data
    const form = new FormData();
    form.append('csvFile', fs.createReadStream(csvPath));
    
    console.log('📤 Sending CSV to /api/jobs/import...');
    
    const response = await axios.post('http://localhost:5000/api/jobs/import', form, {
      headers: {
        ...form.getHeaders()
      }
    });
    
    console.log('\n✅ Import successful!');
    console.log(`📊 Response: ${response.data.message}`);
    console.log(`   Manufacturing jobs: ${response.data.totalJobs}`);
    console.log(`   Pick orders: ${response.data.pickOrders}`);
    console.log(`   Routings: ${response.data.totalRoutings}`);
    console.log(`   Vendors: ${response.data.vendorsFound}`);
    
    if (response.data.pickOrderDetails && response.data.pickOrderDetails.length > 0) {
      console.log('\n📦 Pick Orders Identified:');
      response.data.pickOrderDetails.forEach((order, index) => {
        console.log(`   ${index + 1}. ${order.job_number} (${order.customer_name})`);
        console.log(`      Part: ${order.part_name}`);
        console.log(`      Pick Qty = Make Qty: ${order.pick_qty}`);
      });
    }
    
    console.log('\n🎉 Frontend route is working correctly!');
    
  } catch (error) {
    console.error('❌ Frontend route test failed:');
    if (error.response) {
      console.error(`   Status: ${error.response.status}`);
      console.error(`   Error: ${error.response.data.error}`);
      console.error(`   Details: ${error.response.data.details}`);
    } else {
      console.error(error.message);
    }
  }
}

// Run the test
testFrontendRoute();