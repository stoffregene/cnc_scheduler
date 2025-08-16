const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function fixJob60241() {
  try {
    console.log('=== FIXING JOB 60241 IMMEDIATE ISSUES ===');
    
    // 1. Clear the invalid employee assignment
    console.log('\n1. Clearing invalid employee assignment...');
    const clearQuery = `UPDATE schedule_slots SET employee_id = NULL WHERE id = 2291`;
    await pool.query(clearQuery);
    console.log('✅ Cleared invalid employee ID 9 from schedule slot');
    
    // 2. Find a valid operator for HMC-002 machine
    console.log('\n2. Finding valid operator for HMC-002...');
    const operatorQuery = `
      SELECT oma.employee_id, e.first_name, e.last_name
      FROM operator_machine_assignments oma
      LEFT JOIN employees e ON oma.employee_id::text = e.employee_id
      WHERE oma.machine_id = 3
      ORDER BY oma.employee_id
      LIMIT 1
    `;
    
    const operatorResult = await pool.query(operatorQuery);
    
    if (operatorResult.rows.length > 0) {
      const operator = operatorResult.rows[0];
      console.log(`Found operator: ID ${operator.employee_id}`);
      
      if (operator.first_name) {
        console.log(`  Name: ${operator.first_name} ${operator.last_name}`);
        console.log('✅ Operator exists in employees table');
      } else {
        console.log('⚠️  Operator ID exists in assignments but not in employees table');
        
        // Find alternative: Use Drew Darling who is mentioned in CLAUDE.md
        console.log('\n3. Looking for Drew Darling as alternative...');
        const drewQuery = `SELECT employee_id, first_name, last_name FROM employees WHERE first_name = 'Drew' AND last_name = 'Darling'`;
        const drewResult = await pool.query(drewQuery);
        
        if (drewResult.rows.length > 0) {
          const drew = drewResult.rows[0];
          console.log(`Found Drew: ${drew.employee_id} (${drew.first_name} ${drew.last_name})`);
          
          // Check if Drew is qualified for this machine type
          console.log('Checking if Drew can operate HMC machines...');
          const drewQualQuery = `
            SELECT m.name 
            FROM operator_machine_assignments oma
            JOIN machines m ON oma.machine_id = m.id
            WHERE oma.employee_id::text = $1
            AND m.name LIKE '%HMC%'
          `;
          
          const drewQualResult = await pool.query(drewQualQuery, [drew.employee_id]);
          
          if (drewQualResult.rows.length > 0) {
            console.log(`✅ Drew can operate: ${drewQualResult.rows.map(r => r.name).join(', ')}`);
            console.log('\n📋 RECOMMENDED ACTION:');
            console.log('Since there are schema mismatches, the best approach is to:');
            console.log('1. Reschedule job 60241 through the UI');
            console.log('2. Fix the employee ID data type inconsistencies');
          } else {
            console.log('❌ Drew is not qualified for HMC machines');
          }
        }
      }
    } else {
      console.log('❌ No operators found for HMC-002');
    }
    
    // 3. Check if job is now visible as unassigned
    console.log('\n4. Checking current job status...');
    const statusQuery = `
      SELECT ss.id, ss.employee_id, ss.start_datetime, ss.end_datetime,
             j.job_number, m.name as machine_name
      FROM schedule_slots ss
      JOIN jobs j ON ss.job_id = j.id
      JOIN machines m ON ss.machine_id = m.id  
      WHERE j.job_number = '60241'
    `;
    
    const statusResult = await pool.query(statusQuery);
    
    if (statusResult.rows.length > 0) {
      const slot = statusResult.rows[0];
      console.log(`Job 60241 status:`);
      console.log(`  Slot ID: ${slot.id}`);
      console.log(`  Machine: ${slot.machine_name}`);
      console.log(`  Employee ID: ${slot.employee_id || 'NULL (unassigned)'}`);
      console.log(`  Scheduled: ${slot.start_datetime} to ${slot.end_datetime}`);
      
      if (!slot.employee_id) {
        console.log('✅ Job is now unassigned and ready for proper operator assignment');
      }
    }
    
    console.log('\n=== SUMMARY ===');
    console.log('✅ Cleared invalid employee assignment');
    console.log('⚠️  Job 60241 is now scheduled but unassigned to any operator');
    console.log('📋 Next steps:');
    console.log('   1. Use the scheduling UI to assign a qualified operator');
    console.log('   2. Fix schema data type mismatches for long-term solution');
    
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
    process.exit();
  }
}

fixJob60241();