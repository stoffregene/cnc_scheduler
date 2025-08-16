const { Pool } = require('pg');
const path = require('path');

// Load environment variables from project root
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:sassysalad@localhost:5432/cnc_scheduler',
});

async function createSimpleShippingTest() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    console.log('Creating simple test job for awaiting shipping...');
    
    // Create a simple job with all operations marked as completed in the job_routings table
    const job1Result = await client.query(`
      INSERT INTO jobs (
        job_number, customer_name, part_name, part_number, quantity,
        priority, estimated_hours, due_date, promised_date, material, material_size,
        operations, special_instructions, status
      ) VALUES (
        'TEST-SHIP-SIMPLE', 'Test Company', 'Test Part', 'TP-001', 10,
        5, 8.0, CURRENT_DATE + INTERVAL '7 days', CURRENT_DATE + INTERVAL '5 days', 
        'Aluminum', '2" x 2" x 6"',
        ARRAY['SAW', 'HMC', 'INSPECT'], 'Simple test for awaiting shipping', 'active'
      ) RETURNING id
    `);
    const jobId = job1Result.rows[0].id;
    
    // Add simple routings without foreign key constraints
    await client.query(`
      INSERT INTO job_routings (
        job_id, operation_number, operation_name, sequence_order, estimated_hours, notes
      ) VALUES 
      ($1, 10, 'SAW', 1, 2.0, 'Cut to length'),
      ($1, 20, 'HMC', 2, 4.0, 'Machine part'),
      ($1, 30, 'INSPECT', 3, 2.0, 'Final inspection')
    `, [jobId]);
    
    // Mark all routings as completed by setting routing_status to 'C'
    await client.query(`
      UPDATE job_routings 
      SET routing_status = 'C'
      WHERE job_id = $1
    `, [jobId]);
    
    await client.query('COMMIT');
    
    console.log(`✅ Created TEST-SHIP-SIMPLE (Job ID: ${jobId}) with all operations completed`);
    console.log('This job should now appear in awaiting shipping!');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating test job:', error.message);
    throw error;
  } finally {
    client.release();
  }
}

// Run the script
if (require.main === module) {
  createSimpleShippingTest()
    .then(() => {
      console.log('\nScript completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Script failed:', error.message);
      process.exit(1);
    });
}

module.exports = { createSimpleShippingTest };