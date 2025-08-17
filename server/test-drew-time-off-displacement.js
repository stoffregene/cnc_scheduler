const { Pool } = require('pg');
const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:sassysalad@localhost:5432/cnc_scheduler'
});

const API_BASE = 'http://localhost:5000/api';

async function testTimeOffDisplacement() {
  try {
    console.log('=== Testing Time Off Displacement for Drew Darling ===\n');
    
    // Create unique job numbers with timestamp
    const timestamp = Date.now();
    
    // 1. Get Drew's employee ID
    const drewResult = await pool.query(
      "SELECT id, first_name, last_name FROM employees WHERE LOWER(first_name) = 'drew' AND LOWER(last_name) = 'darling'"
    );
    
    if (drewResult.rows.length === 0) {
      console.log('Drew Darling not found in employees table');
      return;
    }
    
    const drewId = drewResult.rows[0].id;
    console.log(`Found Drew Darling - Employee ID: ${drewId}\n`);
    
    // 2. Remove any existing time off entries for Aug 18-20
    console.log('Step 1: Removing any existing time off entries for Aug 18-20...');
    await pool.query(
      `DELETE FROM employee_time_off 
       WHERE employee_id = $1 
       AND ((start_date <= '2025-08-20' AND end_date >= '2025-08-18'))`,
      [drewId]
    );
    console.log('  Existing time off entries removed\n');
    
    // 3. Find a job that Drew can work on (with HMC operations since he's an HMC operator)
    console.log('Step 2: Finding a job with HMC operations to schedule...');
    const jobsResult = await pool.query(
      `SELECT DISTINCT j.id, j.job_number, jr.id as routing_id, jr.operation_name
       FROM jobs j
       JOIN job_routings jr ON j.id = jr.job_id
       WHERE (jr.operation_name LIKE '%HMC%' OR jr.operation_name LIKE '%HORIZONTAL%')
       AND NOT EXISTS (
         SELECT 1 FROM schedule_slots ss 
         WHERE ss.job_routing_id = jr.id
       )
       LIMIT 1`
    );
    
    let testJobId, testRoutingId;
    
    if (jobsResult.rows.length > 0) {
      testJobId = jobsResult.rows[0].id;
      testRoutingId = jobsResult.rows[0].routing_id;
      console.log(`  Found unscheduled job ${jobsResult.rows[0].job_number} with HMC operation\n`);
    } else {
      console.log('  No unscheduled HMC jobs found. Creating a test job...');
      
      // Create a test job
      const newJob = await pool.query(
        `INSERT INTO jobs (job_number, customer_name, part_name, quantity, priority_score, promised_date)
         VALUES ('TEST-TIMEOFF-' || $1, 'TEST CUSTOMER', 'Test Part for Time Off', 10, 500, '2025-08-25')
         RETURNING id`,
        [timestamp]
      );
      testJobId = newJob.rows[0].id;
      
      // Create routing for this job with HMC operation
      const newRouting = await pool.query(
        `INSERT INTO job_routings (job_id, operation_number, operation_name, sequence_order, estimated_hours, machine_group_id)
         VALUES ($1, 'OP2', 'HMC TEST OPERATION', 2, 8, (SELECT id FROM machine_groups WHERE name = 'HMC'))
         RETURNING id`,
        [testJobId]
      );
      testRoutingId = newRouting.rows[0].id;
      
      console.log(`  Created test job TEST-TIMEOFF-001\n`);
    }
    
    // 4. Schedule this job for Drew on Aug 19 (middle of his time off period)
    console.log('Step 3: Manually scheduling job for Drew on Aug 19, 2025...');
    
    // Get a machine that Drew can operate
    const machineResult = await pool.query(
      `SELECT m.id, m.name 
       FROM machines m
       JOIN operator_machine_assignments oma ON m.id = oma.machine_id
       WHERE oma.employee_id = $1
       AND m.name LIKE '%HMC%'
       LIMIT 1`,
      [drewId]
    );
    
    if (machineResult.rows.length === 0) {
      console.log('  Drew is not assigned to any HMC machines. Assigning him...');
      const hmcMachine = await pool.query(
        "SELECT id, name FROM machines WHERE name LIKE '%HMC%' LIMIT 1"
      );
      await pool.query(
        'INSERT INTO operator_machine_assignments (employee_id, machine_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [drewId, hmcMachine.rows[0].id]
      );
      machineResult.rows = hmcMachine.rows;
    }
    
    const machineId = machineResult.rows[0].id;
    console.log(`  Using machine: ${machineResult.rows[0].name}`);
    
    // Create schedule slot for Aug 19
    // First delete any existing slot for this routing
    await pool.query(
      'DELETE FROM schedule_slots WHERE job_routing_id = $1',
      [testRoutingId]
    );
    
    await pool.query(
      `INSERT INTO schedule_slots (job_routing_id, machine_id, employee_id, start_datetime, end_datetime, status, slot_date, duration_minutes, time_slot)
       VALUES ($1, $2, $3, '2025-08-19 06:00:00', '2025-08-19 14:00:00', 'scheduled', '2025-08-19', 480, 6)`,
      [testRoutingId, machineId, drewId]
    );
    console.log('  Job scheduled for Drew on Aug 19, 2025 from 6:00 AM to 2:00 PM\n');
    
    // 5. Verify the schedule was created
    const verifySchedule = await pool.query(
      `SELECT ss.*, j.job_number 
       FROM schedule_slots ss
       JOIN job_routings jr ON ss.job_routing_id = jr.id
       JOIN jobs j ON jr.job_id = j.id
       WHERE ss.employee_id = $1
       AND ss.start_datetime >= '2025-08-18'
       AND ss.start_datetime < '2025-08-21'`,
      [drewId]
    );
    
    console.log('Step 4: Verifying Drew\'s schedule before adding time off:');
    if (verifySchedule.rows.length > 0) {
      verifySchedule.rows.forEach(slot => {
        console.log(`  - Job ${slot.job_number}: ${slot.start_datetime} to ${slot.end_datetime}`);
      });
    }
    console.log('');
    
    // 6. Now add the time off entry
    console.log('Step 5: Adding time off entry for Aug 18-20, 2025...');
    await pool.query(
      `INSERT INTO employee_time_off (employee_id, start_date, end_date, reason)
       VALUES ($1, '2025-08-18', '2025-08-20', 'Vacation')`,
      [drewId]
    );
    console.log('  Time off entry added\n');
    
    // 7. Check if the scheduled job is still there or was displaced
    console.log('Step 6: Checking if job was displaced after adding time off:');
    const afterTimeOff = await pool.query(
      `SELECT ss.*, j.job_number, e.first_name, e.last_name
       FROM schedule_slots ss
       JOIN job_routings jr ON ss.job_routing_id = jr.id
       JOIN jobs j ON jr.job_id = j.id
       LEFT JOIN employees e ON ss.employee_id = e.id
       WHERE jr.id = $1`,
      [testRoutingId]
    );
    
    if (afterTimeOff.rows.length > 0) {
      const slot = afterTimeOff.rows[0];
      if (slot.employee_id === drewId) {
        console.log(`  ⚠️ Job is STILL assigned to Drew during his time off!`);
        console.log(`     Job ${slot.job_number}: ${slot.start_datetime} to ${slot.end_datetime}`);
        console.log(`     This indicates time off is NOT properly displacing jobs\n`);
      } else {
        console.log(`  ✅ Job was reassigned to ${slot.first_name} ${slot.last_name}`);
        console.log(`     New schedule: ${slot.start_datetime} to ${slot.end_datetime}\n`);
      }
    } else {
      console.log('  Job schedule slot was removed (possibly needs rescheduling)\n');
    }
    
    // 8. Test auto-scheduling with time off in place
    console.log('Step 7: Testing auto-scheduling with time off active...');
    console.log('  Attempting to auto-schedule a new job for Drew during his time off...\n');
    
    // Create another test job
    const newJob2 = await pool.query(
      `INSERT INTO jobs (job_number, customer_name, part_name, quantity, priority_score, promised_date)
       VALUES ('TEST-TIMEOFF2-' || $1, 'TEST CUSTOMER', 'Test Auto Schedule', 5, 600, '2025-08-22')
       RETURNING id`,
      [timestamp]
    );
    
    // Create routing
    await pool.query(
      `INSERT INTO job_routings (job_id, operation_number, operation_name, sequence_order, estimated_hours, machine_group_id)
       VALUES ($1, 'OP2', 'HMC AUTO TEST', 2, 4, (SELECT id FROM machine_groups WHERE name = 'HMC'))`,
      [newJob2.rows[0].id]
    );
    
    // Try to auto-schedule via API
    try {
      const scheduleResponse = await axios.post(
        `${API_BASE}/scheduling/schedule-job/${newJob2.rows[0].id}`,
        {},
        { timeout: 10000 }
      );
      
      console.log('  Auto-scheduling completed. Checking results...');
      
      // Check where it was scheduled
      const autoScheduled = await pool.query(
        `SELECT ss.*, j.job_number, e.first_name, e.last_name
         FROM schedule_slots ss
         JOIN job_routings jr ON ss.job_routing_id = jr.id
         JOIN jobs j ON jr.job_id = j.id
         LEFT JOIN employees e ON ss.employee_id = e.id
         WHERE j.id = $1`,
        [newJob2.rows[0].id]
      );
      
      if (autoScheduled.rows.length > 0) {
        const slot = autoScheduled.rows[0];
        const startDate = new Date(slot.start_datetime);
        const isInTimeOff = startDate >= new Date('2025-08-18') && startDate <= new Date('2025-08-20');
        
        if (slot.employee_id === drewId && isInTimeOff) {
          console.log(`  ⚠️ Job was incorrectly scheduled for Drew during his time off!`);
          console.log(`     ${slot.start_datetime} to ${slot.end_datetime}`);
        } else if (slot.employee_id === drewId && !isInTimeOff) {
          console.log(`  ✅ Job was correctly scheduled for Drew AFTER his time off`);
          console.log(`     ${slot.start_datetime} to ${slot.end_datetime}`);
        } else {
          console.log(`  ✅ Job was scheduled for ${slot.first_name} ${slot.last_name} (not Drew)`);
          console.log(`     ${slot.start_datetime} to ${slot.end_datetime}`);
        }
      }
    } catch (error) {
      console.log('  Error during auto-scheduling:', error.message);
    }
    
    // 9. Clean up test data
    console.log('\nStep 8: Cleaning up test data...');
    await pool.query("DELETE FROM schedule_slots WHERE job_routing_id IN (SELECT id FROM job_routings WHERE job_id IN (SELECT id FROM jobs WHERE job_number LIKE 'TEST-TIMEOFF%'))");
    await pool.query("DELETE FROM job_routings WHERE job_id IN (SELECT id FROM jobs WHERE job_number LIKE 'TEST-TIMEOFF%')");
    await pool.query("DELETE FROM jobs WHERE job_number LIKE 'TEST-TIMEOFF%'");
    await pool.query("DELETE FROM employee_time_off WHERE employee_id = $1 AND start_date = '2025-08-18' AND end_date = '2025-08-20'", [drewId]);
    console.log('  Test data cleaned up');
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

console.log('Starting time off displacement test...\n');
console.log('This test will:');
console.log('1. Remove any existing time off for Drew (Aug 18-20)');
console.log('2. Schedule a job for Drew on Aug 19');
console.log('3. Add time off for Aug 18-20');
console.log('4. Check if the job gets displaced');
console.log('5. Test auto-scheduling to avoid the time off period\n');

setTimeout(() => {
  testTimeOffDisplacement();
}, 2000); // Give the server time to fully start