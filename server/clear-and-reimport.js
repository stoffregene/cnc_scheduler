const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');
const csv = require('csv-parser');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// Import the existing CSV parser
const JobBossCSVParserV2 = require('./services/jobbossCSVParserV2');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5732/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function clearAllJobsAndReimport() {
  const client = await pool.connect();
  
  try {
    console.log('🧹 Starting database cleanup and CSV reimport...\n');
    
    // Step 1: Clear all job-related data in correct order to handle foreign keys
    console.log('📋 Step 1: Clearing existing job data...');
    
    await client.query('BEGIN');
    
    // Clear in dependency order - all tables that reference jobs
    console.log('   Clearing schedule slots...');
    await client.query('DELETE FROM schedule_slots');
    
    console.log('   Clearing scheduling conflicts...');
    await client.query('DELETE FROM scheduling_conflicts');
    
    console.log('   Clearing inspection queue...');
    await client.query('DELETE FROM inspection_queue');
    
    console.log('   Clearing undo schedule snapshots...');
    await client.query('DELETE FROM undo_schedule_snapshots');
    
    console.log('   Clearing undo operations...');
    await client.query('DELETE FROM undo_operations');
    
    console.log('   Clearing displacement logs...');
    await client.query('DELETE FROM displacement_logs');
    
    console.log('   Clearing displacement details...');
    await client.query('DELETE FROM displacement_details');
    
    console.log('   Clearing job routings...');
    await client.query('DELETE FROM job_routings');
    
    console.log('   Clearing jobs...');
    await client.query('DELETE FROM jobs');
    
    // Reset sequences
    console.log('   Resetting ID sequences...');
    const sequences = [
      'jobs_id_seq',
      'job_routings_id_seq', 
      'schedule_slots_id_seq',
      'inspection_queue_id_seq',
      'scheduling_conflicts_id_seq',
      'undo_operations_id_seq',
      'undo_schedule_snapshots_id_seq',
      'displacement_logs_id_seq',
      'displacement_details_id_seq'
    ];
    
    for (const sequence of sequences) {
      try {
        await client.query(`ALTER SEQUENCE ${sequence} RESTART WITH 1`);
      } catch (err) {
        // Sequence might not exist, that's okay
        console.log(`   Note: ${sequence} not found (table may not exist)`);
      }
    }
    
    await client.query('COMMIT');
    console.log('   ✅ Database cleared successfully\n');
    
    // Step 2: Find and read the most recent CSV file
    console.log('📁 Step 2: Reading CSV file...');
    const csvFilePath = path.join(__dirname, 'uploads', 'e0c11a68e7ed5ad316e7a2c96c1e8d8c');
    
    if (!fs.existsSync(csvFilePath)) {
      throw new Error(`CSV file not found: ${csvFilePath}`);
    }
    
    console.log(`   Found CSV file: ${csvFilePath}`);
    const csvData = fs.readFileSync(csvFilePath, 'utf8');
    console.log(`   CSV file size: ${(csvData.length / 1024).toFixed(1)} KB\n`);
    
    // Step 3: Parse and import CSV data
    console.log('🔄 Step 3: Parsing and importing CSV data...');
    
    const parser = new JobBossCSVParserV2(pool);
    const parsedData = await parser.parseCSV(csvFilePath);
    
    console.log(`   Parsed ${parsedData.jobs.length} jobs and ${parsedData.routings.length} routing lines`);
    
    // Simple manual insertion 
    let jobsImported = 0;
    let operationsImported = 0;
    const errors = [];
    
    // Filter out pick orders and get manufacturing jobs only
    const manufacturingJobs = parsedData.jobs.filter(job => !job.is_pick_order);
    console.log(`   Processing ${manufacturingJobs.length} manufacturing jobs (excluding pick orders)`);
    
    for (const job of manufacturingJobs) {
      try {
        // Insert job
        const jobResult = await client.query(`
          INSERT INTO jobs (
            job_number, customer_name, part_name, quantity,
            order_date, promised_date, priority_score, status,
            estimated_hours, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
          RETURNING id
        `, [
          job.job_number,
          job.customer_name,
          job.part_name || job.part_description,
          job.make_qty || job.quantity || 1,
          job.order_date,
          job.promised_date,
          job.priority_score || 100,
          job.status || 'pending',
          job.total_estimated_hours || 0
        ]);
        
        const jobId = jobResult.rows[0].id;
        jobsImported++;
        
        // Insert routings for this job
        const jobRoutings = parsedData.routings.filter(r => r.job_number === job.job_number);
        for (const routing of jobRoutings) {
          await client.query(`
            INSERT INTO job_routings (
              job_id, operation_number, operation_name, 
              sequence_order, estimated_hours, machine_id, machine_group_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
          `, [
            jobId,
            routing.operation_number,
            routing.operation_name,
            routing.sequence_order || 1,
            routing.estimated_hours || 0,
            routing.machine_id,
            routing.machine_group_id
          ]);
          operationsImported++;
        }
        
      } catch (error) {
        errors.push({ job: job.job_number, error: error.message });
        console.log(`   ❌ Error importing ${job.job_number}: ${error.message}`);
      }
    }
    
    console.log('\n📊 Import Results:');
    console.log(`   ✅ Jobs imported: ${jobsImported}`);
    console.log(`   ✅ Operations imported: ${operationsImported}`);
    console.log(`   ❌ Errors: ${errors.length}`);
    
    // Step 4: Verify the import
    console.log('\n🔍 Step 4: Verifying import...');
    
    const verificationQueries = [
      { name: 'Total Jobs', query: 'SELECT COUNT(*) as count FROM jobs' },
      { name: 'Active Jobs', query: "SELECT COUNT(*) as count FROM jobs WHERE status = 'pending'" },
      { name: 'Completed Jobs', query: "SELECT COUNT(*) as count FROM jobs WHERE status = 'completed'" },
      { name: 'Total Operations', query: 'SELECT COUNT(*) as count FROM job_routings' },
      { name: 'Operations with NULL machines', query: 'SELECT COUNT(*) as count FROM job_routings WHERE machine_id IS NULL AND machine_group_id IS NULL' },
      { name: 'INSPECT Operations', query: "SELECT COUNT(*) as count FROM job_routings WHERE operation_name ILIKE '%INSPECT%'" }
    ];
    
    for (const verification of verificationQueries) {
      const result = await client.query(verification.query);
      console.log(`   ${verification.name}: ${result.rows[0].count}`);
    }
    
    // Step 5: Sample some job data
    console.log('\n📋 Step 5: Sample imported data...');
    const sampleQuery = `
      SELECT j.job_number, j.customer_name, j.status, j.priority_score,
             COUNT(jr.id) as operation_count
      FROM jobs j
      LEFT JOIN job_routings jr ON j.id = jr.job_id
      GROUP BY j.id, j.job_number, j.customer_name, j.status, j.priority_score
      ORDER BY j.priority_score::numeric DESC
      LIMIT 5
    `;
    
    const sampleResult = await client.query(sampleQuery);
    console.log('   Top 5 priority jobs imported:');
    sampleResult.rows.forEach((job, idx) => {
      console.log(`     ${idx + 1}. ${job.job_number} (${job.customer_name}) - Priority: ${job.priority_score}, Ops: ${job.operation_count}, Status: ${job.status}`);
    });
    
    console.log('\n✅ CLEAR AND REIMPORT COMPLETED SUCCESSFULLY!');
    console.log('🎯 Database is now ready for fresh testing with clean data');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error during clear and reimport:', error.message);
    console.error('   Details:', error.stack);
    throw error;
  } finally {
    client.release();
  }
}

// Run the clear and reimport
clearAllJobsAndReimport()
  .then(() => {
    console.log('\n🚀 Ready to proceed with schedule all testing!');
    process.exit(0);
  })
  .catch(error => {
    console.error('Clear and reimport failed:', error);
    process.exit(1);
  });