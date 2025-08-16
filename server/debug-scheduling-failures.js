const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5732/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function debugSchedulingFailures() {
  try {
    console.log('🔍 Debugging Scheduling Failures...\n');
    
    // 1. Analyze failure patterns
    console.log('📊 Failure Analysis:');
    const failureAnalysisResult = await pool.query(`
      SELECT 
        'NULL machine assignments' as failure_reason,
        COUNT(*) as job_count,
        COUNT(*) * 100.0 / (SELECT COUNT(*) FROM jobs WHERE auto_scheduled = false OR auto_scheduled IS NULL) as percentage
      FROM jobs j
      JOIN job_routings jr ON j.id = jr.job_id
      WHERE (j.auto_scheduled = false OR j.auto_scheduled IS NULL)
        AND jr.machine_id IS NULL 
        AND jr.machine_group_id IS NULL
      
      UNION ALL
      
      SELECT 
        'Has machine assignments' as failure_reason,
        COUNT(DISTINCT j.id) as job_count,
        COUNT(DISTINCT j.id) * 100.0 / (SELECT COUNT(*) FROM jobs WHERE auto_scheduled = false OR auto_scheduled IS NULL) as percentage
      FROM jobs j
      JOIN job_routings jr ON j.id = jr.job_id
      WHERE (j.auto_scheduled = false OR j.auto_scheduled IS NULL)
        AND (jr.machine_id IS NOT NULL OR jr.machine_group_id IS NOT NULL)
    `);
    
    failureAnalysisResult.rows.forEach(row => {
      console.log(`   ${row.failure_reason}: ${row.job_count} jobs (${parseFloat(row.percentage).toFixed(1)}%)`);
    });
    
    // 2. Check if any jobs have proper machine assignments but still failed
    console.log('\n🎯 Jobs with Machine Assignments That Still Failed:');
    const properMachineJobsResult = await pool.query(`
      SELECT DISTINCT j.job_number, j.customer_name, j.status,
             COUNT(jr.id) as total_ops,
             COUNT(*) FILTER (WHERE jr.machine_id IS NOT NULL OR jr.machine_group_id IS NOT NULL) as assigned_ops,
             COUNT(*) FILTER (WHERE jr.machine_id IS NULL AND jr.machine_group_id IS NULL) as null_ops
      FROM jobs j
      JOIN job_routings jr ON j.id = jr.job_id
      WHERE (j.auto_scheduled = false OR j.auto_scheduled IS NULL)
      GROUP BY j.id, j.job_number, j.customer_name, j.status
      HAVING COUNT(*) FILTER (WHERE jr.machine_id IS NOT NULL OR jr.machine_group_id IS NOT NULL) > 0
      ORDER BY assigned_ops DESC
      LIMIT 10
    `);
    
    if (properMachineJobsResult.rows.length > 0) {
      console.log('   Found jobs with some machine assignments that failed:');
      properMachineJobsResult.rows.forEach(job => {
        console.log(`   ${job.job_number} (${job.customer_name}): ${job.assigned_ops}/${job.total_ops} ops have machines`);
      });
    } else {
      console.log('   ✅ All failed jobs have NULL machine assignments (expected)');
    }
    
    // 3. Test manual scheduling of a failed job to see detailed error
    console.log('\n🧪 Testing Manual Schedule of Failed Job:');
    const sampleFailedJob = await pool.query(`
      SELECT j.id, j.job_number, j.customer_name
      FROM jobs j
      WHERE (j.auto_scheduled = false OR j.auto_scheduled IS NULL)
      ORDER BY j.job_number
      LIMIT 1
    `);
    
    if (sampleFailedJob.rows.length > 0) {
      const job = sampleFailedJob.rows[0];
      console.log(`   Testing job: ${job.job_number} (${job.customer_name})`);
      
      // Try to schedule it manually via API call to see the exact error
      const axios = require('axios');
      try {
        const response = await axios.post(`http://localhost:5000/api/scheduling/schedule-job/${job.id}`);
        console.log(`   ✅ Unexpected success: ${JSON.stringify(response.data)}`);
      } catch (error) {
        if (error.response) {
          console.log(`   ❌ Expected failure: ${error.response.data.error}`);
          console.log(`   📋 Detailed error: ${JSON.stringify(error.response.data)}`);
        } else {
          console.log(`   ❌ Network error: ${error.message}`);
        }
      }
    }
    
    // 4. Machine availability check
    console.log('\n🏭 Machine Availability Check:');
    const machineResult = await pool.query(`
      SELECT COUNT(*) as total_machines,
             COUNT(*) FILTER (WHERE active = true) as active_machines
      FROM machines
    `);
    
    console.log(`   Total machines: ${machineResult.rows[0].total_machines}`);
    console.log(`   Active machines: ${machineResult.rows[0].active_machines}`);
    
    // 5. Sample machine assignments for successful jobs
    console.log('\n✅ Machine Assignments in Successful Jobs:');
    const successfulMachinesResult = await pool.query(`
      SELECT DISTINCT m.name as machine_name, m.machine_group_id,
             COUNT(*) as usage_count
      FROM schedule_slots ss
      JOIN machines m ON ss.machine_id = m.id
      GROUP BY m.id, m.name, m.machine_group_id
      ORDER BY usage_count DESC
      LIMIT 5
    `);
    
    successfulMachinesResult.rows.forEach(machine => {
      console.log(`   ${machine.machine_name} (Group: ${machine.machine_group_id}): ${machine.usage_count} slots`);
    });
    
    console.log('\n🎯 RECOMMENDATION: The main issue is NULL machine assignments in CSV import.');
    console.log('   💡 Solution: Fix CSV parser to properly assign machine_id/machine_group_id based on operation names.');
    
  } catch (error) {
    console.error('Error debugging failures:', error);
  } finally {
    await pool.end();
  }
}

debugSchedulingFailures();