const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function checkCompletedOperations() {
  try {
    console.log('=== CHECKING COMPLETED OPERATIONS IN DATABASE ===\n');
    
    // Check if there's a routing_status column in job_routings
    const schemaResult = await pool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns 
      WHERE table_name = 'job_routings'
      ORDER BY ordinal_position
    `);
    
    console.log('job_routings table structure:');
    schemaResult.rows.forEach(col => {
      console.log(`  ${col.column_name}: ${col.data_type}`);
    });
    
    // Check for any routing status data
    const statusCheck = schemaResult.rows.find(col => 
      col.column_name.includes('status') || 
      col.column_name.includes('routing_status') ||
      col.column_name.includes('completed')
    );
    
    if (statusCheck) {
      console.log(`\n✅ Found status column: ${statusCheck.column_name}`);
      
      // Check what status values exist
      const statusValues = await pool.query(`
        SELECT DISTINCT ${statusCheck.column_name} as status_value, COUNT(*) as count
        FROM job_routings 
        WHERE ${statusCheck.column_name} IS NOT NULL
        GROUP BY ${statusCheck.column_name}
        ORDER BY count DESC
      `);
      
      console.log('\nStatus values in database:');
      statusValues.rows.forEach(row => {
        console.log(`  "${row.status_value}": ${row.count} operations`);
      });
      
      // Check for completed status specifically
      const completedCount = await pool.query(`
        SELECT COUNT(*) as completed_count
        FROM job_routings 
        WHERE ${statusCheck.column_name} ILIKE '%C%' OR ${statusCheck.column_name} ILIKE '%completed%'
      `);
      
      console.log(`\nOperations with "C" or "completed" status: ${completedCount.rows[0].completed_count}`);
      
      // Show some examples of completed operations
      if (completedCount.rows[0].completed_count > 0) {
        const examples = await pool.query(`
          SELECT jr.*, j.job_number
          FROM job_routings jr
          JOIN jobs j ON jr.job_id = j.id
          WHERE ${statusCheck.column_name} ILIKE '%C%' OR ${statusCheck.column_name} ILIKE '%completed%'
          LIMIT 5
        `);
        
        console.log('\nExamples of completed operations:');
        examples.rows.forEach(op => {
          console.log(`  Job ${op.job_number}: Op ${op.operation_number} - ${op.operation_name} (status: ${op[statusCheck.column_name]})`);
        });
      }
      
    } else {
      console.log('\n❌ No status/routing_status column found');
      console.log('   The CSV parser might not be storing routing status in the database');
    }
    
    // Check if there's any raw CSV data stored
    const rawDataCheck = await pool.query(`
      SELECT 
        j.job_number,
        j.job_boss_data,
        COUNT(jr.id) as routing_count
      FROM jobs j
      LEFT JOIN job_routings jr ON j.id = jr.job_id
      WHERE j.job_boss_data IS NOT NULL
      GROUP BY j.job_number, j.job_boss_data
      LIMIT 3
    `);
    
    console.log('\n\n=== CHECKING RAW JOBBOSS DATA ===\n');
    rawDataCheck.rows.forEach(job => {
      console.log(`Job ${job.job_number} (${job.routing_count} operations):`);
      if (job.job_boss_data && job.job_boss_data.routing_status) {
        console.log(`  Original routing status: "${job.job_boss_data.routing_status}"`);
      } else {
        console.log(`  No routing status in raw data`);
      }
    });
    
    // Check total jobs vs operations to understand if entire jobs were filtered
    const totals = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM jobs) as total_jobs,
        (SELECT COUNT(*) FROM job_routings) as total_operations,
        (SELECT COUNT(DISTINCT job_id) FROM job_routings) as jobs_with_operations
    `);
    
    const stats = totals.rows[0];
    console.log('\n\n=== SUMMARY ===');
    console.log(`Total jobs in database: ${stats.total_jobs}`);
    console.log(`Total operations in database: ${stats.total_operations}`);
    console.log(`Jobs with operations: ${stats.jobs_with_operations}`);
    console.log(`Jobs without operations: ${stats.total_jobs - stats.jobs_with_operations}`);
    
    if (stats.total_jobs - stats.jobs_with_operations > 0) {
      console.log('\n⚠️  Some jobs have no operations - these might be jobs where all sequences were completed');
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
    process.exit();
  }
}

checkCompletedOperations();