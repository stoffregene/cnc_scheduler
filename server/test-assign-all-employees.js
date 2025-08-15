const axios = require('axios');

async function testAssignAllEmployees() {
  const baseURL = 'http://localhost:5000';
  
  try {
    console.log('🔧 Testing "Assign All Employees" Feature\n');
    
    // 1. Get current employees count
    console.log('1. Checking active employees...');
    const employeesResponse = await axios.get(`${baseURL}/api/employees`);
    const activeEmployees = employeesResponse.data.filter(emp => emp.status === 'active');
    console.log(`Found ${activeEmployees.length} active employees`);
    
    if (activeEmployees.length === 0) {
      console.log('No active employees found. Cannot test assignment feature.');
      return;
    }
    
    // 2. Create a test machine
    console.log('\n2. Creating test machine...');
    const testMachine = {
      name: 'TEST-ASSIGN-ALL',
      model: 'Test Machine for Assignment',
      status: 'active',
      capabilities: ['Testing'],
      efficiency_modifier: 1.00
    };
    
    const machineResponse = await axios.post(`${baseURL}/api/machines`, testMachine);
    const machineId = machineResponse.data.id;
    console.log(`Created test machine with ID: ${machineId}`);
    
    // 3. Assign all employees to this machine
    console.log('\n3. Assigning all employees to machine...');
    let successCount = 0;
    let skipCount = 0;
    
    for (const employee of activeEmployees) {
      try {
        await axios.post(`${baseURL}/api/machines/operators`, {
          employee_id: employee.id,
          machine_id: machineId,
          proficiency_level: 'trained',
          preference_rank: 5,
          notes: 'Test assignment via "All Employees" option'
        });
        successCount++;
        console.log(`✅ Assigned ${employee.first_name} ${employee.last_name}`);
      } catch (error) {
        if (error.response && error.response.status === 400) {
          skipCount++;
          console.log(`⚠️  ${employee.first_name} ${employee.last_name} already assigned`);
        } else {
          console.error(`❌ Failed to assign ${employee.first_name} ${employee.last_name}:`, error.response?.data || error.message);
        }
      }
    }
    
    // 4. Verify assignments
    console.log('\n4. Verifying assignments...');
    const operatorsResponse = await axios.get(`${baseURL}/api/machines/operators/${machineId}`);
    const assignedOperators = operatorsResponse.data;
    
    console.log(`Machine now has ${assignedOperators.length} assigned operators:`);
    assignedOperators.forEach(op => {
      console.log(`  • ${op.first_name} ${op.last_name} (${op.proficiency_level})`);
    });
    
    // 5. Clean up - delete test machine
    console.log('\n5. Cleaning up test machine...');
    await axios.delete(`${baseURL}/api/machines/${machineId}`);
    console.log('✅ Test machine deleted');
    
    console.log('\n📊 Test Results:');
    console.log('='.repeat(80));
    console.log(`✅ Successfully assigned ${successCount} employees`);
    console.log(`⚠️  Skipped ${skipCount} already assigned employees`);
    console.log(`📋 Total operators verified: ${assignedOperators.length}`);
    
    if (successCount === activeEmployees.length) {
      console.log('🎉 "Assign All Employees" feature test PASSED!');
    } else {
      console.log('❌ Some assignments failed - check logs above');
    }
    
  } catch (error) {
    console.error('❌ Error testing assign all employees:', error.response?.data || error.message);
  }
}

testAssignAllEmployees();