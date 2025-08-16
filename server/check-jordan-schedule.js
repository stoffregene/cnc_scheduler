const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function checkJordanSchedule() {
  try {
    const result = await pool.query(`
      SELECT 
        e.first_name || ' ' || e.last_name as name,
        e.numeric_id,
        ews.day_of_week,
        ews.start_time,
        ews.end_time
      FROM employees e
      LEFT JOIN employee_work_schedules ews ON e.numeric_id = ews.employee_id
      WHERE e.first_name = 'Jiordan'
      ORDER BY ews.day_of_week
    `);
    
    console.log('Jordan\'s Work Schedule:');
    console.log('=======================');
    result.rows.forEach(row => {
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      console.log(`${days[row.day_of_week]}: ${row.start_time} - ${row.end_time}`);
    });
    
    // Check what's scheduled on Tuesday Aug 19
    const aug19Schedule = await pool.query(`
      SELECT 
        j.job_number,
        jr.operation_name,
        ss.start_datetime,
        ss.end_datetime,
        e.first_name || ' ' || e.last_name as operator
      FROM schedule_slots ss
      INNER JOIN job_routings jr ON ss.job_routing_id = jr.id
      INNER JOIN jobs j ON ss.job_id = j.id
      INNER JOIN employees e ON ss.employee_id = e.numeric_id
      WHERE DATE(ss.start_datetime) = '2025-08-19'
      ORDER BY ss.start_datetime
    `);
    
    console.log('\n\nAll Operations Scheduled for Aug 19, 2025:');
    console.log('==========================================');
    aug19Schedule.rows.forEach(op => {
      const start = new Date(op.start_datetime);
      const end = new Date(op.end_datetime);
      console.log(`${start.toLocaleTimeString()} - ${end.toLocaleTimeString()}: ${op.job_number} (${op.operation_name}) - ${op.operator}`);
    });
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

checkJordanSchedule();