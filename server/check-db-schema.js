const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:sassysalad@localhost:5432/cnc_scheduler'
});

async function checkSchema() {
  try {
    // Check job_routings columns
    const result = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'job_routings'
      ORDER BY ordinal_position
    `);
    
    console.log('job_routings table columns:');
    result.rows.forEach(row => {
      console.log(`  - ${row.column_name}: ${row.data_type}`);
    });
    
    // Check operations table
    const opsResult = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'operations'
      ORDER BY ordinal_position
    `);
    
    console.log('\noperations table columns:');
    opsResult.rows.forEach(row => {
      console.log(`  - ${row.column_name}: ${row.data_type}`);
    });
    
    // Sample job_routings data
    const sampleData = await pool.query(`
      SELECT jr.*, o.name as operation_name
      FROM job_routings jr
      LEFT JOIN operations o ON jr.operation_type_id = o.id OR jr.operation_name = o.name
      LIMIT 5
    `);
    
    console.log('\nSample job_routings data:');
    console.log(sampleData.rows);
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

checkSchema();