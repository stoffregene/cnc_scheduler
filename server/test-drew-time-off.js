const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function testDrewTimeOff() {
  try {
    console.log('=== Testing Drew Darling Time Off Handling ===\n');
    
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
    
    // 2. Check current time off entries
    console.log('Current time off entries for Drew:');
    const timeOffResult = await pool.query(
      `SELECT * FROM employee_time_off 
       WHERE employee_id = $1 
       AND end_date >= CURRENT_DATE
       ORDER BY start_date`,
      [drewId]
    );
    
    if (timeOffResult.rows.length > 0) {
      timeOffResult.rows.forEach(entry => {
        console.log(`  - ${entry.start_date.toISOString().split('T')[0]} to ${entry.end_date.toISOString().split('T')[0]}: ${entry.reason || 'No reason specified'}`);
      });
    } else {
      console.log('  No time off entries found');
    }
    
    // 3. Check if Drew has any scheduled slots during Aug 18-20
    console.log('\nChecking for scheduled slots during Aug 18-20, 2025:');
    const scheduledSlots = await pool.query(
      `SELECT ss.*, jr.operation_id, j.job_number 
       FROM schedule_slots ss
       JOIN job_routings jr ON ss.job_routing_id = jr.id
       JOIN jobs j ON jr.job_id = j.id
       WHERE ss.employee_id = $1
       AND ss.start_time >= '2025-08-18'::date
       AND ss.start_time < '2025-08-21'::date
       ORDER BY ss.start_time`,
      [drewId]
    );
    
    if (scheduledSlots.rows.length > 0) {
      console.log(`  Found ${scheduledSlots.rows.length} slots scheduled for Drew during his time off:`);
      scheduledSlots.rows.forEach(slot => {
        console.log(`    - Job ${slot.job_number}, Operation ${slot.operation_id}: ${slot.start_time}`);
      });
    } else {
      console.log('  No slots currently scheduled during this period');
    }
    
    // 4. Add time off entry for Aug 18-20 if it doesn't exist
    console.log('\nAdding time off entry for Aug 18-20, 2025...');
    
    // First check if it already exists
    const existingTimeOff = await pool.query(
      `SELECT * FROM employee_time_off 
       WHERE employee_id = $1 
       AND start_date = '2025-08-18'
       AND end_date = '2025-08-20'`,
      [drewId]
    );
    
    if (existingTimeOff.rows.length === 0) {
      await pool.query(
        `INSERT INTO employee_time_off (employee_id, start_date, end_date, reason)
         VALUES ($1, '2025-08-18', '2025-08-20', 'Vacation')`,
        [drewId]
      );
      console.log('  Time off entry added successfully');
    } else {
      console.log('  Time off entry already exists');
    }
    
    // 5. Test the get_employee_working_hours function for these dates
    console.log('\nTesting get_employee_working_hours function:');
    for (let day = 18; day <= 20; day++) {
      const date = `2025-08-${day}`;
      const workingHours = await pool.query(
        'SELECT * FROM get_employee_working_hours($1, $2::date)',
        [drewId, date]
      );
      
      if (workingHours.rows.length > 0) {
        const hours = workingHours.rows[0];
        console.log(`  ${date}: Working=${hours.is_working_day}, Hours=${hours.start_hour}-${hours.end_hour}, Duration=${hours.duration_hours}`);
      }
    }
    
    // 6. Check available slots for a test operation during time off period
    console.log('\nTesting available slots generation during time off:');
    const availableSlots = await pool.query(
      `SELECT * FROM find_available_slots_for_operation(
        1::integer,  -- test job_routing_id
        480::integer, -- 8 hours duration in minutes
        $1::integer,  -- Drew's employee_id
        '2025-08-18'::timestamp,  -- min_start_time
        '2025-08-25'::timestamp   -- max_end_time
      ) LIMIT 5`,
      [drewId]
    );
    
    console.log(`  Found ${availableSlots.rows.length} available slots:`);
    availableSlots.rows.forEach(slot => {
      console.log(`    - ${slot.start_time} to ${slot.end_time}`);
    });
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

testDrewTimeOff();