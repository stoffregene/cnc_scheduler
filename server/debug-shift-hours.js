const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:sassysalad@localhost:5732/cnc_scheduler'
});

async function debugShiftHours() {
  try {
    console.log('=== DEBUG: Shift Hours Attribution ===\n');
    
    // Check all employees with scheduled hours
    const employeesWithHours = await pool.query(`
      SELECT 
        e.employee_id,
        e.first_name,
        e.last_name,
        e.shift_type,
        e.start_time,
        e.end_time,
        e.numeric_id,
        COALESCE(SUM(ss.duration_minutes), 0) as total_scheduled_minutes
      FROM employees e
      LEFT JOIN schedule_slots ss ON e.numeric_id = ss.employee_id
        AND ss.status IN ('scheduled', 'in_progress')
      WHERE e.status = 'active'
      GROUP BY e.employee_id, e.first_name, e.last_name, e.shift_type, e.start_time, e.end_time, e.numeric_id
      HAVING COALESCE(SUM(ss.duration_minutes), 0) > 0
      ORDER BY total_scheduled_minutes DESC
    `);
    
    console.log('All employees with scheduled hours:');
    employeesWithHours.rows.forEach(emp => {
      const hours = (emp.total_scheduled_minutes / 60).toFixed(1);
      console.log(`- ${emp.first_name} ${emp.last_name} (${emp.employee_id}): ${hours}h, shift_type: ${emp.shift_type}, times: ${emp.start_time}-${emp.end_time}`);
    });
    
    console.log('\n=== Shift Assignment Logic ===');
    let firstShiftTotal = 0;
    let secondShiftTotal = 0;
    
    employeesWithHours.rows.forEach(employee => {
      const scheduledHours = employee.total_scheduled_minutes / 60;
      let assignedShift;
      
      if (employee.shift_type === 'day') {
        assignedShift = '1st';
        firstShiftTotal += scheduledHours;
      } else if (employee.shift_type === 'night') {
        assignedShift = '2nd';
        secondShiftTotal += scheduledHours;
      } else {
        // Fallback logic
        const startHour = parseInt(employee.start_time.split(':')[0]);
        if (startHour >= 4 && startHour <= 15) {
          assignedShift = '1st';
          firstShiftTotal += scheduledHours;
        } else {
          assignedShift = '2nd';
          secondShiftTotal += scheduledHours;
        }
      }
      
      console.log(`${employee.first_name} ${employee.last_name}: ${scheduledHours.toFixed(1)}h -> ${assignedShift} shift`);
    });
    
    console.log(`\nTotals:`);
    console.log(`1st Shift: ${firstShiftTotal.toFixed(1)}h`);
    console.log(`2nd Shift: ${secondShiftTotal.toFixed(1)}h`);
    
    // Check for any Chris Johnson variants
    console.log('\n=== Looking for Chris Johnson variants ===');
    const chrisVariants = await pool.query(`
      SELECT 
        employee_id,
        first_name,
        last_name,
        shift_type,
        start_time,
        end_time,
        numeric_id
      FROM employees 
      WHERE (first_name ILIKE '%chris%' OR last_name ILIKE '%johnson%')
      AND status = 'active'
    `);
    
    console.log('All Chris/Johnson employees:');
    chrisVariants.rows.forEach(emp => {
      console.log(`- ${emp.first_name} ${emp.last_name} (${emp.employee_id}): shift_type=${emp.shift_type}, numeric_id=${emp.numeric_id}`);
    });
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

debugShiftHours();