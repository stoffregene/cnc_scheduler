const { Pool } = require('pg');
const path = require('path');

// Load environment variables from project root
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:sassysalad@localhost:5432/cnc_scheduler',
});

async function createAwaitingShippingTestJobs() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    console.log('Creating test jobs for awaiting shipping functionality...');
    
    // Test Job 1: All operations completed, should appear in awaiting shipping
    const job1Result = await client.query(`
      INSERT INTO jobs (
        job_number, customer_name, part_name, part_number, quantity,
        priority, estimated_hours, due_date, promised_date, material, material_size,
        operations, special_instructions, status
      ) VALUES (
        'TEST-SHIP-001', 'ACME Corp', 'Test Widget A', 'TW-001', 50,
        5, 8.5, CURRENT_DATE + INTERVAL '7 days', CURRENT_DATE + INTERVAL '5 days', 
        'Aluminum 6061', '2" x 4" x 12"',
        ARRAY['SAW', 'HMC', 'INSPECT'], 'Test job for awaiting shipping', 'active'
      ) RETURNING id
    `);
    const job1Id = job1Result.rows[0].id;
    
    // Add routings for job 1
    await client.query(`
      INSERT INTO job_routings (
        job_id, operation_number, operation_name, machine_id, machine_group_id,
        sequence_order, estimated_hours, notes
      ) VALUES 
      ($1, 10, 'SAW', 4, NULL, 1, 2.0, 'Cut to length'),
      ($1, 20, 'HMC', 3, NULL, 2, 4.5, 'Machine part'),
      ($1, 30, 'INSPECT', 5, NULL, 3, 2.0, 'Final inspection')
    `, [job1Id]);
    
    // Mark all operations as completed by creating schedule slots with completed status
    const completedDate = new Date();
    completedDate.setDate(completedDate.getDate() - 1); // Yesterday
    
    // SAW operation (completed)
    await client.query(`
      INSERT INTO schedule_slots (
        job_id, job_routing_id, machine_id, employee_id, start_datetime, end_datetime, 
        duration_minutes, status, slot_date, sequence_order
      ) VALUES (
        $1, 
        (SELECT id FROM job_routings WHERE job_id = $1 AND operation_number = 10),
        4, 9, $2, $3, 120, 'completed', 
        $4::date, 1
      )
    `, [job1Id, completedDate.toISOString(), new Date(completedDate.getTime() + 2*60*60*1000).toISOString(), completedDate.toISOString().split('T')[0]]);
    
    // HMC operation (completed)
    const hmcStart = new Date(completedDate.getTime() + 3*60*60*1000);
    const hmcEnd = new Date(hmcStart.getTime() + 4.5*60*60*1000);
    await client.query(`
      INSERT INTO schedule_slots (
        job_id, routing_id, machine_id, employee_id, start_time, end_time, 
        duration_hours, status, day_of_week, day_date, chunk_index, total_chunks
      ) VALUES (
        $1, 
        (SELECT id FROM job_routings WHERE job_id = $1 AND operation_number = 20),
        3, 10, $2, $3, 4.5, 'completed', 
        EXTRACT(dow FROM $2::date), $2::date, 1, 1
      )
    `, [job1Id, hmcStart.toISOString(), hmcEnd.toISOString()]);
    
    // INSPECT operation (completed)
    const inspectStart = new Date(hmcEnd.getTime() + 1*60*60*1000);
    const inspectEnd = new Date(inspectStart.getTime() + 2*60*60*1000);
    await client.query(`
      INSERT INTO schedule_slots (
        job_id, routing_id, machine_id, employee_id, start_time, end_time, 
        duration_hours, status, day_of_week, day_date, chunk_index, total_chunks
      ) VALUES (
        $1, 
        (SELECT id FROM job_routings WHERE job_id = $1 AND operation_number = 30),
        5, 11, $2, $3, 2.0, 'completed', 
        EXTRACT(dow FROM $2::date), $2::date, 1, 1
      )
    `, [job1Id, inspectStart.toISOString(), inspectEnd.toISOString()]);
    
    console.log(`✅ Created TEST-SHIP-001 (Job ID: ${job1Id}) - All operations completed`);
    
    // Test Job 2: Some operations completed, should NOT appear in awaiting shipping
    const job2Result = await client.query(`
      INSERT INTO jobs (
        job_number, customer_name, part_name, part_number, quantity,
        priority, estimated_hours, due_date, promised_date, material, material_size,
        operations, special_instructions, status
      ) VALUES (
        'TEST-SHIP-002', 'Beta Industries', 'Test Widget B', 'TW-002', 25,
        5, 6.0, CURRENT_DATE + INTERVAL '10 days', CURRENT_DATE + INTERVAL '8 days', 
        'Steel 1018', '3" x 3" x 6"',
        ARRAY['SAW', 'HMC', 'INSPECT'], 'Test job for partial completion', 'active'
      ) RETURNING id
    `);
    const job2Id = job2Result.rows[0].id;
    
    // Add routings for job 2
    await client.query(`
      INSERT INTO job_routings (
        job_id, operation_number, operation_name, machine_id, machine_group_id,
        sequence_order, estimated_hours, notes
      ) VALUES 
      ($1, 10, 'SAW', 4, NULL, 1, 1.5, 'Cut to length'),
      ($1, 20, 'HMC', 3, NULL, 2, 3.0, 'Machine part'),
      ($1, 30, 'INSPECT', 5, NULL, 3, 1.5, 'Final inspection')
    `, [job2Id]);
    
    // Mark only SAW and HMC as completed (INSPECT still pending)
    await client.query(`
      INSERT INTO schedule_slots (
        job_id, routing_id, machine_id, employee_id, start_time, end_time, 
        duration_hours, status, day_of_week, day_date, chunk_index, total_chunks
      ) VALUES (
        $1, 
        (SELECT id FROM job_routings WHERE job_id = $1 AND operation_number = 10),
        4, 9, $2, $3, 1.5, 'completed', 
        EXTRACT(dow FROM $2::date), $2::date, 1, 1
      )
    `, [job2Id, completedDate.toISOString(), new Date(completedDate.getTime() + 1.5*60*60*1000).toISOString()]);
    
    const hmcStart2 = new Date(completedDate.getTime() + 2*60*60*1000);
    const hmcEnd2 = new Date(hmcStart2.getTime() + 3*60*60*1000);
    await client.query(`
      INSERT INTO schedule_slots (
        job_id, routing_id, machine_id, employee_id, start_time, end_time, 
        duration_hours, status, day_of_week, day_date, chunk_index, total_chunks
      ) VALUES (
        $1, 
        (SELECT id FROM job_routings WHERE job_id = $1 AND operation_number = 20),
        3, 10, $2, $3, 3.0, 'completed', 
        EXTRACT(dow FROM $2::date), $2::date, 1, 1
      )
    `, [job2Id, hmcStart2.toISOString(), hmcEnd2.toISOString()]);
    
    console.log(`✅ Created TEST-SHIP-002 (Job ID: ${job2Id}) - SAW and HMC completed, INSPECT pending`);
    
    // Test Job 3: All operations completed but job is closed/shipped, should NOT appear
    const job3Result = await client.query(`
      INSERT INTO jobs (
        job_number, customer_name, part_name, part_number, quantity,
        priority, estimated_hours, due_date, promised_date, material, material_size,
        operations, special_instructions, status
      ) VALUES (
        'TEST-SHIP-003', 'Gamma Corp', 'Test Widget C', 'TW-003', 100,
        5, 10.0, CURRENT_DATE - INTERVAL '2 days', CURRENT_DATE - INTERVAL '5 days', 
        'Brass C360', '1.5" x 2" x 8"',
        ARRAY['SAW', 'HMC', 'INSPECT'], 'Test job for closed status', 'closed'
      ) RETURNING id
    `);
    const job3Id = job3Result.rows[0].id;
    
    // Add routings for job 3
    await client.query(`
      INSERT INTO job_routings (
        job_id, operation_number, operation_name, machine_id, machine_group_id,
        sequence_order, estimated_hours, notes
      ) VALUES 
      ($1, 10, 'SAW', 4, NULL, 1, 2.5, 'Cut to length'),
      ($1, 20, 'HMC', 3, NULL, 2, 5.0, 'Machine part'),
      ($1, 30, 'INSPECT', 5, NULL, 3, 2.5, 'Final inspection')
    `, [job3Id]);
    
    // Mark all operations as completed
    const earlierDate = new Date();
    earlierDate.setDate(earlierDate.getDate() - 3); // 3 days ago
    
    await client.query(`
      INSERT INTO schedule_slots (
        job_id, routing_id, machine_id, employee_id, start_time, end_time, 
        duration_hours, status, day_of_week, day_date, chunk_index, total_chunks
      ) VALUES 
      ($1, 
       (SELECT id FROM job_routings WHERE job_id = $1 AND operation_number = 10),
       4, 9, $2, $3, 2.5, 'completed', 
       EXTRACT(dow FROM $2::date), $2::date, 1, 1),
      ($1, 
       (SELECT id FROM job_routings WHERE job_id = $1 AND operation_number = 20),
       3, 10, $4, $5, 5.0, 'completed', 
       EXTRACT(dow FROM $4::date), $4::date, 1, 1),
      ($1, 
       (SELECT id FROM job_routings WHERE job_id = $1 AND operation_number = 30),
       5, 11, $6, $7, 2.5, 'completed', 
       EXTRACT(dow FROM $6::date), $6::date, 1, 1)
    `, [
      job3Id, 
      earlierDate.toISOString(), new Date(earlierDate.getTime() + 2.5*60*60*1000).toISOString(),
      new Date(earlierDate.getTime() + 3*60*60*1000).toISOString(), new Date(earlierDate.getTime() + 8*60*60*1000).toISOString(),
      new Date(earlierDate.getTime() + 9*60*60*1000).toISOString(), new Date(earlierDate.getTime() + 11.5*60*60*1000).toISOString()
    ]);
    
    console.log(`✅ Created TEST-SHIP-003 (Job ID: ${job3Id}) - All operations completed but job closed`);
    
    // Test Job 4: Overdue and awaiting shipping
    const job4Result = await client.query(`
      INSERT INTO jobs (
        job_number, customer_name, part_name, part_number, quantity,
        priority, estimated_hours, due_date, promised_date, material, material_size,
        operations, special_instructions, status
      ) VALUES (
        'TEST-SHIP-004', 'Delta Systems', 'Test Widget D', 'TW-004', 75,
        7, 12.0, CURRENT_DATE - INTERVAL '3 days', CURRENT_DATE - INTERVAL '1 day', 
        'Stainless 316', '4" x 4" x 10"',
        ARRAY['SAW', 'HMC', 'INSPECT'], 'Test job for overdue awaiting shipping', 'active'
      ) RETURNING id
    `);
    const job4Id = job4Result.rows[0].id;
    
    // Add routings for job 4
    await client.query(`
      INSERT INTO job_routings (
        job_id, operation_number, operation_name, machine_id, machine_group_id,
        sequence_order, estimated_hours, notes
      ) VALUES 
      ($1, 10, 'SAW', 4, NULL, 1, 3.0, 'Cut to length'),
      ($1, 20, 'HMC', 3, NULL, 2, 6.0, 'Machine part'),
      ($1, 30, 'INSPECT', 5, NULL, 3, 3.0, 'Final inspection')
    `, [job4Id]);
    
    // Mark all operations as completed
    await client.query(`
      INSERT INTO schedule_slots (
        job_id, routing_id, machine_id, employee_id, start_time, end_time, 
        duration_hours, status, day_of_week, day_date, chunk_index, total_chunks
      ) VALUES 
      ($1, 
       (SELECT id FROM job_routings WHERE job_id = $1 AND operation_number = 10),
       4, 9, $2, $3, 3.0, 'completed', 
       EXTRACT(dow FROM $2::date), $2::date, 1, 1),
      ($1, 
       (SELECT id FROM job_routings WHERE job_id = $1 AND operation_number = 20),
       3, 10, $4, $5, 6.0, 'completed', 
       EXTRACT(dow FROM $4::date), $4::date, 1, 1),
      ($1, 
       (SELECT id FROM job_routings WHERE job_id = $1 AND operation_number = 30),
       5, 11, $6, $7, 3.0, 'completed', 
       EXTRACT(dow FROM $6::date), $6::date, 1, 1)
    `, [
      job4Id, 
      completedDate.toISOString(), new Date(completedDate.getTime() + 3*60*60*1000).toISOString(),
      new Date(completedDate.getTime() + 4*60*60*1000).toISOString(), new Date(completedDate.getTime() + 10*60*60*1000).toISOString(),
      new Date(completedDate.getTime() + 11*60*60*1000).toISOString(), new Date(completedDate.getTime() + 14*60*60*1000).toISOString()
    ]);
    
    console.log(`✅ Created TEST-SHIP-004 (Job ID: ${job4Id}) - All operations completed, OVERDUE for shipping`);
    
    await client.query('COMMIT');
    
    console.log('\n🎉 Successfully created awaiting shipping test jobs!');
    console.log('\nTest Scenarios:');
    console.log('- TEST-SHIP-001: Should appear in awaiting shipping (all ops complete, active job)');
    console.log('- TEST-SHIP-002: Should NOT appear (INSPECT operation still pending)');
    console.log('- TEST-SHIP-003: Should NOT appear (job status is closed)');
    console.log('- TEST-SHIP-004: Should appear in awaiting shipping AND be marked as overdue');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating test jobs:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Run the script
if (require.main === module) {
  createAwaitingShippingTestJobs()
    .then(() => {
      console.log('\nScript completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Script failed:', error);
      process.exit(1);
    });
}

module.exports = { createAwaitingShippingTestJobs };