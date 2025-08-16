const { Pool } = require('pg');
const path = require('path');

// Load environment variables from project root
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:sassysalad@localhost:5432/cnc_scheduler',
});

async function createAdditionalShippingTests() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    console.log('Creating additional test jobs for awaiting shipping...');
    
    // Test Job 1: Overdue job (due date in the past)
    const job1Result = await client.query(`
      INSERT INTO jobs (
        job_number, customer_name, part_name, part_number, quantity,
        priority, estimated_hours, due_date, promised_date, material, material_size,
        operations, special_instructions, status
      ) VALUES (
        'TEST-SHIP-OVERDUE', 'Urgent Corp', 'Critical Part', 'CP-001', 5,
        9, 6.0, CURRENT_DATE - INTERVAL '2 days', CURRENT_DATE - INTERVAL '1 day', 
        'Stainless Steel', '1" x 3" x 8"',
        ARRAY['SAW', 'HMC', 'INSPECT'], 'Overdue test for awaiting shipping', 'active'
      ) RETURNING id
    `);
    const job1Id = job1Result.rows[0].id;
    
    // Add routings and mark as completed
    await client.query(`
      INSERT INTO job_routings (
        job_id, operation_number, operation_name, sequence_order, estimated_hours, notes, routing_status
      ) VALUES 
      ($1, 10, 'SAW', 1, 2.0, 'Cut to length', 'C'),
      ($1, 20, 'HMC', 2, 3.0, 'Machine part', 'C'),
      ($1, 30, 'INSPECT', 3, 1.0, 'Final inspection', 'C')
    `, [job1Id]);
    
    // Test Job 2: Due today
    const job2Result = await client.query(`
      INSERT INTO jobs (
        job_number, customer_name, part_name, part_number, quantity,
        priority, estimated_hours, due_date, promised_date, material, material_size,
        operations, special_instructions, status
      ) VALUES (
        'TEST-SHIP-TODAY', 'Today Industries', 'Daily Part', 'DP-002', 15,
        6, 4.0, CURRENT_DATE, CURRENT_DATE, 
        'Carbon Steel', '2" x 2" x 4"',
        ARRAY['SAW', 'LATHE'], 'Due today test for awaiting shipping', 'active'
      ) RETURNING id
    `);
    const job2Id = job2Result.rows[0].id;
    
    await client.query(`
      INSERT INTO job_routings (
        job_id, operation_number, operation_name, sequence_order, estimated_hours, notes, routing_status
      ) VALUES 
      ($1, 10, 'SAW', 1, 1.5, 'Cut to length', 'C'),
      ($1, 20, 'LATHE', 2, 2.5, 'Turn part', 'C')
    `, [job2Id]);
    
    // Test Job 3: Not completed (should NOT appear in awaiting shipping)
    const job3Result = await client.query(`
      INSERT INTO jobs (
        job_number, customer_name, part_name, part_number, quantity,
        priority, estimated_hours, due_date, promised_date, material, material_size,
        operations, special_instructions, status
      ) VALUES (
        'TEST-SHIP-INCOMPLETE', 'InProgress Co', 'Unfinished Part', 'UP-003', 25,
        5, 8.0, CURRENT_DATE + INTERVAL '5 days', CURRENT_DATE + INTERVAL '3 days', 
        'Aluminum', '3" x 1" x 6"',
        ARRAY['SAW', 'HMC', 'INSPECT'], 'Incomplete test - should not appear in shipping', 'active'
      ) RETURNING id
    `);
    const job3Id = job3Result.rows[0].id;
    
    // Only complete SAW and HMC, leave INSPECT incomplete
    await client.query(`
      INSERT INTO job_routings (
        job_id, operation_number, operation_name, sequence_order, estimated_hours, notes, routing_status
      ) VALUES 
      ($1, 10, 'SAW', 1, 2.0, 'Cut to length', 'C'),
      ($1, 20, 'HMC', 2, 4.0, 'Machine part', 'C'),
      ($1, 30, 'INSPECT', 3, 2.0, 'Final inspection', NULL)
    `, [job3Id]);
    
    // Test Job 4: Large quantity urgent job
    const job4Result = await client.query(`
      INSERT INTO jobs (
        job_number, customer_name, part_name, part_number, quantity,
        priority, estimated_hours, due_date, promised_date, material, material_size,
        operations, special_instructions, status
      ) VALUES (
        'TEST-SHIP-URGENT', 'Priority Corp', 'High Volume Part', 'HV-004', 100,
        8, 15.0, CURRENT_DATE + INTERVAL '1 day', CURRENT_DATE + INTERVAL '1 day', 
        'Titanium', '1.5" x 1.5" x 10"',
        ARRAY['SAW', 'HMC', 'INSPECT'], 'Large quantity urgent test', 'active'
      ) RETURNING id
    `);
    const job4Id = job4Result.rows[0].id;
    
    await client.query(`
      INSERT INTO job_routings (
        job_id, operation_number, operation_name, sequence_order, estimated_hours, notes, routing_status
      ) VALUES 
      ($1, 10, 'SAW', 1, 4.0, 'Cut to length', 'C'),
      ($1, 20, 'HMC', 2, 8.0, 'Machine part', 'C'),
      ($1, 30, 'INSPECT', 3, 3.0, 'Final inspection', 'C')
    `, [job4Id]);
    
    await client.query('COMMIT');
    
    console.log(`✅ Created TEST-SHIP-OVERDUE (Job ID: ${job1Id}) - OVERDUE for shipping`);
    console.log(`✅ Created TEST-SHIP-TODAY (Job ID: ${job2Id}) - DUE TODAY for shipping`);
    console.log(`✅ Created TEST-SHIP-INCOMPLETE (Job ID: ${job3Id}) - Should NOT appear (incomplete)`);
    console.log(`✅ Created TEST-SHIP-URGENT (Job ID: ${job4Id}) - URGENT high quantity`);
    
    console.log('\nTest Coverage:');
    console.log('- Overdue jobs ✅');
    console.log('- Due today jobs ✅');
    console.log('- Incomplete jobs (should not appear) ✅');
    console.log('- High quantity urgent jobs ✅');
    console.log('- Different materials and operations ✅');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating additional test jobs:', error.message);
    throw error;
  } finally {
    client.release();
  }
}

// Run the script
if (require.main === module) {
  createAdditionalShippingTests()
    .then(() => {
      console.log('\nAdditional test jobs created successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Script failed:', error.message);
      process.exit(1);
    });
}

module.exports = { createAdditionalShippingTests };