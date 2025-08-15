const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function runJobBossMigration() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL
  });

  try {
    console.log('🏗️  Running JobBoss Fields Migration...\n');
    
    // Read migration file
    const migrationPath = path.join(__dirname, '..', 'database', 'migrations', '008_add_jobboss_fields.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    // Execute migration
    await pool.query(migrationSQL);
    
    console.log('✅ Migration completed successfully!');
    console.log('\n📋 New Features Added:');
    console.log('='.repeat(80));
    console.log('• Added material tracking fields to jobs table');
    console.log('• Added outsourcing fields to job_routings table');
    console.log('• Created vendors table for outsourcing management');
    console.log('• Created material_orders table for material tracking');
    console.log('• Added function: is_job_ready_for_production(job_id)');
    console.log('• Created jobs_awaiting_material view');
    console.log('• Created outsourced_operations_view');
    
    // Test the new functionality
    console.log('\n🧪 Testing New Features:');
    console.log('='.repeat(80));
    
    // Check jobs awaiting material view
    const materialJobsQuery = `SELECT COUNT(*) as count FROM jobs_awaiting_material`;
    const materialJobs = await pool.query(materialJobsQuery);
    console.log(`Jobs Awaiting Material View: ${materialJobs.rows[0].count} rows`);
    
    // Check outsourced operations view
    const outsourcedOpsQuery = `SELECT COUNT(*) as count FROM outsourced_operations_view`;
    const outsourcedOps = await pool.query(outsourcedOpsQuery);
    console.log(`Outsourced Operations View: ${outsourcedOps.rows[0].count} rows`);
    
    // Test production readiness function with an existing job
    const jobReadyQuery = `SELECT * FROM is_job_ready_for_production(1)`;
    const jobReady = await pool.query(jobReadyQuery);
    if (jobReady.rows.length > 0) {
      const ready = jobReady.rows[0];
      console.log(`Production Readiness Test (Job ID 1):`);
      console.log(`  Ready: ${ready.ready_for_production}`);
      console.log(`  Material Status: ${ready.material_status}`);
      console.log(`  Reason: ${ready.blocking_reason || 'N/A'}`);
    }
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error('Error details:', error.stack);
  } finally {
    await pool.end();
  }
}

runJobBossMigration();