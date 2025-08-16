const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function debugJob60243() {
  try {
    console.log('=== DEBUGGING JOB 60243 CSV IMPORT ISSUE ===\n');
    
    // 1. Check what's in the database for job 60243
    console.log('1. What\'s currently in the database:');
    const dbResult = await pool.query(`
      SELECT 
        j.job_number,
        j.id as job_id,
        jr.id as routing_id,
        jr.operation_number,
        jr.operation_name,
        jr.sequence_order,
        jr.routing_status,
        m.name as machine_name,
        mg.name as machine_group_name,
        jr.estimated_hours,
        jr.notes
      FROM jobs j
      LEFT JOIN job_routings jr ON j.id = jr.job_id
      LEFT JOIN machines m ON jr.machine_id = m.id
      LEFT JOIN machine_groups mg ON jr.machine_group_id = mg.id
      WHERE j.job_number = '60243'
      ORDER BY jr.sequence_order
    `);
    
    if (dbResult.rows.length === 0) {
      console.log('❌ Job 60243 not found in database!');
      return;
    }
    
    const job = dbResult.rows[0];
    console.log(`   Job ${job.job_number} (ID: ${job.job_id})`);
    
    if (job.routing_id) {
      console.log('   Operations in database:');
      dbResult.rows.forEach(row => {
        console.log(`     Op ${row.operation_number}: ${row.operation_name} (seq: ${row.sequence_order})`);
        console.log(`       Machine: ${row.machine_name || 'NULL'}, Group: ${row.machine_group_name || 'NULL'}`);
        console.log(`       Status: ${row.routing_status}, Hours: ${row.estimated_hours}`);
        if (row.notes) console.log(`       Notes: ${row.notes}`);
        console.log('');
      });
    } else {
      console.log('   ❌ NO OPERATIONS FOUND for this job!');
    }
    
    // 2. Check the raw JobBoss data stored with the job
    console.log('\n2. Raw JobBoss data stored with job:');
    const rawDataResult = await pool.query(`
      SELECT job_boss_data
      FROM jobs
      WHERE job_number = '60243'
    `);
    
    if (rawDataResult.rows[0]?.job_boss_data) {
      const rawData = rawDataResult.rows[0].job_boss_data;
      console.log('   Raw data from CSV:');
      console.log(`     Job: ${rawData.job_number}`);
      console.log(`     Customer: ${rawData.customer_name}`);
      console.log(`     Part: ${rawData.part_description}`);
      console.log(`     Workcenter: ${rawData.amt_workcenter_vendor}`);
      console.log(`     Sequence: ${rawData.sequence}`);
      console.log(`     Status: ${rawData.status} / Routing Status: ${rawData.routing_status}`);
      console.log(`     Hours: ${rawData.est_total_hours}`);
    } else {
      console.log('   ❌ No raw JobBoss data stored');
    }
    
    // 3. Check if there are any other jobs with sequence 0 vs 1 patterns
    console.log('\n3. Checking other jobs for sequence 0 patterns:');
    const seq0Check = await pool.query(`
      SELECT 
        j.job_number,
        COUNT(jr.id) as operation_count,
        MIN(jr.sequence_order) as min_seq,
        MAX(jr.sequence_order) as max_seq,
        ARRAY_AGG(jr.sequence_order ORDER BY jr.sequence_order) as sequences,
        ARRAY_AGG(jr.operation_name ORDER BY jr.sequence_order) as operations
      FROM jobs j
      LEFT JOIN job_routings jr ON j.id = jr.job_id
      GROUP BY j.job_number
      HAVING MIN(jr.sequence_order) = 0 OR MAX(jr.sequence_order) != COUNT(jr.id) - 1
      ORDER BY j.job_number
      LIMIT 10
    `);
    
    console.log('   Jobs with sequence 0 or gaps:');
    seq0Check.rows.forEach(job => {
      console.log(`     Job ${job.job_number}: sequences ${job.sequences?.join(', ') || 'NONE'}`);
      console.log(`       Operations: ${job.operations?.join(' → ') || 'NONE'}`);
    });
    
    // 4. Check machine mapping for SAW and LATHE-001
    console.log('\n4. Machine mapping check:');
    const machineCheck = await pool.query(`
      SELECT name, id, status
      FROM machines 
      WHERE name IN ('SAW', 'LATHE-001', 'LATHE')
      ORDER BY name
    `);
    
    console.log('   SAW/LATHE machines in database:');
    machineCheck.rows.forEach(machine => {
      console.log(`     ${machine.name}: ID ${machine.id} (${machine.status})`);
    });
    
    // 5. Check machine groups for LATHE
    const groupCheck = await pool.query(`
      SELECT mg.name, mg.id, 
             ARRAY_AGG(m.name ORDER BY m.name) as machines
      FROM machine_groups mg
      LEFT JOIN machine_group_machines mgm ON mg.id = mgm.machine_group_id
      LEFT JOIN machines m ON mgm.machine_id = m.id
      WHERE mg.name ILIKE '%LATHE%' OR mg.name ILIKE '%SAW%'
      GROUP BY mg.id, mg.name
      ORDER BY mg.name
    `);
    
    console.log('\n   LATHE/SAW machine groups:');
    groupCheck.rows.forEach(group => {
      console.log(`     Group "${group.name}": ${group.machines?.join(', ') || 'No machines'}`);
    });
    
    // 6. Let's check if this is a parsing issue by looking for similar patterns
    console.log('\n5. Checking for CSV parsing patterns:');
    const parsingCheck = await pool.query(`
      SELECT 
        j.job_number,
        j.job_boss_data->>'amt_workcenter_vendor' as original_workcenter,
        jr.operation_name as parsed_operation,
        jr.sequence_order
      FROM jobs j
      JOIN job_routings jr ON j.id = jr.job_id
      WHERE j.job_boss_data->>'amt_workcenter_vendor' ILIKE '%SAW%'
         OR j.job_boss_data->>'amt_workcenter_vendor' ILIKE '%LATHE%'
      ORDER BY j.job_number, jr.sequence_order
      LIMIT 10
    `);
    
    console.log('   SAW/LATHE operations in other jobs:');
    parsingCheck.rows.forEach(row => {
      console.log(`     Job ${row.job_number} seq ${row.sequence_order}: "${row.original_workcenter}" → "${row.parsed_operation}"`);
    });
    
    console.log('\n=== ANALYSIS ===');
    console.log('Looking for:');
    console.log('1. Missing sequence 0 (SAW) operation');
    console.log('2. Parser filtering issues');
    console.log('3. Machine mapping problems');
    console.log('4. Sequence ordering issues');
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
    process.exit();
  }
}

debugJob60243();