require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function checkJob57710() {
  try {
    console.log('=== CHECKING JOB 57710 SEQUENCE ORDER ===');
    
    // Find job 57710
    const jobResult = await pool.query(`
      SELECT id, job_number FROM jobs WHERE job_number = '57710'
    `);
    
    if (jobResult.rows.length === 0) {
      console.log('Job 57710 not found');
      return;
    }
    
    const job = jobResult.rows[0];
    console.log(`Found job: ${job.job_number} (ID: ${job.id})`);
    
    // Get the exact same query as the API endpoint
    const routingsResult = await pool.query(`
      SELECT 
        jr.id, jr.operation_number, jr.operation_name, jr.machine_id,
        jr.machine_group_id, jr.sequence_order, jr.estimated_hours, jr.notes, jr.routing_status,
        m.name as machine_name, m.model as machine_model,
        ss.id as schedule_slot_id, ss.start_datetime, ss.end_datetime, 
        ss.machine_id as scheduled_machine_id, ss.employee_id as scheduled_employee_id,
        sm.name as scheduled_machine_name, sm.model as scheduled_machine_model,
        e.first_name || ' ' || e.last_name as scheduled_employee_name,
        ss.status as schedule_status, ss.duration_minutes, ss.locked as slot_locked
      FROM job_routings jr
      LEFT JOIN machines m ON jr.machine_id = m.id
      LEFT JOIN schedule_slots ss ON jr.id = ss.job_routing_id
      LEFT JOIN machines sm ON ss.machine_id = sm.id
      LEFT JOIN employees e ON ss.employee_id = e.id
      WHERE jr.job_id = $1
      ORDER BY jr.sequence_order, jr.operation_number
    `, [job.id]);
    
    console.log('\n=== DATABASE RESULTS (as returned by API) ===');
    console.log(`Found ${routingsResult.rows.length} operations`);
    
    routingsResult.rows.forEach((row, index) => {
      console.log(`${index + 1}. Op ${row.operation_number}: ${row.operation_name}`);
      console.log(`   sequence_order: ${row.sequence_order} (type: ${typeof row.sequence_order})`);
      console.log(`   machine: ${row.machine_name || 'None'}`);
      console.log('');
    });
    
    // Check if there are any null or unexpected sequence values
    console.log('=== SEQUENCE ORDER ANALYSIS ===');
    const sequenceMap = new Map();
    routingsResult.rows.forEach(row => {
      const key = row.sequence_order;
      if (!sequenceMap.has(key)) {
        sequenceMap.set(key, []);
      }
      sequenceMap.get(key).push({
        operation_number: row.operation_number,
        operation_name: row.operation_name
      });
    });
    
    console.log('Sequence order distribution:');
    for (const [seqOrder, operations] of sequenceMap.entries()) {
      console.log(`  sequence_order ${seqOrder}:`);
      operations.forEach(op => {
        console.log(`    - Op ${op.operation_number}: ${op.operation_name}`);
      });
    }
    
    // Check raw ordering without ORDER BY
    console.log('\n=== RAW DATA (no ORDER BY) ===');
    const rawResult = await pool.query(`
      SELECT jr.operation_number, jr.operation_name, jr.sequence_order
      FROM job_routings jr
      WHERE jr.job_id = $1
    `, [job.id]);
    
    console.log('Raw database order:');
    rawResult.rows.forEach((row, index) => {
      console.log(`${index + 1}. Op ${row.operation_number}: sequence_order = ${row.sequence_order}`);
    });
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

checkJob57710();