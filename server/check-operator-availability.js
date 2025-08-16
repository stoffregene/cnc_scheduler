const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function checkOperatorAvailability() {
  try {
    // Check who is assigned to the job 60241 slot
    console.log('Checking operator assignment for job 60241...');
    const assignmentQuery = `
      SELECT ss.id, ss.employee_id, ss.start_datetime, ss.end_datetime,
             (e.first_name || ' ' || e.last_name) as employee_name, m.name as machine_name
      FROM schedule_slots ss 
      JOIN machines m ON ss.machine_id = m.id 
      LEFT JOIN employees e ON ss.employee_id = e.employee_id 
      JOIN jobs j ON ss.job_id = j.id
      WHERE j.job_number = '60241'
    `;
    
    const assignmentResult = await pool.query(assignmentQuery);
    console.log('Job 60241 assignment:');
    assignmentResult.rows.forEach(row => {
      console.log(`  Slot ${row.id}: ${row.employee_name || 'NO OPERATOR'} on ${row.machine_name}`);
      console.log(`  Scheduled: ${row.start_datetime} to ${row.end_datetime}`);
    });
    
    if (assignmentResult.rows.length > 0 && assignmentResult.rows[0].employee_id) {
      const employeeId = assignmentResult.rows[0].employee_id;
      const scheduleDate = assignmentResult.rows[0].start_datetime.toISOString().split('T')[0];
      
      console.log(`\nChecking work schedule for employee ${employeeId} on ${scheduleDate}:`);
      
      // Check the get_employee_working_hours function
      const hoursQuery = `SELECT get_employee_working_hours($1, $2::date) as hours`;
      const hoursResult = await pool.query(hoursQuery, [employeeId, scheduleDate]);
      
      console.log('Work hours from function:', hoursResult.rows[0].hours);
      
      // Check the employee_work_schedules table directly
      const scheduleQuery = `
        SELECT * FROM employee_work_schedules 
        WHERE employee_id = $1 
        AND effective_date <= $2::date 
        ORDER BY effective_date DESC 
        LIMIT 1
      `;
      
      const scheduleResult = await pool.query(scheduleQuery, [employeeId, scheduleDate]);
      console.log('Direct schedule lookup:');
      if (scheduleResult.rows.length > 0) {
        const schedule = scheduleResult.rows[0];
        console.log(`  Monday: ${schedule.monday_start} - ${schedule.monday_end}`);
        console.log(`  Tuesday: ${schedule.tuesday_start} - ${schedule.tuesday_end}`);
        console.log(`  Wednesday: ${schedule.wednesday_start} - ${schedule.wednesday_end}`);
        console.log(`  Thursday: ${schedule.thursday_start} - ${schedule.thursday_end}`);
        console.log(`  Friday: ${schedule.friday_start} - ${schedule.friday_end}`);
        console.log(`  Effective date: ${schedule.effective_date}`);
        
        // Check what day of week the schedule date is
        const dayOfWeek = new Date(scheduleDate + 'T00:00:00').getDay(); // 0 = Sunday, 1 = Monday, etc.
        const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const dayName = dayNames[dayOfWeek];
        const startField = `${dayName}_start`;
        const endField = `${dayName}_end`;
        
        console.log(`\n${scheduleDate} is a ${dayName.charAt(0).toUpperCase() + dayName.slice(1)}`);
        console.log(`Work hours: ${schedule[startField]} - ${schedule[endField]}`);
        
        // Compare with scheduled time
        const scheduledStart = new Date(assignmentResult.rows[0].start_datetime);
        const scheduledHour = scheduledStart.getHours();
        console.log(`\nScheduled at: ${scheduledHour}:${scheduledStart.getMinutes().toString().padStart(2, '0')}`);
        
        if (schedule[startField] && schedule[endField]) {
          const workStart = parseInt(schedule[startField].split(':')[0]);
          const workEnd = parseInt(schedule[endField].split(':')[0]);
          console.log(`Work hours: ${workStart}:00 - ${workEnd}:00`);
          
          if (scheduledHour < workStart || scheduledHour >= workEnd) {
            console.log('⚠️  SCHEDULING CONFLICT: Job scheduled outside work hours!');
          } else {
            console.log('✅ Job scheduled within work hours');
          }
        }
      } else {
        console.log('  No schedule found in employee_work_schedules');
      }
    }
    
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
    process.exit();
  }
}

checkOperatorAvailability();