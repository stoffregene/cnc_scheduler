const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5732/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function createTestInspectJob() {
  try {
    console.log('🔧 Creating Test Job with INSPECT for testing...\n');
    
    // Step 1: Get available machines for each operation type
    const sawMachineResult = await pool.query(`
      SELECT id, name FROM machines WHERE name LIKE '%SAW%' AND status = 'active' LIMIT 1
    `);
    
    const inspectMachineResult = await pool.query(`
      SELECT id, name FROM machines WHERE name LIKE '%INSPECT%' AND status = 'active' LIMIT 1
    `);
    
    if (sawMachineResult.rows.length === 0 || inspectMachineResult.rows.length === 0) {
      console.log('❌ Cannot find required machines (SAW and INSPECT)');
      return;
    }
    
    const sawMachine = sawMachineResult.rows[0];
    const inspectMachine = inspectMachineResult.rows[0];
    
    console.log(`Available machines:`);
    console.log(`  SAW: ${sawMachine.name} (ID: ${sawMachine.id})`);
    console.log(`  INSPECT: ${inspectMachine.name} (ID: ${inspectMachine.id})`);
    
    // Step 2: Create test job
    const uniqueJobNumber = `TEST-INSPECT-${Date.now()}`;
    const jobResult = await pool.query(`
      INSERT INTO jobs (
        job_number, customer_name, part_number,
        quantity, priority, due_date, promised_date, status,
        priority_score, created_at
      ) VALUES (
        $1, 'TEST CUSTOMER', 'PART-001',
        1, 5, CURRENT_DATE + INTERVAL '10 days', CURRENT_DATE + INTERVAL '8 days', 'pending',
        500, NOW()
      ) RETURNING id
    `, [uniqueJobNumber]);
    
    const jobId = jobResult.rows[0].id;
    console.log(`\n✅ Created test job ID: ${jobId}`);
    
    // Step 3: Create routing with proper machine assignments
    await pool.query(`
      INSERT INTO job_routings (
        job_id, operation_number, operation_name, machine_id, 
        sequence_order, estimated_hours, notes
      ) VALUES 
      ($1, 1, 'SAW-001', $2, 1, 2.0, 'Test SAW operation'),
      ($1, 2, 'INSPECT-001', $3, 2, 1.5, 'Test INSPECT operation')
    `, [jobId, sawMachine.id, inspectMachine.id]);
    
    console.log(`✅ Created routing with proper machine assignments:`);
    console.log(`   Op 1: SAW-001 -> Machine ${sawMachine.name} (ID: ${sawMachine.id})`);
    console.log(`   Op 2: INSPECT-001 -> Machine ${inspectMachine.name} (ID: ${inspectMachine.id})`);
    
    // Step 4: Verify the job can be scheduled
    console.log(`\n🎯 Test job created: TEST-INSPECT-001 (ID: ${jobId})`);
    console.log(`This job should now be schedulable and the INSPECT operation should go to the queue.`);
    
    // Show the created job details
    const verifyResult = await pool.query(`
      SELECT j.job_number, jr.operation_number, jr.operation_name,
             jr.machine_id, m.name as machine_name, jr.estimated_hours
      FROM jobs j
      JOIN job_routings jr ON j.id = jr.job_id
      LEFT JOIN machines m ON jr.machine_id = m.id
      WHERE j.id = $1
      ORDER BY jr.sequence_order
    `, [jobId]);
    
    console.log(`\n📋 Verification - Job routing details:`);
    verifyResult.rows.forEach(row => {
      console.log(`   Op ${row.operation_number}: ${row.operation_name}`);
      console.log(`     Machine: ${row.machine_name} (ID: ${row.machine_id})`);
      console.log(`     Hours: ${row.estimated_hours}`);
    });
    
  } catch (error) {
    console.error('❌ Creation failed:', error.message);
  } finally {
    await pool.end();
  }
}

createTestInspectJob();