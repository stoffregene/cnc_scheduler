const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:sassysalad@localhost:5432/cnc_scheduler'
});

async function testShiftCapacityAPI() {
  try {
    console.log('=== TESTING SHIFT CAPACITY API ===\n');
    
    // Test the get_employee_working_hours function directly
    console.log('1. Testing get_employee_working_hours function:');
    
    // Get Chris Johnson's ID first
    const chrisResult = await pool.query(`
      SELECT id, first_name, last_name FROM employees 
      WHERE first_name = 'Chris' AND last_name = 'Johnson'
    `);
    
    if (chrisResult.rows.length > 0) {
      const chrisId = chrisResult.rows[0].id;
      console.log(`Chris Johnson ID: ${chrisId}`);
      
      try {
        const workingHours = await pool.query(`
          SELECT * FROM get_employee_working_hours($1, CURRENT_DATE)
        `, [chrisId]);
        
        console.log('get_employee_working_hours result:', workingHours.rows[0]);
      } catch (error) {
        console.log('get_employee_working_hours ERROR:', error.message);
      }
    }
    
    // Test the actual shift capacity calculation
    console.log('\n2. Testing shift capacity calculation for today:');
    const today = new Date().toISOString().split('T')[0];
    
    // First get the employees with jobs
    const employeesQuery = `
      SELECT 
        e.id,
        e.employee_id,
        e.first_name,
        e.last_name,
        e.position,
        COALESCE(SUM(ss.duration_minutes), 0) as total_scheduled_minutes,
        COUNT(DISTINCT ss.slot_date) as working_days
      FROM employees e
      LEFT JOIN schedule_slots ss ON e.id = ss.employee_id
        AND ss.slot_date >= $1::date
        AND ss.status IN ('scheduled', 'in_progress')
      WHERE e.status = 'active'
      GROUP BY e.id, e.employee_id, e.first_name, e.last_name, e.position
      HAVING COALESCE(SUM(ss.duration_minutes), 0) > 0
      ORDER BY total_scheduled_minutes DESC
    `;
    
    const employees = await pool.query(employeesQuery, [today]);
    
    console.log('Employees with scheduled jobs:');
    for (const emp of employees.rows) {
      const hours = (emp.total_scheduled_minutes / 60).toFixed(1);
      console.log(`\n--- ${emp.first_name} ${emp.last_name}: ${hours}h ---`);
      
      try {
        const workingHours = await pool.query(`
          SELECT * FROM get_employee_working_hours($1, $2::date)
        `, [emp.id, today]);
        
        if (workingHours.rows.length > 0) {
          const wh = workingHours.rows[0];
          const shift = (wh.start_hour >= 4 && wh.start_hour <= 15) ? '1st shift' : '2nd shift';
          console.log(`  Working hours: ${wh.start_hour}:00-${wh.end_hour}:00 (${wh.duration_hours}h) → ${shift}`);
        } else {
          console.log('  No working hours found');
        }
      } catch (error) {
        console.log(`  ERROR getting working hours: ${error.message}`);
      }
    }
    
    // Test the actual API endpoint
    console.log('\n3. Testing shift-capacity API endpoint:');
    const response = await fetch(`http://localhost:5000/api/shift-capacity/capacity?date=${today}&period=day`);
    const shiftData = await response.json();
    
    console.log('API Response:');
    console.log(`1st Shift: ${shiftData.first_shift?.scheduled_hours_formatted} scheduled`);
    console.log(`2nd Shift: ${shiftData.second_shift?.scheduled_hours_formatted} scheduled`);
    console.log(`Operators detail:`, shiftData.operators_detail?.map(op => 
      `${op.name}: ${op.scheduled_hours}h → ${op.shift_type}`
    ));
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

testShiftCapacityAPI();