const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function runAssemblyMigration() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL
  });

  try {
    console.log('🏗️  Running Assembly Job Dependencies Migration...\n');
    
    // Read migration file
    const migrationPath = path.join(__dirname, '..', 'database', 'migrations', '007_create_job_dependencies.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    // Execute migration
    await pool.query(migrationSQL);
    
    console.log('✅ Migration completed successfully!');
    console.log('\n📋 New Features Added:');
    console.log('='.repeat(80));
    console.log('• Added job_type, parent_job_id, assembly_sequence, is_assembly_parent to jobs table');
    console.log('• Created job_dependencies table for explicit dependency tracking');
    console.log('• Added function: create_assembly_dependencies(base_job_number)');
    console.log('• Added function: can_job_be_scheduled(job_id)');
    console.log('• Added function: get_job_dependency_tree(job_id)');
    console.log('• Created assembly_jobs_view for easy assembly management');
    
    // Test the new functions
    console.log('\n🧪 Testing Assembly Functions:');
    console.log('='.repeat(80));
    
    // Test can_job_be_scheduled function
    const testScheduleQuery = `
      SELECT * FROM can_job_be_scheduled(1);
    `;
    
    const scheduleTest = await pool.query(testScheduleQuery);
    console.log('Schedule Test for Job ID 1:');
    console.log(`  Can Schedule: ${scheduleTest.rows[0]?.can_schedule}`);
    console.log(`  Blocking Jobs: ${scheduleTest.rows[0]?.blocking_jobs || 'None'}`);
    
    // Show assembly view
    const assemblyViewQuery = `
      SELECT * FROM assembly_jobs_view LIMIT 5;
    `;
    
    const assemblyView = await pool.query(assemblyViewQuery);
    console.log(`\nAssembly Jobs View (${assemblyView.rows.length} rows):`);
    if (assemblyView.rows.length === 0) {
      console.log('  No assembly jobs found yet.');
    } else {
      assemblyView.rows.forEach(assembly => {
        console.log(`  Assembly: ${assembly.assembly_job_number} | Components: ${assembly.total_components} | Progress: ${assembly.completion_percentage}%`);
      });
    }
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error('Error details:', error.stack);
  } finally {
    await pool.end();
  }
}

runAssemblyMigration();