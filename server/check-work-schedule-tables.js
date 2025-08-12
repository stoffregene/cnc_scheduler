const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function checkWorkScheduleTables() {
  try {
    // Check employee_work_schedules table structure
    const workSchedulesSchema = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'employee_work_schedules'
      ORDER BY ordinal_position
    `);
    
    console.log('employee_work_schedules table structure:');
    if (workSchedulesSchema.rows.length > 0) {
      workSchedulesSchema.rows.forEach(row => {
        console.log(`  ${row.column_name}: ${row.data_type}`);
      });
      
      // Sample data from this table
      const sampleData = await pool.query(`
        SELECT * FROM employee_work_schedules WHERE employee_id = 13 LIMIT 5
      `);
      console.log('\nSample data for Kyle (employee_id 13):');
      sampleData.rows.forEach(row => {
        console.log(`  Day ${row.day_of_week}: ${row.start_time} - ${row.end_time} (enabled: ${row.enabled})`);
      });
    } else {
      console.log('  Table does not exist');
    }
    
    // Check employee_shift_schedule table 
    const shiftScheduleSchema = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'employee_shift_schedule'
      ORDER BY ordinal_position
    `);
    
    console.log('\nemployee_shift_schedule table structure:');
    if (shiftScheduleSchema.rows.length > 0) {
      shiftScheduleSchema.rows.forEach(row => {
        console.log(`  ${row.column_name}: ${row.data_type}`);
      });
    } else {
      console.log('  Table does not exist');
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

checkWorkScheduleTables();