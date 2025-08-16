const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5732/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function fixInspectOperators() {
  try {
    console.log('🔧 Fixing INSPECT Machine Operator Assignments...\n');
    
    // Step 1: Get INSPECT machine ID
    const inspectMachineResult = await pool.query(`
      SELECT id, name FROM machines WHERE name LIKE '%INSPECT%'
    `);
    
    if (inspectMachineResult.rows.length === 0) {
      console.log('❌ No INSPECT machines found');
      return;
    }
    
    const inspectMachine = inspectMachineResult.rows[0];
    console.log(`📋 Found INSPECT machine: ${inspectMachine.name} (ID: ${inspectMachine.id})`);
    
    // Step 2: Get available employees
    const employeesResult = await pool.query(`
      SELECT id, first_name, last_name 
      FROM employees 
      ORDER BY last_name
      LIMIT 10
    `);
    
    console.log(`👥 Found ${employeesResult.rows.length} employees available for assignment:`);
    employeesResult.rows.forEach((emp, idx) => {
      console.log(`   ${idx + 1}. ${emp.first_name} ${emp.last_name} (ID: ${emp.id})`);
    });
    
    // Step 3: Check current assignments
    const currentAssignmentsResult = await pool.query(`
      SELECT employee_id 
      FROM operator_machine_assignments 
      WHERE machine_id = $1
    `, [inspectMachine.id]);
    
    console.log(`\n🔍 Current INSPECT operator assignments: ${currentAssignmentsResult.rows.length}`);
    
    // Step 4: Assign operators to INSPECT machine
    // Let's assign the first 3 employees to INSPECT operations
    const employeesToAssign = employeesResult.rows.slice(0, 3);
    
    console.log('\n✅ Assigning operators to INSPECT machine...');
    
    for (const employee of employeesToAssign) {
      // Check if already assigned
      const existingAssignment = await pool.query(`
        SELECT id FROM operator_machine_assignments 
        WHERE machine_id = $1 AND employee_id = $2
      `, [inspectMachine.id, employee.id]);
      
      if (existingAssignment.rows.length === 0) {
        // Assign the operator
        await pool.query(`
          INSERT INTO operator_machine_assignments (machine_id, employee_id, created_at)
          VALUES ($1, $2, NOW())
        `, [inspectMachine.id, employee.id]);
        
        console.log(`   ✅ Assigned ${employee.first_name} ${employee.last_name} to ${inspectMachine.name}`);
      } else {
        console.log(`   ℹ️ ${employee.first_name} ${employee.last_name} already assigned to ${inspectMachine.name}`);
      }
    }
    
    // Step 5: Verify assignments
    const finalAssignmentsResult = await pool.query(`
      SELECT e.first_name, e.last_name, e.id
      FROM operator_machine_assignments oma
      JOIN employees e ON oma.employee_id = e.id
      WHERE oma.machine_id = $1
      ORDER BY e.last_name
    `, [inspectMachine.id]);
    
    console.log(`\n🎯 Final INSPECT operator assignments (${finalAssignmentsResult.rows.length}):`);
    finalAssignmentsResult.rows.forEach((emp, idx) => {
      console.log(`   ${idx + 1}. ${emp.first_name} ${emp.last_name} (ID: ${emp.id})`);
    });
    
    console.log('\n🎉 INSPECT machine operator assignments completed!');
    console.log('✅ INSPECT operations should now be able to schedule properly.');
    
  } catch (error) {
    console.error('❌ Fix failed:', error.message);
  } finally {
    await pool.end();
  }
}

fixInspectOperators();