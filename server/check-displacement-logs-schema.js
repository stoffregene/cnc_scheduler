const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:sassysalad@localhost:5432/cnc_scheduler'
});

async function checkAndFixDisplacementLogs() {
  try {
    // Check current displacement_logs schema
    const result = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'displacement_logs'
      ORDER BY ordinal_position
    `);
    
    console.log('Current displacement_logs columns:');
    if (result.rows.length === 0) {
      console.log('  Table does not exist');
    } else {
      result.rows.forEach(row => {
        console.log(`  - ${row.column_name}: ${row.data_type}`);
      });
    }
    
    // Add missing columns
    console.log('\nAdding missing columns...');
    
    // Add trigger_type if missing
    try {
      await pool.query(`
        ALTER TABLE displacement_logs 
        ADD COLUMN IF NOT EXISTS trigger_type VARCHAR(100)
      `);
      console.log('✅ Added trigger_type column');
    } catch (error) {
      console.log('trigger_type column already exists or error:', error.message);
    }
    
    // Add trigger_details if missing
    try {
      await pool.query(`
        ALTER TABLE displacement_logs 
        ADD COLUMN IF NOT EXISTS trigger_details JSONB
      `);
      console.log('✅ Added trigger_details column');
    } catch (error) {
      console.log('trigger_details column already exists or error:', error.message);
    }
    
    // Add execution_status if missing
    try {
      await pool.query(`
        ALTER TABLE displacement_logs 
        ADD COLUMN IF NOT EXISTS execution_status VARCHAR(50) DEFAULT 'pending'
      `);
      console.log('✅ Added execution_status column');
    } catch (error) {
      console.log('execution_status column already exists or error:', error.message);
    }
    
    // Add affected_jobs if missing
    try {
      await pool.query(`
        ALTER TABLE displacement_logs 
        ADD COLUMN IF NOT EXISTS affected_jobs INTEGER DEFAULT 0
      `);
      console.log('✅ Added affected_jobs column');
    } catch (error) {
      console.log('affected_jobs column already exists or error:', error.message);
    }
    
    // Add execution_details if missing
    try {
      await pool.query(`
        ALTER TABLE displacement_logs 
        ADD COLUMN IF NOT EXISTS execution_details JSONB
      `);
      console.log('✅ Added execution_details column');
    } catch (error) {
      console.log('execution_details column already exists or error:', error.message);
    }
    
    // Add completed_at if missing
    try {
      await pool.query(`
        ALTER TABLE displacement_logs 
        ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP
      `);
      console.log('✅ Added completed_at column');
    } catch (error) {
      console.log('completed_at column already exists or error:', error.message);
    }
    
    // Check final schema
    const finalResult = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'displacement_logs'
      ORDER BY ordinal_position
    `);
    
    console.log('\nFinal displacement_logs schema:');
    finalResult.rows.forEach(row => {
      console.log(`  - ${row.column_name}: ${row.data_type}`);
    });
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

checkAndFixDisplacementLogs();