const { Pool } = require('pg');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function checkJobStatuses() {
  try {
    const result = await pool.query(`
      SELECT DISTINCT status, COUNT(*) as count 
      FROM jobs 
      GROUP BY status 
      ORDER BY count DESC
    `);
    
    console.log('Job status values in database:');
    result.rows.forEach(row => {
      console.log(`  ${row.status}: ${row.count} jobs`);
    });
    
    // Also check jobs with completed operations but not active status
    console.log('\nJobs with all operations completed but not active status:');
    const completedResult = await pool.query(`
      WITH job_operation_status AS (
        SELECT 
          j.id as job_id,
          j.job_number,
          j.status as job_status,
          j.customer_name,
          j.part_name,
          COUNT(jr.id) as total_operations,
          COUNT(CASE WHEN jr.routing_status = 'C' THEN 1 END) as completed_operations,
          (COUNT(jr.id) = COUNT(CASE WHEN jr.routing_status = 'C' THEN 1 END)) as all_operations_completed
        FROM jobs j
        LEFT JOIN job_routings jr ON j.id = jr.job_id
        GROUP BY j.id, j.job_number, j.status, j.customer_name, j.part_name
        HAVING COUNT(jr.id) > 0
      )
      SELECT job_number, job_status, customer_name, part_name, 
             total_operations, completed_operations
      FROM job_operation_status
      WHERE all_operations_completed = true AND job_status != 'active'
      ORDER BY job_number
    `);
    
    if (completedResult.rows.length > 0) {
      completedResult.rows.forEach(job => {
        console.log(`  ${job.job_number} (${job.job_status}): ${job.customer_name} - ${job.part_name} [${job.completed_operations}/${job.total_operations} ops completed]`);
      });
    } else {
      console.log('  None found');
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

checkJobStatuses();