const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:sassysalad@localhost:5432/cnc_scheduler'
});

async function debugOperatorHours() {
  try {
    console.log('=== DEBUGGING OPERATOR HOURS SOURCE ===\n');
    
    // Check what's actually in employee_work_schedules
    console.log('1. Employee work schedules table:');
    const workSchedules = await pool.query(`
      SELECT COUNT(*) as total_records FROM employee_work_schedules
    `);
    console.log(`Total records in employee_work_schedules: ${workSchedules.rows[0].total_records}`);
    
    // Sample the data
    const sampleSchedules = await pool.query(`
      SELECT 
        ews.employee_id,
        e.first_name,
        e.last_name,
        ews.day_of_week,
        ews.start_time,
        ews.end_time,
        ews.enabled
      FROM employee_work_schedules ews
      LEFT JOIN employees e ON ews.employee_id = e.id
      ORDER BY ews.employee_id, ews.day_of_week
      LIMIT 10
    `);
    
    console.log('Sample employee_work_schedules data:');
    sampleSchedules.rows.forEach(row => {
      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      console.log(`- Employee ${row.employee_id} (${row.first_name} ${row.last_name}): ${dayNames[row.day_of_week]} ${row.start_time}-${row.end_time} (enabled: ${row.enabled})`);
    });
    
    // Check who actually has jobs scheduled
    console.log('\n2. Employees with scheduled jobs and their data sources:');
    const employeesWithJobs = await pool.query(`
      SELECT 
        ss.employee_id,
        e.first_name,
        e.last_name,
        e.employee_id as emp_code,
        SUM(ss.duration_minutes) as total_minutes
      FROM schedule_slots ss
      JOIN employees e ON ss.employee_id = e.id
      WHERE ss.status IN ('scheduled', 'in_progress')
      GROUP BY ss.employee_id, e.first_name, e.last_name, e.employee_id
      ORDER BY total_minutes DESC
    `);
    
    for (const emp of employeesWithJobs.rows) {
      const hours = (emp.total_minutes / 60).toFixed(1);
      console.log(`\n--- ${emp.first_name} ${emp.last_name} (ID: ${emp.employee_id}, Code: ${emp.emp_code}) - ${hours}h scheduled ---`);
      
      // Check employee_work_schedules
      const workSched = await pool.query(`
        SELECT day_of_week, start_time, end_time, enabled
        FROM employee_work_schedules
        WHERE employee_id = $1 AND enabled = true
        ORDER BY day_of_week
      `, [emp.employee_id]);
      
      if (workSched.rows.length > 0) {
        console.log('  From employee_work_schedules:');
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        workSched.rows.forEach(s => {
          const startHour = parseInt(s.start_time.split(':')[0]);
          const shift = (startHour >= 4 && startHour <= 15) ? '1st shift' : '2nd shift';
          console.log(`    ${dayNames[s.day_of_week]} ${s.start_time}-${s.end_time} (${shift})`);
        });
      } else {
        console.log('  ❌ No data in employee_work_schedules');
      }
      
      // Check employees table fallback
      const empFallback = await pool.query(`
        SELECT start_time, end_time, shift_type
        FROM employees
        WHERE id = $1
      `, [emp.employee_id]);
      
      if (empFallback.rows.length > 0) {
        const fb = empFallback.rows[0];
        console.log(`  From employees table (fallback): ${fb.start_time}-${fb.end_time}, shift_type: ${fb.shift_type}`);
      }
      
      // Check what get_employee_working_hours function returns
      try {
        const funcResult = await pool.query(`
          SELECT * FROM get_employee_working_hours($1, CURRENT_DATE)
        `, [emp.employee_id]);
        
        if (funcResult.rows.length > 0) {
          const hours = funcResult.rows[0];
          console.log(`  From get_employee_working_hours(): ${hours.start_hour}:00-${hours.end_hour}:00 (${hours.duration_hours}h)`);
        }
      } catch (error) {
        console.log(`  From get_employee_working_hours(): Error - ${error.message}`);
      }
    }
    
    console.log('\n3. What should we be using for shift capacity calculation?');
    console.log('The scheduling system uses get_employee_working_hours() function.');
    console.log('We should use the same source for consistency.');
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

debugOperatorHours();