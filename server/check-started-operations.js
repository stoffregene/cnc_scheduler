const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function checkStartedOperations() {
  try {
    console.log('=== CHECKING FOR STARTED ("S") OPERATIONS ===\n');
    
    // Check for "S" status operations
    const startedCount = await pool.query(`
      SELECT COUNT(*) as started_count
      FROM job_routings 
      WHERE routing_status = 'S'
    `);
    
    console.log(`Operations with "S" (started) status: ${startedCount.rows[0].started_count}`);
    
    // Check all unique routing_status values more thoroughly
    const allStatuses = await pool.query(`
      SELECT 
        routing_status,
        COUNT(*) as count,
        ARRAY_AGG(DISTINCT j.job_number ORDER BY j.job_number) as sample_jobs
      FROM job_routings jr
      JOIN jobs j ON jr.job_id = j.id
      GROUP BY routing_status
      ORDER BY count DESC
    `);
    
    console.log('\nAll routing status values found:');
    allStatuses.rows.forEach(row => {
      const samples = row.sample_jobs.slice(0, 3).join(', ');
      const more = row.sample_jobs.length > 3 ? ` +${row.sample_jobs.length - 3} more` : '';
      console.log(`  "${row.routing_status}": ${row.count} operations (e.g., jobs: ${samples}${more})`);
    });
    
    // Also check the raw JobBoss data for any other status values
    console.log('\n=== CHECKING RAW JOBBOSS DATA FOR ALL STATUS VALUES ===\n');
    
    const rawDataStatuses = await pool.query(`
      SELECT 
        j.job_boss_data->>'routing_status' as original_status,
        j.job_boss_data->>'status' as job_status,
        COUNT(*) as count,
        ARRAY_AGG(DISTINCT j.job_number ORDER BY j.job_number) as jobs
      FROM jobs j
      WHERE j.job_boss_data IS NOT NULL
      GROUP BY j.job_boss_data->>'routing_status', j.job_boss_data->>'status'
      ORDER BY count DESC
    `);
    
    console.log('Status values in original JobBoss data:');
    rawDataStatuses.rows.forEach(row => {
      const samples = row.jobs.slice(0, 3).join(', ');
      const more = row.jobs.length > 3 ? ` +${row.jobs.length - 3} more` : '';
      console.log(`  Routing: "${row.original_status}", Job: "${row.job_status}" - ${row.count} jobs (${samples}${more})`);
    });
    
    // Check if there are any operations that might have been filtered out
    console.log('\n=== POTENTIAL FILTERING ANALYSIS ===\n');
    
    // Check if we can find evidence of filtering in the parser logic
    const operationsPerJob = await pool.query(`
      SELECT 
        j.job_number,
        COUNT(jr.id) as operation_count,
        j.job_boss_data->>'routing_status' as status,
        ARRAY_AGG(jr.operation_number ORDER BY jr.sequence_order::integer) as operations
      FROM jobs j
      LEFT JOIN job_routings jr ON j.id = jr.job_id
      GROUP BY j.job_number, j.job_boss_data
      ORDER BY operation_count DESC
      LIMIT 10
    `);
    
    console.log('Jobs with most operations (checking for sequence gaps):');
    operationsPerJob.rows.forEach(job => {
      const ops = job.operations ? job.operations.join(', ') : 'NO OPERATIONS';
      console.log(`  Job ${job.job_number}: ${job.operation_count} ops (${ops}) - Status: "${job.status}"`);
    });
    
    // Look for sequence gaps that might indicate filtered operations
    console.log('\n=== CHECKING FOR SEQUENCE GAPS ===\n');
    
    const gapAnalysis = await pool.query(`
      SELECT 
        j.job_number,
        MIN(jr.sequence_order::integer) as min_seq,
        MAX(jr.sequence_order::integer) as max_seq,
        COUNT(jr.id) as actual_count,
        (MAX(jr.sequence_order::integer) - MIN(jr.sequence_order::integer) + 1) as expected_count,
        ARRAY_AGG(jr.sequence_order::integer ORDER BY jr.sequence_order::integer) as sequences
      FROM jobs j
      JOIN job_routings jr ON j.id = jr.job_id
      GROUP BY j.job_number
      HAVING COUNT(jr.id) != (MAX(jr.sequence_order::integer) - MIN(jr.sequence_order::integer) + 1)
      ORDER BY j.job_number
      LIMIT 5
    `);
    
    if (gapAnalysis.rows.length > 0) {
      console.log('Jobs with sequence gaps (possible filtered operations):');
      gapAnalysis.rows.forEach(job => {
        console.log(`  Job ${job.job_number}: sequences ${job.sequences.join(', ')} (${job.actual_count}/${job.expected_count})`);
        console.log(`    Gap suggests operations ${job.min_seq}-${job.max_seq} had some filtered out`);
      });
    } else {
      console.log('✅ No sequence gaps found - all operations appear to be consecutive');
    }
    
    console.log('\n=== CONCLUSION ===');
    console.log('Based on the analysis:');
    if (startedCount.rows[0].started_count === 0) {
      console.log('❌ No "S" (started) operations found in database');
      console.log('   Either:');
      console.log('   1. JobBoss CSV export excluded started operations');
      console.log('   2. Parser filtered out started operations during import');
      console.log('   3. No operations were in "started" status at export time');
    } else {
      console.log('✅ Found started operations - they are included in scheduling');
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
    process.exit();
  }
}

checkStartedOperations();