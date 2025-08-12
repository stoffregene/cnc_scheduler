const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function checkAllSchedules() {
  try {
    console.log('Checking ALL employee schedules...\n');
    
    // Get all active employees with their schedule info
    const result = await pool.query(`
      SELECT 
        id, first_name, last_name, department, position,
        shift_type, start_time, end_time, work_days,
        custom_start_hour, custom_end_hour, custom_duration_hours
      FROM employees 
      WHERE status = 'active'
      ORDER BY department, last_name, first_name
    `);
    
    console.log('All Active Employee Schedules:');
    console.log('=====================================');
    
    result.rows.forEach(emp => {
      console.log(`\n${emp.first_name} ${emp.last_name} (ID: ${emp.id})`);
      console.log(`  Department: ${emp.department || 'Unknown'}`);
      console.log(`  Position: ${emp.position || 'Unknown'}`);
      console.log(`  Shift Type: ${emp.shift_type || 'Unknown'}`);
      console.log(`  Database Hours: ${emp.start_time} to ${emp.end_time}`);
      console.log(`  Work Days: ${emp.work_days ? emp.work_days.join(', ') : 'Not specified'}`);
      
      if (emp.custom_start_hour) {
        console.log(`  Custom Hours: ${emp.custom_start_hour}:00 to ${emp.custom_end_hour}:00 (${emp.custom_duration_hours}h)`);
      }
      
      // Calculate duration from start/end times
      if (emp.start_time && emp.end_time) {
        const start = emp.start_time.split(':');
        const end = emp.end_time.split(':');
        const startMinutes = parseInt(start[0]) * 60 + parseInt(start[1]);
        const endMinutes = parseInt(end[0]) * 60 + parseInt(end[1]);
        const durationHours = (endMinutes - startMinutes) / 60;
        console.log(`  Calculated Duration: ${durationHours} hours`);
      }
    });
    
    console.log('\n\n📋 SUMMARY:');
    console.log(`Total active employees: ${result.rows.length}`);
    
    // Group by shift times to see patterns
    const shiftGroups = {};
    result.rows.forEach(emp => {
      const shift = `${emp.start_time} - ${emp.end_time}`;
      if (!shiftGroups[shift]) {
        shiftGroups[shift] = [];
      }
      shiftGroups[shift].push(`${emp.first_name} ${emp.last_name}`);
    });
    
    console.log('\nShift Time Groups:');
    Object.keys(shiftGroups).forEach(shift => {
      console.log(`  ${shift}: ${shiftGroups[shift].join(', ')}`);
    });
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

checkAllSchedules();