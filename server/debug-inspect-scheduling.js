const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5732/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function debugInspectScheduling() {
  try {
    console.log('🔍 Debugging INSPECT Operation Scheduling Issues...\n');
    
    // Step 1: Check INSPECT machines
    console.log('📋 Step 1: INSPECT Machine Analysis');
    const machinesResult = await pool.query(`
      SELECT id, name, status, efficiency_modifier 
      FROM machines 
      WHERE name LIKE '%INSPECT%'
    `);
    
    console.log(`   Found ${machinesResult.rows.length} INSPECT machines:`);
    machinesResult.rows.forEach(machine => {
      console.log(`     ${machine.id}: ${machine.name} (Status: ${machine.status})`);
    });
    
    // Step 2: Check operator assignments for INSPECT machines
    console.log('\n👥 Step 2: INSPECT Operator Assignments');
    const operatorResult = await pool.query(`
      SELECT m.name as machine_name, e.id as employee_id, 
             e.first_name, e.last_name
      FROM machines m
      LEFT JOIN operator_machine_assignments oma ON m.id = oma.machine_id
      LEFT JOIN employees e ON oma.employee_id = e.id
      WHERE m.name LIKE '%INSPECT%'
      ORDER BY m.name, e.last_name
    `);
    
    if (operatorResult.rows.length === 0) {
      console.log('   ❌ NO OPERATORS ASSIGNED TO INSPECT MACHINES!');
      console.log('   This is likely why INSPECT operations fail to schedule.');
    } else {
      console.log(`   Found ${operatorResult.rows.length} operator assignments:`);
      operatorResult.rows.forEach(row => {
        console.log(`     ${row.machine_name}: ${row.first_name} ${row.last_name}`);
      });
    }
    
    // Step 3: Check INSPECT operations that need scheduling
    console.log('\n🔧 Step 3: INSPECT Operations Needing Scheduling');
    const inspectJobsResult = await pool.query(`
      SELECT j.job_number, j.customer_name, j.priority_score, j.status,
             jr.operation_number, jr.operation_name, jr.estimated_hours
      FROM jobs j
      JOIN job_routings jr ON j.id = jr.job_id
      WHERE jr.operation_name LIKE '%INSPECT%' 
        AND j.status = 'pending'
      ORDER BY j.priority_score::numeric DESC
      LIMIT 10
    `);
    
    console.log(`   Found ${inspectJobsResult.rows.length} pending INSPECT operations:`);
    inspectJobsResult.rows.forEach((row, idx) => {
      console.log(`     ${idx + 1}. ${row.job_number} Op ${row.operation_number}: ${row.operation_name}`);
      console.log(`        Customer: ${row.customer_name}, Priority: ${row.priority_score}, Hours: ${row.estimated_hours}`);
    });
    
    // Step 4: Check current INSPECT schedule
    console.log('\n📅 Step 4: Current INSPECT Schedule');
    const currentScheduleResult = await pool.query(`
      SELECT ss.start_datetime, ss.end_datetime, ss.duration_minutes,
             j.job_number, jr.operation_name, m.name as machine_name,
             e.first_name || ' ' || e.last_name as operator_name
      FROM schedule_slots ss
      JOIN job_routings jr ON ss.job_routing_id = jr.id
      JOIN jobs j ON jr.job_id = j.id
      JOIN machines m ON ss.machine_id = m.id
      LEFT JOIN employees e ON ss.employee_id = e.id
      WHERE m.name LIKE '%INSPECT%'
        AND ss.start_datetime >= CURRENT_DATE
      ORDER BY ss.start_datetime
      LIMIT 10
    `);
    
    if (currentScheduleResult.rows.length === 0) {
      console.log('   📝 No current INSPECT operations scheduled');
    } else {
      console.log(`   Found ${currentScheduleResult.rows.length} scheduled INSPECT operations:`);
      currentScheduleResult.rows.forEach((row, idx) => {
        console.log(`     ${idx + 1}. ${row.job_number}: ${row.operation_name}`);
        console.log(`        ${new Date(row.start_datetime).toLocaleString()} - ${new Date(row.end_datetime).toLocaleString()}`);
        console.log(`        Machine: ${row.machine_name}, Operator: ${row.operator_name || 'Unassigned'}`);
      });
    }
    
    // Step 5: Check employee work schedules for potential INSPECT operators
    console.log('\n⏰ Step 5: Potential INSPECT Operators (All employees)');
    const allEmployeesResult = await pool.query(`
      SELECT e.id, e.first_name, e.last_name, e.is_active,
             COUNT(oma.machine_id) as machine_assignments
      FROM employees e
      LEFT JOIN operator_machine_assignments oma ON e.id = oma.employee_id
      WHERE e.is_active = true
      GROUP BY e.id, e.first_name, e.last_name, e.is_active
      ORDER BY machine_assignments DESC, e.last_name
      LIMIT 10
    `);
    
    console.log(`   Found ${allEmployeesResult.rows.length} active employees:`);
    allEmployeesResult.rows.forEach((row, idx) => {
      console.log(`     ${idx + 1}. ${row.first_name} ${row.last_name} (ID: ${row.id}) - ${row.machine_assignments} machine assignments`);
    });
    
    // Step 6: Recommendations
    console.log('\n💡 Recommendations:');
    
    if (operatorResult.rows.length === 0) {
      console.log('   1. ❗ CRITICAL: Assign operators to INSPECT-001 machine');
      console.log('      - Use operator_machine_assignments table');
      console.log('      - Assign at least 2-3 employees to INSPECT operations');
      console.log('      - Consider employees with fewer machine assignments for availability');
    }
    
    const machineCount = machinesResult.rows.length;
    const inspectOpsCount = inspectJobsResult.rows.length;
    
    if (machineCount === 1 && inspectOpsCount > 20) {
      console.log('   2. ⚠️ Capacity constraint: Only 1 INSPECT machine for many operations');
      console.log('      - Consider adding more INSPECT machines if needed');
      console.log('      - Or increase working hours/shifts for INSPECT operations');
    }
    
    console.log('   3. 🔄 Test displacement by scheduling INSPECT operations with different priorities');
    console.log('   4. 📊 Monitor schedule density around INSPECT machine');
    
    console.log('\n🎯 Summary:');
    console.log(`   INSPECT Machines: ${machineCount}`);
    console.log(`   Assigned Operators: ${operatorResult.rows.length}`);
    console.log(`   Pending INSPECT Ops: ${inspectOpsCount}`);
    console.log(`   Currently Scheduled: ${currentScheduleResult.rows.length}`);
    
  } catch (error) {
    console.error('❌ Debug failed:', error.message);
  } finally {
    await pool.end();
  }
}

debugInspectScheduling();