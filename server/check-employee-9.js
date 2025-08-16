const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function checkEmployee9() {
  try {
    console.log('Checking all employees...');
    const allEmployees = await pool.query(`
      SELECT employee_id, first_name, last_name, status 
      FROM employees 
      ORDER BY employee_id
    `);
    
    console.log('All employees:');
    allEmployees.rows.forEach(row => {
      console.log(`  ID ${row.employee_id}: ${row.first_name} ${row.last_name} (${row.status})`);
    });
    
    // Check if there's an employee with ID 9
    const emp9 = allEmployees.rows.find(emp => emp.employee_id == 9);
    if (emp9) {
      console.log(`\nEmployee ID 9 found: ${emp9.first_name} ${emp9.last_name}`);
      
      // Check work schedule for August 19th
      const scheduleDate = '2025-08-19';
      console.log(`\nChecking work schedule for ${emp9.first_name} on ${scheduleDate}:`);
      
      const hoursQuery = `SELECT get_employee_working_hours($1, $2::date) as hours`;
      const hoursResult = await pool.query(hoursQuery, [9, scheduleDate]);
      console.log('Work hours:', hoursResult.rows[0].hours);
      
      // Check if 9:30 AM is within work hours
      const hours = hoursResult.rows[0].hours;
      if (hours && hours.start_hour !== null && hours.end_hour !== null) {
        const scheduledHour = 9; // 9:30 AM = hour 9
        if (scheduledHour >= hours.start_hour && scheduledHour < hours.end_hour) {
          console.log('✅ Scheduled time (9:30 AM) is within work hours');
        } else {
          console.log('⚠️  Scheduled time (9:30 AM) is OUTSIDE work hours!');
        }
      }
    } else {
      console.log('\n❌ Employee ID 9 NOT FOUND!');
      
      // Check who should be assigned to VMC machines
      console.log('\nChecking operators qualified for VMC machines...');
      const qualifiedQuery = `
        SELECT e.employee_id, e.first_name, e.last_name, m.name as machine_name
        FROM operator_machine_assignments oma
        JOIN employees e ON oma.employee_id = e.employee_id
        JOIN machines m ON oma.machine_id = m.id
        WHERE m.id = 3
        ORDER BY e.employee_id
      `;
      
      const qualifiedResult = await pool.query(qualifiedQuery);
      console.log('Operators qualified for machine ID 3:');
      qualifiedResult.rows.forEach(row => {
        console.log(`  ${row.employee_id}: ${row.first_name} ${row.last_name} -> ${row.machine_name}`);
      });
    }
    
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
    process.exit();
  }
}

checkEmployee9();