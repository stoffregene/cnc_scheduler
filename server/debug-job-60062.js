const { Pool } = require('pg');
const path = require('path');

// Load environment variables from project root
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:sassysalad@localhost:5432/cnc_scheduler',
});

async function debugJob60062() {
  const client = await pool.connect();
  
  try {
    console.log('🔍 Debugging Job S60062 - why it\'s not in awaiting shipping...\n');
    
    // 1. Check job basic info
    console.log('1. Job Basic Information:');
    const jobResult = await client.query(`
      SELECT id, job_number, customer_name, part_name, quantity, status, 
             due_date, promised_date, priority_score, created_at
      FROM jobs 
      WHERE job_number = 'S60062'
    `);
    
    if (jobResult.rows.length === 0) {
      console.log('❌ Job S60062 not found in database');
      return;
    }
    
    const job = jobResult.rows[0];
    console.log(`   Job ID: ${job.id}`);
    console.log(`   Job Number: ${job.job_number}`);
    console.log(`   Customer: ${job.customer_name}`);
    console.log(`   Part: ${job.part_name}`);
    console.log(`   Status: ${job.status} ${job.status === 'active' ? '✅' : '❌'}`);
    console.log(`   Due Date: ${job.due_date}`);
    console.log(`   Promised Date: ${job.promised_date}`);
    console.log('');
    
    // 2. Check job routings and their status
    console.log('2. Job Routings Status:');
    const routingsResult = await client.query(`
      SELECT id, operation_number, operation_name, sequence_order, 
             estimated_hours, routing_status, machine_id, machine_group_id,
             notes, is_outsourced
      FROM job_routings 
      WHERE job_id = $1
      ORDER BY sequence_order, operation_number
    `, [job.id]);
    
    console.log(`   Found ${routingsResult.rows.length} operations:`);
    routingsResult.rows.forEach(routing => {
      console.log(`   Op ${routing.operation_number} - ${routing.operation_name}:`);
      console.log(`     Routing Status: "${routing.routing_status}" ${routing.routing_status === 'C' ? '✅ COMPLETED' : '❌ NOT COMPLETED'}`);
      console.log(`     Sequence: ${routing.sequence_order}`);
      console.log(`     Estimated Hours: ${routing.estimated_hours}`);
      console.log(`     Machine ID: ${routing.machine_id}`);
      console.log(`     Is Outsourced: ${routing.is_outsourced || false}`);
      console.log('');
    });
    
    // 3. Check if it matches awaiting shipping criteria
    console.log('3. Awaiting Shipping Criteria Check:');
    const criteriaResult = await client.query(`
      WITH job_operation_status AS (
        SELECT 
          j.id as job_id,
          j.job_number,
          j.status as job_status,
          COUNT(jr.id) as total_operations,
          COUNT(CASE WHEN jr.routing_status = 'C' THEN 1 END) as completed_operations,
          (COUNT(jr.id) = COUNT(CASE WHEN jr.routing_status = 'C' THEN 1 END)) as all_operations_completed
        FROM jobs j
        LEFT JOIN job_routings jr ON j.id = jr.job_id
        WHERE j.job_number = 'S60062'
        GROUP BY j.id, j.job_number, j.status
      )
      SELECT * FROM job_operation_status
    `);
    
    if (criteriaResult.rows.length > 0) {
      const criteria = criteriaResult.rows[0];
      console.log(`   Job Status: ${criteria.job_status} ${criteria.job_status === 'active' ? '✅' : '❌'}`);
      console.log(`   Total Operations: ${criteria.total_operations}`);
      console.log(`   Completed Operations: ${criteria.completed_operations}`);
      console.log(`   All Operations Completed: ${criteria.all_operations_completed} ${criteria.all_operations_completed ? '✅' : '❌'}`);
      
      // Final verdict
      const shouldBeInShipping = criteria.job_status === 'active' && criteria.all_operations_completed;
      console.log(`   Should be in awaiting shipping: ${shouldBeInShipping} ${shouldBeInShipping ? '✅' : '❌'}`);
    }
    
    // 4. Check schedule slots
    console.log('\n4. Schedule Slots Information:');
    const slotsResult = await client.query(`
      SELECT ss.id, ss.job_routing_id, ss.machine_id, ss.employee_id, 
             ss.start_datetime, ss.end_datetime, ss.status, ss.duration_minutes,
             jr.operation_number, jr.operation_name, jr.routing_status,
             m.name as machine_name, e.first_name || ' ' || e.last_name as employee_name
      FROM schedule_slots ss
      JOIN job_routings jr ON ss.job_routing_id = jr.id
      LEFT JOIN machines m ON ss.machine_id = m.id
      LEFT JOIN employees e ON ss.employee_id = e.id
      WHERE jr.job_id = $1
      ORDER BY jr.sequence_order, jr.operation_number
    `, [job.id]);
    
    console.log(`   Found ${slotsResult.rows.length} schedule slots:`);
    if (slotsResult.rows.length === 0) {
      console.log('   ❌ NO SCHEDULE SLOTS FOUND - This may be the issue!');
    } else {
      slotsResult.rows.forEach(slot => {
        console.log(`   Op ${slot.operation_number} - ${slot.operation_name}:`);
        console.log(`     Slot Status: ${slot.status}`);
        console.log(`     Routing Status: ${slot.routing_status}`);
        console.log(`     Machine: ${slot.machine_name || 'Not assigned'}`);
        console.log(`     Employee: ${slot.employee_name || 'Not assigned'}`);
        console.log(`     Start: ${slot.start_datetime || 'Not set'}`);
        console.log('');
      });
    }
    
    // 5. Run the actual awaiting shipping query to see if it appears
    console.log('5. Testing Awaiting Shipping Query:');
    const shippingResult = await client.query(`
      WITH job_operation_status AS (
        SELECT 
          j.id as job_id,
          j.job_number,
          j.customer_name,
          j.part_name,
          j.status as job_status,
          COUNT(jr.id) as total_operations,
          COUNT(CASE WHEN jr.routing_status = 'C' THEN 1 END) as completed_operations,
          (COUNT(jr.id) = COUNT(CASE WHEN jr.routing_status = 'C' THEN 1 END)) as all_operations_completed
        FROM jobs j
        LEFT JOIN job_routings jr ON j.id = jr.job_id
        WHERE j.job_number = 'S60062'
        GROUP BY j.id, j.job_number, j.customer_name, j.part_name, j.status
      )
      SELECT * FROM job_operation_status
      WHERE job_status = 'active' AND all_operations_completed = true
    `);
    
    console.log(`   Query Result: ${shippingResult.rows.length > 0 ? '✅ FOUND' : '❌ NOT FOUND'} in awaiting shipping`);
    if (shippingResult.rows.length > 0) {
      console.log('   Job SHOULD appear in awaiting shipping queue');
    } else {
      console.log('   Job does NOT meet awaiting shipping criteria');
    }
    
  } catch (error) {
    console.error('Error debugging job:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

// Run the debug
debugJob60062();