const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function debugScheduleCapacity() {
  try {
    console.log('=== DEBUG SCHEDULE CAPACITY CONSUMPTION ===');
    
    const today = new Date().toISOString().split('T')[0];
    console.log('Today:', today);
    
    // Check all schedule slots for job 60241
    console.log('\n1. All schedule slots for job 60241:');
    const job60241Query = `
      SELECT ss.*, j.job_number, m.name as machine_name, e.first_name, e.last_name, e.shift_type, e.employee_id as emp_id
      FROM schedule_slots ss
      JOIN jobs j ON ss.job_id = j.id
      JOIN machines m ON ss.machine_id = m.id
      LEFT JOIN employees e ON ss.employee_id::text = e.employee_id
      WHERE j.job_number = '60241'
      ORDER BY ss.slot_date DESC
    `;
    
    const job60241Result = await pool.query(job60241Query);
    
    console.log(`Found ${job60241Result.rows.length} schedule slots for job 60241:`);
    job60241Result.rows.forEach(slot => {
      console.log(`  Date: ${slot.slot_date}, Duration: ${slot.duration_minutes}min on ${slot.machine_name}`);
      console.log(`    Employee: ${slot.first_name} ${slot.last_name} (ID: ${slot.emp_id}, shift: ${slot.shift_type})`);
      console.log(`    Time: ${slot.start_datetime} - ${slot.end_datetime}`);
      console.log('');
    });
    
    // Check schedule slots for today
    console.log('\n2. Schedule slots for today:');
    const slotsQuery = `
      SELECT ss.*, j.job_number, m.name as machine_name, e.first_name, e.last_name, e.shift_type, e.employee_id as emp_id
      FROM schedule_slots ss
      JOIN jobs j ON ss.job_id = j.id
      JOIN machines m ON ss.machine_id = m.id
      LEFT JOIN employees e ON ss.employee_id::text = e.employee_id
      WHERE ss.slot_date = $1
      ORDER BY ss.start_datetime
    `;
    
    const slotsResult = await pool.query(slotsQuery, [today]);
    
    console.log(`Found ${slotsResult.rows.length} schedule slots for today:`);
    slotsResult.rows.forEach(slot => {
      console.log(`  Job ${slot.job_number}: ${slot.duration_minutes}min on ${slot.machine_name}`);
      console.log(`    Employee: ${slot.first_name} ${slot.last_name} (ID: ${slot.emp_id}, shift: ${slot.shift_type})`);
      console.log(`    Time: ${slot.start_datetime} - ${slot.end_datetime}`);
      console.log('');
    });
    
    // Test the shift capacity query specifically
    console.log('\n3. Testing shift capacity query:');
    const capacityQuery = `
      SELECT 
        e.employee_id,
        e.first_name,
        e.last_name,
        e.shift_type,
        e.start_time,
        e.end_time,
        COALESCE(SUM(ss.duration_minutes), 0) as total_scheduled_minutes,
        COUNT(DISTINCT ss.slot_date) as working_days
      FROM employees e
      LEFT JOIN schedule_slots ss ON (
        CASE 
          WHEN e.employee_id ~ '^[0-9]+$' THEN e.employee_id::integer = ss.employee_id
          ELSE false
        END
      )
        AND ss.slot_date BETWEEN $1::date AND $2::date
        AND ss.status IN ('scheduled', 'in_progress')
      WHERE e.status = 'active'
      GROUP BY e.employee_id, e.first_name, e.last_name, e.shift_type, e.start_time, e.end_time
      HAVING COALESCE(SUM(ss.duration_minutes), 0) > 0
      ORDER BY e.first_name, e.last_name
    `;
    
    const capacityResult = await pool.query(capacityQuery, [today, today]);
    
    console.log(`Employees with scheduled work today:`);
    capacityResult.rows.forEach(emp => {
      console.log(`  ${emp.first_name} ${emp.last_name} (${emp.employee_id}): ${emp.total_scheduled_minutes} minutes, shift: ${emp.shift_type}`);
    });
    
    // Check the employee ID data types issue
    console.log('\n4. Employee ID comparison:');
    const empIdsQuery = `
      SELECT DISTINCT 
        e.employee_id as emp_str_id,
        ss.employee_id as slot_int_id,
        e.employee_id ~ '^[0-9]+$' as is_numeric
      FROM employees e
      LEFT JOIN schedule_slots ss ON ss.employee_id::text = e.employee_id
      WHERE ss.slot_date = $1
    `;
    
    const empIdsResult = await pool.query(empIdsQuery, [today]);
    
    console.log('Employee ID mappings:');
    empIdsResult.rows.forEach(mapping => {
      console.log(`  Employee table: "${mapping.emp_str_id}" -> Schedule slots: ${mapping.slot_int_id} (numeric: ${mapping.is_numeric})`);
    });
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
    process.exit();
  }
}

debugScheduleCapacity();