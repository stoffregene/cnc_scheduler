const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5732/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function checkMachines() {
  try {
    console.log('🏭 Available Machines in Database:');
    
    // First check schema
    const schemaResult = await pool.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'machines' 
      ORDER BY ordinal_position
    `);
    console.log('  Columns:', schemaResult.rows.map(r => r.column_name).join(', '));
    
    const result = await pool.query('SELECT * FROM machines ORDER BY name LIMIT 10');
    
    result.rows.forEach(m => {
      console.log(`  ${m.id}: ${m.name}`);
    });
    
    console.log('\n📋 Sample CSV AMT Workcenters from failed jobs:');
    const csvSample = await pool.query(`
      SELECT DISTINCT jr.operation_name, COUNT(*) as usage_count
      FROM job_routings jr
      JOIN jobs j ON jr.job_id = j.id
      WHERE j.auto_scheduled = false OR j.auto_scheduled IS NULL
      GROUP BY jr.operation_name
      ORDER BY usage_count DESC
      LIMIT 10
    `);
    
    csvSample.rows.forEach(op => {
      console.log(`  "${op.operation_name}": used ${op.usage_count} times`);
    });
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

checkMachines();