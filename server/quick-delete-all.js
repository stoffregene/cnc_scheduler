const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function quickDeleteAll() {
  try {
    console.log('🗑️ Quick delete all jobs...');
    
    const client = await pool.connect();
    
    await client.query('BEGIN');
    
    // Delete in proper order to avoid foreign key constraints
    console.log('   Deleting schedule slots...');
    const slotsResult = await client.query('DELETE FROM schedule_slots');
    console.log(`   ✅ Deleted ${slotsResult.rowCount} schedule slots`);
    
    console.log('   Deleting scheduling conflicts...');
    const conflictsResult = await client.query('DELETE FROM scheduling_conflicts');
    console.log(`   ✅ Deleted ${conflictsResult.rowCount} scheduling conflicts`);
    
    console.log('   Deleting job dependencies...');
    const depsResult = await client.query('DELETE FROM job_dependencies');
    console.log(`   ✅ Deleted ${depsResult.rowCount} job dependencies`);
    
    console.log('   Deleting job routings...');
    const routingsResult = await client.query('DELETE FROM job_routings');
    console.log(`   ✅ Deleted ${routingsResult.rowCount} job routings`);
    
    console.log('   Deleting jobs...');
    const jobsResult = await client.query('DELETE FROM jobs');
    console.log(`   ✅ Deleted ${jobsResult.rowCount} jobs`);
    
    await client.query('COMMIT');
    
    console.log('✅ All jobs and related data deleted successfully!');
    
    client.release();
    
  } catch (error) {
    console.error('❌ Delete failed:', error.message);
  } finally {
    await pool.end();
  }
}

quickDeleteAll();