const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function debugDateError() {
  try {
    console.log('🔍 Debugging date_part error...\n');
    
    const client = await pool.connect();
    
    // Check the promised_date and order_date column types
    console.log('📊 Checking column types in jobs table...');
    const columnInfo = await client.query(`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'jobs' 
      AND column_name IN ('promised_date', 'order_date')
      ORDER BY column_name;
    `);
    
    console.log('Column info:');
    columnInfo.rows.forEach(row => {
      console.log(`  - ${row.column_name}: ${row.data_type} (nullable: ${row.is_nullable})`);
    });
    
    // Check sample data
    console.log('\n📋 Checking sample data format...');
    const sampleData = await client.query(`
      SELECT job_number, promised_date, order_date, 
             pg_typeof(promised_date) as promised_type,
             pg_typeof(order_date) as order_type
      FROM jobs 
      LIMIT 3;
    `);
    
    console.log('Sample data:');
    sampleData.rows.forEach(row => {
      console.log(`  - Job ${row.job_number}:`);
      console.log(`    promised_date: ${row.promised_date} (${row.promised_type})`);
      console.log(`    order_date: ${row.order_date} (${row.order_type})`);
    });
    
    // Try to directly test the calculate_priority_score function
    console.log('\n🧪 Testing calculate_priority_score function directly...');
    try {
      const testJob = await client.query('SELECT id FROM jobs LIMIT 1');
      if (testJob.rows.length > 0) {
        const result = await client.query('SELECT calculate_priority_score($1) as score', [testJob.rows[0].id]);
        console.log(`✅ Function works! Score: ${result.rows[0].score}`);
      }
    } catch (error) {
      console.log(`❌ Function error: ${error.message}`);
      console.log(`Error detail: ${error.detail || 'No detail'}`);
      console.log(`Error hint: ${error.hint || 'No hint'}`);
    }
    
    // Check if the trigger is the problem
    console.log('\n🔍 Checking trigger function...');
    try {
      // Try inserting a simple job to see if trigger causes the error
      await client.query('BEGIN');
      
      const insertResult = await client.query(`
        INSERT INTO jobs (job_number, customer_name, part_name, quantity, priority, estimated_hours, status)
        VALUES ('TEST123', 'TEST CUSTOMER', 'Test Part', 1, 1, 1.0, 'pending')
        RETURNING id, job_number
      `);
      
      console.log(`✅ Job inserted successfully: ${insertResult.rows[0].job_number}`);
      
      await client.query('ROLLBACK'); // Don't actually save the test job
      
    } catch (error) {
      await client.query('ROLLBACK');
      console.log(`❌ Insert trigger error: ${error.message}`);
      console.log(`Error where: ${error.where || 'No where info'}`);
      console.log(`Error internal query: ${error.internalQuery || 'No internal query'}`);
    }
    
    client.release();
    
  } catch (error) {
    console.error('❌ Debug failed:', error.message);
    console.error(error.stack);
  } finally {
    await pool.end();
  }
}

// Run the debug
debugDateError();