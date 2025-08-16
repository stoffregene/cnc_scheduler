const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function checkMachineGroups() {
  try {
    // First, check if there's a machine_groups table
    const tablesQuery = `
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name LIKE '%machine%'
      ORDER BY table_name
    `;
    
    const tablesResult = await pool.query(tablesQuery);
    console.log('Machine-related tables:');
    tablesResult.rows.forEach(row => console.log(`  ${row.table_name}`));
    
    // Check machines table structure and VMC-004 specifically
    console.log('\nChecking VMC-004 machine details:');
    const vmcQuery = `SELECT * FROM machines WHERE name = 'VMC-004'`;
    const vmcResult = await pool.query(vmcQuery);
    
    if (vmcResult.rows.length > 0) {
      console.log('VMC-004 found:', vmcResult.rows[0]);
    } else {
      console.log('VMC-004 not found, checking all machines...');
      const allMachines = await pool.query('SELECT id, name FROM machines ORDER BY name');
      console.log('All machines:');
      allMachines.rows.forEach(row => console.log(`  ${row.id}: ${row.name}`));
    }
    
    // Check if there are job routings for job 60241
    console.log('\nChecking job routings for job 60241:');
    const routingsQuery = `
      SELECT jr.*, j.job_number 
      FROM job_routings jr 
      JOIN jobs j ON jr.job_id = j.id 
      WHERE j.job_number = '60241'
      ORDER BY jr.sequence_order
    `;
    
    const routingsResult = await pool.query(routingsQuery);
    console.log(`Found ${routingsResult.rows.length} routings for job 60241:`);
    routingsResult.rows.forEach(row => {
      console.log(`  Routing ${row.routing_id}: ${row.operation_name} (seq: ${row.sequence_order})`);
      console.log(`    Required machine: ${row.required_machine || 'ANY'}`);
      console.log(`    Workcenter: ${row.workcenter || 'N/A'}`);
    });
    
    // Check machine groups for VMC-004
    console.log('\nChecking machine groups for VMC-004:');
    const groupsQuery = `
      SELECT mg.name as group_name, mga.machine_id, m.name as machine_name
      FROM machine_group_assignments mga
      JOIN machine_groups mg ON mga.machine_group_id = mg.id
      JOIN machines m ON mga.machine_id = m.id
      WHERE m.name = 'VMC-004'
    `;
    
    const groupsResult = await pool.query(groupsQuery);
    console.log(`VMC-004 belongs to ${groupsResult.rows.length} machine groups:`);
    groupsResult.rows.forEach(row => {
      console.log(`  - ${row.group_name}`);
    });
    
    // Check schedule slots for job 60241 to see the duplicates
    console.log('\nChecking schedule slots for job 60241:');
    const scheduleQuery = `
      SELECT ss.id, ss.machine_id, ss.job_routing_id, ss.start_datetime, ss.end_datetime,
             m.name as machine_name, jr.operation_name
      FROM schedule_slots ss 
      JOIN machines m ON ss.machine_id = m.id 
      JOIN job_routings jr ON ss.job_routing_id = jr.id 
      JOIN jobs j ON ss.job_id = j.id
      WHERE j.job_number = '60241'
      ORDER BY ss.start_datetime, ss.machine_id
    `;
    
    const scheduleResult = await pool.query(scheduleQuery);
    console.log(`Found ${scheduleResult.rows.length} schedule slots:`);
    scheduleResult.rows.forEach((row, index) => {
      console.log(`  ${index + 1}. Slot ${row.id}: ${row.operation_name} on ${row.machine_name}`);
      console.log(`     Routing ID: ${row.job_routing_id}, Machine ID: ${row.machine_id}`);
      console.log(`     Time: ${row.start_datetime} to ${row.end_datetime}`);
    });
    
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
    process.exit();
  }
}

checkMachineGroups();