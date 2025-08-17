const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:sassysalad@localhost:5432/cnc_scheduler'
});

async function fixRoutingStatusLength() {
  try {
    // Check current routing_status column
    const result = await pool.query(`
      SELECT character_maximum_length 
      FROM information_schema.columns 
      WHERE table_name = 'job_routings' 
      AND column_name = 'routing_status'
    `);
    
    console.log('Current routing_status max length:', result.rows[0]?.character_maximum_length || 'unlimited');
    
    // Extend the column length
    await pool.query(`
      ALTER TABLE job_routings 
      ALTER COLUMN routing_status TYPE VARCHAR(50)
    `);
    
    console.log('✅ Extended routing_status to VARCHAR(50)');
    
    // Verify the change
    const verifyResult = await pool.query(`
      SELECT character_maximum_length 
      FROM information_schema.columns 
      WHERE table_name = 'job_routings' 
      AND column_name = 'routing_status'
    `);
    
    console.log('New routing_status max length:', verifyResult.rows[0]?.character_maximum_length);
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

fixRoutingStatusLength();