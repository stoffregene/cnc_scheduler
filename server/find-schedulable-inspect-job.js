const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5732/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function findSchedulableInspectJob() {
  try {
    console.log('🔍 Finding Jobs with INSPECT that can be scheduled...\n');
    
    // Find jobs that have INSPECT operations AND have non-null machine assignments for first operation
    const result = await pool.query(`
      WITH job_analysis AS (
        SELECT 
          j.id, j.job_number, j.customer_name, j.priority_score, j.status,
          -- Check if job has INSPECT operation
          COUNT(*) FILTER (WHERE jr.operation_name ILIKE '%INSPECT%') as inspect_count,
          -- Check if first operation has valid machine assignment
          MIN(CASE WHEN jr.sequence_order = 1 
                   THEN CASE WHEN jr.machine_id IS NOT NULL OR jr.machine_group_id IS NOT NULL 
                            THEN 1 ELSE 0 END 
                   ELSE 1 END) as first_op_has_machine
        FROM jobs j
        JOIN job_routings jr ON j.id = jr.job_id
        WHERE j.status = 'pending'
        GROUP BY j.id, j.job_number, j.customer_name, j.priority_score, j.status
      )
      SELECT * FROM job_analysis
      WHERE inspect_count > 0 
        AND first_op_has_machine = 1
      ORDER BY priority_score::numeric DESC
      LIMIT 5
    `);
    
    if (result.rows.length === 0) {
      console.log('❌ No schedulable jobs with INSPECT operations found');
      console.log('   All jobs with INSPECT ops appear to have null machine assignments');
      
      // Show some examples of jobs with null assignments
      const nullJobsResult = await pool.query(`
        SELECT DISTINCT j.job_number, jr.operation_number, jr.operation_name,
               jr.machine_id, jr.machine_group_id
        FROM jobs j
        JOIN job_routings jr ON j.id = jr.job_id
        WHERE jr.operation_name ILIKE '%INSPECT%'
          AND jr.machine_id IS NULL 
          AND jr.machine_group_id IS NULL
        LIMIT 5
      `);
      
      console.log('\n📋 Examples of jobs with NULL machine assignments:');
      nullJobsResult.rows.forEach(row => {
        console.log(`   ${row.job_number} Op ${row.operation_number}: ${row.operation_name}`);
        console.log(`     Machine ID: ${row.machine_id}, Group ID: ${row.machine_group_id}`);
      });
      
      return;
    }
    
    console.log(`✅ Found ${result.rows.length} schedulable jobs with INSPECT operations:`);
    result.rows.forEach((job, idx) => {
      console.log(`   ${idx + 1}. ${job.job_number} (${job.customer_name})`);
      console.log(`      Priority: ${job.priority_score}, INSPECT ops: ${job.inspect_count}`);
    });
    
    // Get detailed routing info for the first job
    const selectedJob = result.rows[0];
    console.log(`\n📋 Detailed routing for ${selectedJob.job_number}:`);
    
    const routingResult = await pool.query(`
      SELECT jr.operation_number, jr.operation_name, jr.sequence_order,
             jr.machine_id, m.name as machine_name,
             jr.machine_group_id, mg.name as group_name,
             jr.estimated_hours
      FROM job_routings jr
      LEFT JOIN machines m ON jr.machine_id = m.id
      LEFT JOIN machine_groups mg ON jr.machine_group_id = mg.id
      WHERE jr.job_id = $1
      ORDER BY jr.sequence_order
    `, [selectedJob.id]);
    
    routingResult.rows.forEach(row => {
      console.log(`   Op ${row.operation_number}: ${row.operation_name} (Seq: ${row.sequence_order})`);
      console.log(`     Machine: ${row.machine_name || 'NULL'} (ID: ${row.machine_id || 'NULL'})`);
      console.log(`     Group: ${row.group_name || 'NULL'} (ID: ${row.machine_group_id || 'NULL'})`);
      console.log(`     Hours: ${row.estimated_hours}`);
    });
    
    console.log(`\n🎯 Recommended test job: ${selectedJob.job_number} (ID: ${selectedJob.id})`);
    
  } catch (error) {
    console.error('❌ Search failed:', error.message);
  } finally {
    await pool.end();
  }
}

findSchedulableInspectJob();