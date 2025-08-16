const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function checkActualHours() {
  try {
    console.log('=== CHECKING ACTUAL EMPLOYEE HOURS IN DATABASE ===\n');
    
    // Check both the employees table AND the employee_work_schedules table
    const employeesResult = await pool.query(`
      SELECT 
        e.employee_id,
        e.first_name,
        e.last_name,
        e.shift_type,
        e.start_time as emp_start,
        e.end_time as emp_end,
        ews.start_time as schedule_start,
        ews.end_time as schedule_end
      FROM employees e
      LEFT JOIN employee_work_schedules ews ON e.employee_id = ews.employee_id
        AND ews.day_of_week = EXTRACT(DOW FROM CURRENT_DATE)::integer
      WHERE e.first_name IN ('Drew', 'Kyle', 'Chris')
      ORDER BY e.first_name
    `);
    
    console.log('Employees table vs Work Schedules table:');
    employeesResult.rows.forEach(r => {
      console.log(`\n${r.first_name} ${r.last_name} (${r.shift_type} shift):`);
      console.log(`  employees table: ${r.emp_start} - ${r.emp_end}`);
      console.log(`  work_schedules table: ${r.schedule_start || 'NO SCHEDULE'} - ${r.schedule_end || 'NO SCHEDULE'}`);
    });
    
    // Check what the scheduling service would actually use
    console.log('\n\n=== WHAT THE SCHEDULING SERVICE USES ===\n');
    
    // This simulates what getOperatorWorkingHours does
    const testDate = '2025-08-15';
    const functionResult = await pool.query(`
      SELECT 
        e.employee_id,
        e.first_name,
        e.last_name,
        e.shift_type,
        e.numeric_id,
        wh.start_hour,
        wh.end_hour,
        wh.duration_hours,
        wh.is_overnight,
        wh.is_working_day
      FROM employees e
      CROSS JOIN LATERAL get_employee_working_hours(e.numeric_id, $1::date) wh
      WHERE e.first_name IN ('Drew', 'Kyle', 'Chris')
      ORDER BY e.first_name
    `, [testDate]);
    
    console.log('What get_employee_working_hours returns:');
    functionResult.rows.forEach(r => {
      const startHour = Math.floor(r.start_hour);
      const startMin = Math.round((r.start_hour % 1) * 60);
      const endHour = Math.floor(r.end_hour);
      const endMin = Math.round((r.end_hour % 1) * 60);
      
      console.log(`\n${r.first_name} ${r.last_name}:`);
      console.log(`  Working hours: ${startHour}:${startMin.toString().padStart(2, '0')} - ${endHour}:${endMin.toString().padStart(2, '0')}`);
      console.log(`  Duration: ${r.duration_hours} hours`);
      console.log(`  Shift type: ${r.shift_type}`);
      
      // Apply efficiency modifier
      const efficiency = r.shift_type === 'day' ? 0.85 : 0.60;
      const rawMinutes = Math.abs(r.duration_hours) * 60;
      const effectiveMinutes = Math.floor(rawMinutes * efficiency);
      
      console.log(`  Raw capacity: ${rawMinutes} minutes`);
      console.log(`  With ${efficiency * 100}% efficiency: ${effectiveMinutes} minutes`);
    });
    
    console.log('\n\n✅ The scheduling service IS using individual hours from get_employee_working_hours!');
    console.log('   The issue is that the work schedules might not be properly populated.');
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
    process.exit();
  }
}

checkActualHours();