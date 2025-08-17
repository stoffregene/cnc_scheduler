const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:sassysalad@localhost:5432/cnc_scheduler'
});

async function checkActualSchedules() {
  try {
    console.log('=== CHECKING ACTUAL EMPLOYEE WORK SCHEDULES ===\n');
    
    // First, revert the incorrect Corey Smith change
    await pool.query(`
      UPDATE employees 
      SET shift_type = 'night'
      WHERE employee_id = 'CS005'
    `);
    console.log('✅ Reverted Corey Smith shift_type back to "night"\n');
    
    // Check the actual employee_work_schedules table
    console.log('1. Checking employee_work_schedules table:');
    const workSchedules = await pool.query(`
      SELECT 
        ews.employee_id,
        e.first_name,
        e.last_name,
        ews.day_of_week,
        ews.start_hour,
        ews.end_hour,
        ews.is_working_day
      FROM employee_work_schedules ews
      JOIN employees e ON ews.employee_id = e.id
      WHERE ews.is_working_day = true
      ORDER BY ews.employee_id, ews.day_of_week
    `);
    
    if (workSchedules.rows.length > 0) {
      console.log('Found actual work schedules:');
      workSchedules.rows.forEach(schedule => {
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        console.log(`- ${schedule.first_name} ${schedule.last_name}: ${dayNames[schedule.day_of_week]} ${schedule.start_hour}:00-${schedule.end_hour}:00`);
      });
    } else {
      console.log('❌ No data found in employee_work_schedules table');
    }
    
    // Check using the database function for Corey Smith
    console.log('\n2. Using get_employee_working_hours function for employees with scheduled jobs:');
    
    const employeesWithJobs = await pool.query(`
      SELECT DISTINCT ss.employee_id, e.first_name, e.last_name
      FROM schedule_slots ss
      JOIN employees e ON ss.employee_id = e.id
      WHERE ss.status IN ('scheduled', 'in_progress')
    `);
    
    for (const emp of employeesWithJobs.rows) {
      try {
        const workingHours = await pool.query(`
          SELECT * FROM get_employee_working_hours($1, CURRENT_DATE)
        `, [emp.employee_id]);
        
        if (workingHours.rows.length > 0) {
          const hours = workingHours.rows[0];
          console.log(`- ${emp.first_name} ${emp.last_name}: ${hours.start_hour}:00-${hours.end_hour}:00 (${hours.duration_hours}h, working: ${hours.is_working_day})`);
        }
      } catch (error) {
        console.log(`- ${emp.first_name} ${emp.last_name}: Error getting hours - ${error.message}`);
      }
    }
    
    // Check what's actually in the scheduled slots with wrong attribution
    console.log('\n3. Checking schedule_slots details:');
    const scheduledSlots = await pool.query(`
      SELECT 
        ss.employee_id,
        e.first_name,
        e.last_name,
        ss.start_datetime,
        ss.duration_minutes,
        j.job_number,
        jr.operation_name
      FROM schedule_slots ss
      JOIN employees e ON ss.employee_id = e.id
      JOIN job_routings jr ON ss.job_routing_id = jr.id
      JOIN jobs j ON jr.job_id = j.id
      WHERE ss.status IN ('scheduled', 'in_progress')
      ORDER BY ss.start_datetime
      LIMIT 10
    `);
    
    console.log('Recent scheduled slots:');
    scheduledSlots.rows.forEach(slot => {
      const hours = (slot.duration_minutes / 60).toFixed(1);
      console.log(`- ${slot.first_name} ${slot.last_name}: ${slot.job_number} ${slot.operation_name} (${hours}h) on ${slot.start_datetime}`);
    });
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

checkActualSchedules();