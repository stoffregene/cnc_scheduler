const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5732/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function checkJob() {
  try {
    console.log('🔍 Analyzing Job 60124-2 Operations...\n');
    
    const result = await pool.query(`
      SELECT j.job_number, jr.operation_number, jr.operation_name, 
             jr.machine_id, m.name as machine_name,
             jr.machine_group_id, mg.name as group_name,
             jr.estimated_hours
      FROM jobs j
      JOIN job_routings jr ON j.id = jr.job_id  
      LEFT JOIN machines m ON jr.machine_id = m.id
      LEFT JOIN machine_groups mg ON jr.machine_group_id = mg.id
      WHERE j.job_number = '60124-2'
      ORDER BY jr.sequence_order
    `);
    
    console.log('Job 60124-2 Operations:');
    console.log('=======================');
    result.rows.forEach(row => {
      console.log(`Op ${row.operation_number}: ${row.operation_name}`);
      console.log(`  Machine: ${row.machine_name || 'NULL'} (ID: ${row.machine_id || 'NULL'})`);
      console.log(`  Group: ${row.group_name || 'NULL'} (ID: ${row.machine_group_id || 'NULL'})`);
      console.log(`  Hours: ${row.estimated_hours}`);
      console.log('');
    });
    
    // Check what machines are available for the first operation
    const firstOp = result.rows[0];
    if (firstOp && firstOp.machine_id === null && firstOp.machine_group_id === null) {
      console.log('⚠️ First operation has NULL machine and NULL group!');
      console.log('This is why scheduling fails - operation has no target machine.');
      console.log('\nSuggested fixes:');
      console.log('1. Update the routing to specify a machine_id');
      console.log('2. Update the routing to specify a machine_group_id');  
      console.log('3. Fix the CSV import to properly assign machines/groups');
    }
    
  } catch (error) {
    console.error('❌ Check failed:', error.message);
  } finally {
    await pool.end();
  }
}

checkJob();