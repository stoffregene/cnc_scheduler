const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function checkChunkPattern() {
  try {
    const chunkOps = await pool.query(`
      SELECT 
        jr.job_id, j.job_number,
        jr.operation_number, jr.operation_name, jr.sequence_order,
        COUNT(*) OVER (PARTITION BY jr.job_id, jr.sequence_order) as ops_in_sequence
      FROM job_routings jr
      JOIN jobs j ON jr.job_id = j.id
      ORDER BY jr.job_id, jr.sequence_order, jr.operation_number
      LIMIT 20
    `);
    
    console.log('Operations grouped by sequence (looking for chunk patterns):');
    chunkOps.rows.forEach(row => {
      console.log(`Job ${row.job_number} - Op ${row.operation_number} (${row.operation_name}) - Seq: ${row.sequence_order} - Count in seq: ${row.ops_in_sequence}`);
    });
    
    // Also look for operations that mention "chunk" in names
    const chunkByName = await pool.query(`
      SELECT 
        jr.job_id, j.job_number, jr.operation_number, jr.operation_name, jr.sequence_order
      FROM job_routings jr
      JOIN jobs j ON jr.job_id = j.id
      WHERE LOWER(jr.operation_name) LIKE '%chunk%'
         OR LOWER(jr.operation_number) LIKE '%chunk%'
      ORDER BY jr.job_id, jr.sequence_order
    `);
    
    console.log('\nOperations with "chunk" in name:');
    chunkByName.rows.forEach(row => {
      console.log(`Job ${row.job_number} - Op ${row.operation_number} (${row.operation_name}) - Seq: ${row.sequence_order}`);
    });
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

checkChunkPattern();