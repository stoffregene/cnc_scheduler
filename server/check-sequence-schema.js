const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function checkSchema() {
  try {
    // Check job_routings structure for sequence data
    const routingSchema = await pool.query(`
      SELECT column_name, data_type, column_default 
      FROM information_schema.columns 
      WHERE table_name = 'job_routings'
      ORDER BY ordinal_position
    `);
    
    console.log('job_routings schema:');
    routingSchema.rows.forEach(row => {
      console.log(`  ${row.column_name}: ${row.data_type}`);
    });

    // Check for sequence-related columns
    const sequenceColumns = await pool.query(`
      SELECT jr.operation_number, jr.operation_name, jr.sequence_order
      FROM job_routings jr 
      WHERE jr.job_id = 1 
      ORDER BY jr.sequence_order, jr.operation_number
      LIMIT 10
    `);
    
    console.log('\nSample job routings with sequence info:');
    sequenceColumns.rows.forEach(row => {
      console.log(`  Op ${row.operation_number}: ${row.operation_name}, seq: ${row.sequence_order}`);
    });

    // Check actual schedule_slots to understand current sequence patterns
    const slotSequences = await pool.query(`
      SELECT 
        ss.id, ss.job_id, j.job_number,
        jr.operation_number, jr.operation_name, 
        jr.sequence_order,
        ss.start_datetime
      FROM schedule_slots ss
      JOIN jobs j ON ss.job_id = j.id
      JOIN job_routings jr ON ss.job_routing_id = jr.id
      WHERE j.id IN (1, 2)
      ORDER BY ss.job_id, jr.sequence_order, jr.operation_number
      LIMIT 15
    `);
    
    console.log('\nCurrent scheduled slots with sequence:');
    slotSequences.rows.forEach(row => {
      console.log(`  Job ${row.job_number} - Op ${row.operation_number} (${row.operation_name}) - Seq: ${row.sequence_order} - ${row.start_datetime}`);
    });
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

checkSchema();