const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function checkJob60241() {
  try {
    // First, let's check the jobs table structure
    console.log('Checking jobs table for job 60241...');
    const jobQuery = `SELECT * FROM jobs WHERE job_number = $1`;
    const jobResult = await pool.query(jobQuery, ['60241']);
    
    if (jobResult.rows.length === 0) {
      console.log('Job 60241 not found in jobs table');
      return;
    }
    
    console.log('Job found:', jobResult.rows[0]);
    const jobId = jobResult.rows[0].id; // Using 'id' instead of 'job_id'
    
    // Now check schedule slots
    console.log('\nChecking schedule slots...');
    const scheduleQuery = `
      SELECT ss.*, m.name as machine_name, e.employee_name, jr.operation_name 
      FROM schedule_slots ss 
      JOIN machines m ON ss.machine_id = m.id 
      LEFT JOIN employees e ON ss.employee_id = e.employee_id 
      JOIN job_routings jr ON ss.job_routing_id = jr.routing_id 
      WHERE ss.job_id = $1 
      ORDER BY ss.start_datetime
    `;
    
    const scheduleResult = await pool.query(scheduleQuery, [jobId]);
    
    console.log(`Found ${scheduleResult.rows.length} schedule slots for job 60241:`);
    scheduleResult.rows.forEach((row, index) => {
      console.log(`\n${index + 1}. ${row.operation_name} on ${row.machine_name}`);
      console.log(`   Operator: ${row.employee_name || 'NO OPERATOR'}`);
      console.log(`   Start: ${row.start_datetime}`);
      console.log(`   End: ${row.end_datetime}`);
      console.log(`   Slot ID: ${row.id}`);
    });
    
    // Check for duplicates
    const machineRoutingCombos = scheduleResult.rows.map(row => `${row.machine_id}-${row.job_routing_id}`);
    const duplicates = machineRoutingCombos.filter((combo, index) => 
      machineRoutingCombos.indexOf(combo) !== index
    );
    
    if (duplicates.length > 0) {
      console.log('\n⚠️  DUPLICATE ENTRIES DETECTED!');
      duplicates.forEach(combo => {
        const [machineId, routingId] = combo.split('-');
        const dupRows = scheduleResult.rows.filter(row => 
          row.machine_id == machineId && row.job_routing_id == routingId
        );
        console.log(`Multiple slots for machine ${machineId}, routing ${routingId}:`);
        dupRows.forEach(row => console.log(`  - Slot ${row.id}: ${row.start_datetime}`));
      });
    }
    
    // Check operator work schedules for today
    console.log('\nChecking operator availability for today...');
    const today = new Date().toISOString().split('T')[0];
    
    const operatorQuery = `
      SELECT DISTINCT e.employee_id, e.employee_name,
        get_employee_working_hours(e.employee_id, $1::date) as hours
      FROM employees e
      WHERE e.employee_id IN (
        SELECT DISTINCT ss.employee_id 
        FROM schedule_slots ss 
        WHERE ss.job_id = $2 AND ss.employee_id IS NOT NULL
      )
    `;
    
    const operatorResult = await pool.query(operatorQuery, [today, jobId]);
    
    console.log('\nOperator availability for today:');
    operatorResult.rows.forEach(row => {
      console.log(`${row.employee_name}: ${JSON.stringify(row.hours)}`);
    });
    
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
    process.exit();
  }
}

checkJob60241();