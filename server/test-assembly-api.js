const axios = require('axios');

async function testAssemblyAPI() {
  const baseURL = 'http://localhost:5000';
  
  try {
    console.log('🔧 Testing Assembly API Endpoints\n');
    
    // Test assembly jobs view
    console.log('1. Testing /api/jobs/assemblies endpoint...');
    console.log('='.repeat(80));
    
    try {
      const assembliesResponse = await axios.get(`${baseURL}/api/jobs/assemblies`);
      const assemblies = assembliesResponse.data;
      
      console.log(`Found ${assemblies.length} assembly jobs:`);
      assemblies.forEach(assembly => {
        console.log(`  ${assembly.assembly_job_number}: ${assembly.completion_percentage}% complete`);
        console.log(`    Components: ${assembly.total_components}, Ready: ${assembly.ready_for_assembly}`);
      });
    } catch (error) {
      console.log(`❌ Error: ${error.response?.status} - ${error.response?.data?.error || error.message}`);
    }
    
    // Test dependency check for parent job (ID 1 from our test)
    console.log('\n2. Testing /api/jobs/:id/dependencies endpoint...');
    console.log('='.repeat(80));
    
    try {
      const dependenciesResponse = await axios.get(`${baseURL}/api/jobs/1/dependencies`);
      const dependencies = dependenciesResponse.data;
      
      console.log(`Job Dependencies for ${dependencies.job.job_number}:`);
      console.log(`  Job Type: ${dependencies.job.job_type}`);
      console.log(`  Can Schedule: ${dependencies.can_schedule}`);
      console.log(`  Blocking Jobs: ${dependencies.blocking_jobs.join(', ') || 'None'}`);
      console.log(`  Dependency Tree:`);
      
      dependencies.dependency_tree.forEach(node => {
        const indent = '    ' + '  '.repeat(node.dependency_level);
        console.log(`${indent}${node.job_number} (${node.job_type}) - ${node.status}`);
      });
    } catch (error) {
      console.log(`❌ Error: ${error.response?.status} - ${error.response?.data?.error || error.message}`);
    }
    
    // Test dependency check for component job (ID 3 from our test)
    console.log('\n3. Testing component job dependencies...');
    console.log('='.repeat(80));
    
    try {
      const componentDepsResponse = await axios.get(`${baseURL}/api/jobs/3/dependencies`);
      const componentDeps = componentDepsResponse.data;
      
      console.log(`Component Dependencies for ${componentDeps.job.job_number}:`);
      console.log(`  Job Type: ${componentDeps.job.job_type}`);
      console.log(`  Parent Job ID: ${componentDeps.job.parent_job_id}`);
      console.log(`  Assembly Sequence: ${componentDeps.job.assembly_sequence}`);
      console.log(`  Can Schedule: ${componentDeps.can_schedule}`);
    } catch (error) {
      console.log(`❌ Error: ${error.response?.status} - ${error.response?.data?.error || error.message}`);
    }
    
    console.log('\n🎉 Assembly API test completed!');
    
  } catch (error) {
    console.error('❌ Error testing assembly API:', error.message);
  }
}

testAssemblyAPI();