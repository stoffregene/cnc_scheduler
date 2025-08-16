const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function comprehensiveSchemaFix() {
  try {
    console.log('=== COMPREHENSIVE SCHEMA ANALYSIS ===');
    
    // Check data types across all tables
    const tables = ['employees', 'schedule_slots', 'operator_machine_assignments'];
    
    for (const table of tables) {
      console.log(`\n${table.toUpperCase()} table employee_id column:`);
      const typeQuery = `
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = $1 AND column_name = 'employee_id'
      `;
      const result = await pool.query(typeQuery, [table]);
      if (result.rows.length > 0) {
        console.log(`  employee_id: ${result.rows[0].data_type}`);
      } else {
        console.log(`  No employee_id column found`);
      }
    }
    
    console.log('\n=== IMMEDIATE FIX FOR JOB 60241 ===');
    
    // Get job details
    const jobQuery = `
      SELECT ss.id as slot_id, ss.employee_id, ss.machine_id,
             j.job_number, m.name as machine_name
      FROM schedule_slots ss
      JOIN jobs j ON ss.job_id = j.id  
      JOIN machines m ON ss.machine_id = m.id
      WHERE j.job_number = '60241'
    `;
    
    const jobResult = await pool.query(jobQuery);
    const slot = jobResult.rows[0];
    
    console.log(`Job 60241 is assigned to:`);
    console.log(`  Machine: ${slot.machine_name} (ID: ${slot.machine_id})`);
    console.log(`  Invalid Employee ID: ${slot.employee_id}`);
    
    // Find any qualified operator by checking the assignments table directly
    console.log('\nFinding qualified operators (bypassing type mismatch)...');
    const operatorQuery = `
      SELECT DISTINCT oma.employee_id
      FROM operator_machine_assignments oma
      WHERE oma.machine_id = $1
      LIMIT 1
    `;
    
    const operatorResult = await pool.query(operatorQuery, [slot.machine_id]);
    
    if (operatorResult.rows.length > 0) {
      const operatorId = operatorResult.rows[0].employee_id;
      console.log(`Found qualified operator: ${operatorId}`);
      
      // Get operator details
      const empQuery = `SELECT first_name, last_name FROM employees WHERE employee_id = $1`;
      const empResult = await pool.query(empQuery, [operatorId]);
      
      if (empResult.rows.length > 0) {
        const emp = empResult.rows[0];
        console.log(`Operator: ${emp.first_name} ${emp.last_name}`);
        
        // SOLUTION 1: Try to update with a string that looks like a number
        console.log('\n=== ATTEMPTING IMMEDIATE FIX ===');
        console.log('Option 1: Clear the invalid employee assignment');
        
        const clearQuery = `UPDATE schedule_slots SET employee_id = NULL WHERE id = $1`;
        await pool.query(clearQuery, [slot.slot_id]);
        console.log('✅ Cleared invalid employee assignment');
        
        console.log('\nOption 2: Schema change needed for proper fix');
        console.log('Execute these SQL commands to fix the schema:');
        console.log('\nALTER TABLE schedule_slots ALTER COLUMN employee_id TYPE VARCHAR USING employee_id::text;');
        console.log(`UPDATE schedule_slots SET employee_id = '${operatorId}' WHERE id = ${slot.slot_id};`);
        
      }
    } else {
      console.log('❌ No qualified operators found');
    }
    
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
    process.exit();
  }
}

comprehensiveSchemaFix();