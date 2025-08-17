const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:sassysalad@localhost:5432/cnc_scheduler'
});

async function fixEmployeeWorkSchedulesTable() {
  try {
    console.log('Fixing employee_work_schedules table to match function expectations...\n');
    
    // 1. First, let's see what data exists
    const existingData = await pool.query(`
      SELECT * FROM employee_work_schedules ORDER BY employee_id, day_of_week
    `);
    
    console.log('Current data in table:');
    existingData.rows.forEach(row => {
      const startHour = row.start_time ? parseInt(row.start_time.split(':')[0]) : null;
      const endHour = row.end_time ? parseInt(row.end_time.split(':')[0]) : null;
      console.log(`Employee ${row.employee_id}, Day ${row.day_of_week}: ${row.start_time} - ${row.end_time} (${startHour}h - ${endHour}h)`);
    });
    
    // 2. Add new columns
    await pool.query(`
      ALTER TABLE employee_work_schedules 
      ADD COLUMN IF NOT EXISTS start_hour INTEGER,
      ADD COLUMN IF NOT EXISTS end_hour INTEGER,
      ADD COLUMN IF NOT EXISTS is_working_day BOOLEAN DEFAULT true
    `);
    console.log('✅ Added start_hour, end_hour, and is_working_day columns');
    
    // 3. Migrate existing data from start_time/end_time to start_hour/end_hour
    await pool.query(`
      UPDATE employee_work_schedules 
      SET 
        start_hour = EXTRACT(HOUR FROM start_time)::INTEGER,
        end_hour = EXTRACT(HOUR FROM end_time)::INTEGER,
        is_working_day = enabled
      WHERE start_time IS NOT NULL AND end_time IS NOT NULL
    `);
    console.log('✅ Migrated existing time data to hour format');
    
    // 4. Drop the old columns
    await pool.query(`
      ALTER TABLE employee_work_schedules 
      DROP COLUMN IF EXISTS start_time,
      DROP COLUMN IF EXISTS end_time,
      DROP COLUMN IF EXISTS enabled
    `);
    console.log('✅ Removed old time columns');
    
    // 5. Verify the new structure
    const newData = await pool.query(`
      SELECT * FROM employee_work_schedules ORDER BY employee_id, day_of_week
    `);
    
    console.log('\nNew table structure and data:');
    newData.rows.forEach(row => {
      console.log(`Employee ${row.employee_id}, Day ${row.day_of_week}: ${row.start_hour}:00 - ${row.end_hour}:00 (working: ${row.is_working_day})`);
    });
    
    // 6. Test the function with the fixed table
    console.log('\nTesting get_employee_working_hours function:');
    const today = new Date().toISOString().split('T')[0];
    
    // Test with an employee that has data
    if (newData.rows.length > 0) {
      const testEmployeeId = newData.rows[0].employee_id;
      try {
        const result = await pool.query(`
          SELECT * FROM get_employee_working_hours($1, $2::date)
        `, [testEmployeeId, today]);
        
        console.log(`Employee ${testEmployeeId} working hours:`, result.rows[0]);
      } catch (error) {
        console.log('Function test ERROR:', error.message);
      }
    }
    
    console.log('\n✨ Employee work schedules table successfully fixed!');
    
  } catch (error) {
    console.error('Error fixing table:', error);
  } finally {
    await pool.end();
  }
}

fixEmployeeWorkSchedulesTable();