const { Pool } = require('pg');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function debugSchedulingOverlap() {
  try {
    console.log('🔍 Investigating why completed jobs appear in both shipping and scheduling...\n');
    
    // 1. Check what jobs appear in awaiting shipping
    console.log('1. Jobs in Awaiting Shipping:');
    const shippingResult = await pool.query(`
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
        WHERE j.status IN ('active', 'scheduled', 'in_progress', 'pending')
        GROUP BY j.id, j.job_number, j.customer_name, j.part_name, j.status
        HAVING COUNT(jr.id) > 0
      )
      SELECT job_number, job_status, customer_name, total_operations, completed_operations
      FROM job_operation_status
      WHERE all_operations_completed = true
      ORDER BY job_number
      LIMIT 10
    `);
    
    console.log(`   Found ${shippingResult.rows.length} jobs with all operations completed:`);
    shippingResult.rows.forEach(job => {
      console.log(`   ${job.job_number} (${job.job_status}): ${job.completed_operations}/${job.total_operations} ops completed`);
    });
    
    // 2. Check what the job management page queries for
    console.log('\n2. Jobs that would appear in Job Management:');
    const jobMgmtResult = await pool.query(`
      SELECT j.id, j.job_number, j.customer_name, j.part_name, j.status,
             COUNT(jr.id) as total_operations,
             COUNT(CASE WHEN jr.routing_status = 'C' THEN 1 END) as completed_operations
      FROM jobs j
      LEFT JOIN job_routings jr ON j.id = jr.job_id
      WHERE j.job_number IN ('S60062', 'TEST-SHIP-SIMPLE', '60079', '58917')
      GROUP BY j.id, j.job_number, j.customer_name, j.part_name, j.status
      ORDER BY j.job_number
    `);
    
    console.log(`   Sample completed jobs that may appear in Job Management:`);
    jobMgmtResult.rows.forEach(job => {
      console.log(`   ${job.job_number} (${job.status}): ${job.completed_operations}/${job.total_operations} ops - ${job.completed_operations === job.total_operations ? 'COMPLETED' : 'INCOMPLETE'}`);
    });
    
    // 3. Check what the scheduling page queries for
    console.log('\n3. Jobs that would appear in Scheduling:');
    // The scheduling page typically shows jobs that need to be scheduled
    const schedulingResult = await pool.query(`
      SELECT DISTINCT j.id, j.job_number, j.customer_name, j.part_name, j.status,
             COUNT(jr.id) as total_operations,
             COUNT(CASE WHEN jr.routing_status = 'C' THEN 1 END) as completed_operations,
             COUNT(CASE WHEN ss.id IS NOT NULL THEN 1 END) as scheduled_operations
      FROM jobs j
      LEFT JOIN job_routings jr ON j.id = jr.job_id
      LEFT JOIN schedule_slots ss ON jr.id = ss.job_routing_id
      WHERE j.job_number IN ('S60062', 'TEST-SHIP-SIMPLE', '60079', '58917')
      GROUP BY j.id, j.job_number, j.customer_name, j.part_name, j.status
      ORDER BY j.job_number
    `);
    
    console.log(`   Sample jobs that may appear in Scheduling:`);
    schedulingResult.rows.forEach(job => {
      console.log(`   ${job.job_number}: ${job.completed_operations}/${job.total_operations} completed, ${job.scheduled_operations} scheduled`);
      
      if (job.completed_operations === job.total_operations) {
        console.log(`     ❌ PROBLEM: This job is COMPLETED but may still appear in scheduling`);
      }
    });
    
    // 4. Suggest the filtering logic needed
    console.log('\n4. Recommended Filtering Logic:');
    console.log('   Job Management page should EXCLUDE jobs where:');
    console.log('   - All operations are completed (routing_status = "C")');
    console.log('   - OR job status is "completed" or "shipped"');
    console.log('');
    console.log('   Scheduling page should EXCLUDE jobs where:');
    console.log('   - All operations are completed (routing_status = "C")');
    console.log('   - OR job status is "completed" or "shipped"');
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

debugSchedulingOverlap();