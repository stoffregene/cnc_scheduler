const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function fixEmployeeId() {
  try {
    // Check the data types in schedule_slots
    console.log('Checking data types...');
    const typeQuery = `
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'schedule_slots' 
      AND column_name = 'employee_id'
    `;
    const typeResult = await pool.query(typeQuery);
    console.log('Schedule_slots employee_id type:', typeResult.rows[0]?.data_type);
    
    const empTypeQuery = `
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'employees' 
      AND column_name = 'employee_id'
    `;
    const empTypeResult = await pool.query(empTypeQuery);
    console.log('Employees employee_id type:', empTypeResult.rows[0]?.data_type);
    
    // Check the current invalid assignment
    console.log('\nChecking invalid schedule slot...');
    const invalidQuery = `
      SELECT ss.id, ss.employee_id, ss.machine_id, ss.start_datetime, j.job_number
      FROM schedule_slots ss
      JOIN jobs j ON ss.job_id = j.id
      WHERE j.job_number = '60241'
    `;
    const invalidResult = await pool.query(invalidQuery);
    
    console.log('Current assignment:');
    invalidResult.rows.forEach(row => {
      console.log(`  Slot ${row.id}: employee_id = ${row.employee_id} (type: ${typeof row.employee_id})`);
      console.log(`  Machine ID: ${row.machine_id}`);
      console.log(`  Start: ${row.start_datetime}`);
    });
    
    // Find which machine this is
    const machineQuery = `SELECT id, name FROM machines WHERE id = $1`;
    const machineResult = await pool.query(machineQuery, [invalidResult.rows[0].machine_id]);
    console.log(`Machine: ${machineResult.rows[0].name}`);
    
    // Find qualified operators for this machine
    console.log('\nFinding qualified operators...');
    const qualifiedQuery = `
      SELECT DISTINCT e.employee_id, e.first_name, e.last_name
      FROM operator_machine_assignments oma
      JOIN employees e ON oma.employee_id = e.employee_id
      WHERE oma.machine_id = $1
      ORDER BY e.employee_id
    `;
    const qualifiedResult = await pool.query(qualifiedQuery, [invalidResult.rows[0].machine_id]);
    
    console.log('Qualified operators:');
    qualifiedResult.rows.forEach(row => {
      console.log(`  ${row.employee_id}: ${row.first_name} ${row.last_name}`);
    });
    
    // Suggest Drew Darling (DD009) as the replacement since he's mentioned in CLAUDE.md
    if (qualifiedResult.rows.length > 0) {
      const drewOperator = qualifiedResult.rows.find(emp => emp.employee_id === 'DD009');
      const suggestedOperator = drewOperator || qualifiedResult.rows[0];
      
      console.log(`\nSuggested fix: Replace employee_id 9 with '${suggestedOperator.employee_id}' (${suggestedOperator.first_name} ${suggestedOperator.last_name})`);
      
      // Ask if we should fix it
      console.log('\nTo fix this, run:');
      console.log(`UPDATE schedule_slots SET employee_id = '${suggestedOperator.employee_id}' WHERE id = ${invalidResult.rows[0].id};`);
    }
    
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
    process.exit();
  }
}

fixEmployeeId();