const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function fixDrewSchedule() {
  try {
    console.log('Updating Drew Darling\'s schedule to correct hours (4:30 AM to 3:00 PM)...');
    
    // Update Drew's schedule in employees table
    const result = await pool.query(`
      UPDATE employees 
      SET 
        start_time = '04:30:00',
        end_time = '15:00:00',
        updated_at = CURRENT_TIMESTAMP
      WHERE id = 9
      RETURNING id, first_name, last_name, start_time, end_time
    `);
    
    if (result.rows.length > 0) {
      const drew = result.rows[0];
      console.log('✅ Updated Drew\'s schedule:');
      console.log(`  Name: ${drew.first_name} ${drew.last_name}`);
      console.log(`  Start time: ${drew.start_time} (4:30 AM)`);
      console.log(`  End time: ${drew.end_time} (3:00 PM)`);
      console.log(`  Total shift: 10.5 hours`);
    }
    
    // Also check if we need to update any custom hours
    const customCheck = await pool.query(`
      UPDATE employees 
      SET 
        custom_start_hour = 4,
        custom_end_hour = 15,
        custom_duration_hours = 10.5
      WHERE id = 9 
      AND (custom_start_hour IS NULL OR custom_start_hour != 4)
      RETURNING custom_start_hour, custom_end_hour, custom_duration_hours
    `);
    
    if (customCheck.rows.length > 0) {
      console.log('✅ Updated custom hours:');
      console.log(`  Custom start hour: ${customCheck.rows[0].custom_start_hour}`);
      console.log(`  Custom end hour: ${customCheck.rows[0].custom_end_hour}`);
      console.log(`  Custom duration: ${customCheck.rows[0].custom_duration_hours} hours`);
    }
    
    console.log('\n📋 Drew\'s schedule has been corrected in the database.');
    console.log('The scheduler will now use 4:30 AM - 3:00 PM for Drew\'s availability.');
    
  } catch (error) {
    console.error('Error updating Drew\'s schedule:', error);
  } finally {
    await pool.end();
  }
}

fixDrewSchedule();