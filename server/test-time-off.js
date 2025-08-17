const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://postgres:sassysalad@localhost:5432/cnc_scheduler'
});

async function testTimeOff() {
  try {
    // Check employee_availability structure
    const columns = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'employee_availability'
      ORDER BY ordinal_position
    `);
    
    console.log('employee_availability columns:');
    columns.rows.forEach(c => {
      console.log(`  - ${c.column_name}: ${c.data_type}`);
    });
    
    // Check current availability for Drew
    const current = await pool.query(`
      SELECT * FROM employee_availability 
      WHERE employee_id = 9 
      ORDER BY date DESC 
      LIMIT 5
    `);
    
    console.log('\nCurrent availability entries for Drew (ID: 9):');
    if (current.rows.length === 0) {
      console.log('  No entries found');
    } else {
      current.rows.forEach(a => {
        console.log(`  ${a.date} - Status: ${a.status}, Reason: ${a.reason}, Type: ${a.time_off_type}`);
      });
    }
    
    // Add time off entries for Drew for next week Monday-Wednesday
    const nextMonday = new Date();
    const daysUntilMonday = (8 - nextMonday.getDay()) % 7 || 7;
    nextMonday.setDate(nextMonday.getDate() + daysUntilMonday);
    const nextTuesday = new Date(nextMonday);
    nextTuesday.setDate(nextTuesday.getDate() + 1);
    const nextWednesday = new Date(nextMonday);
    nextWednesday.setDate(nextWednesday.getDate() + 2);
    
    console.log(`\nAdding time off for Drew from ${nextMonday.toDateString()} to ${nextWednesday.toDateString()}...`);
    
    // Insert entries for each day (the table seems to be per-day based on the schema)
    const dates = [nextMonday, nextTuesday, nextWednesday];
    
    for (const date of dates) {
      const result = await pool.query(`
        INSERT INTO employee_availability 
        (employee_id, date, status, reason, time_off_type, affects_scheduling, auto_reschedule, notes, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
        RETURNING *
      `, [
        9, // Drew's ID
        date.toISOString().split('T')[0],
        'unavailable',
        'Vacation',
        'vacation',
        true, // affects_scheduling
        true, // auto_reschedule
        'Testing time off functionality'
      ]);
      
      console.log(`  ✅ Created entry for ${result.rows[0].date}`);
    }
    
    console.log('\n✅ Time off entries created successfully for Drew Darling (ID: 9)');
    console.log(`  Dates: ${nextMonday.toDateString()} to ${nextWednesday.toDateString()}`);
    console.log(`  Type: vacation`);
    console.log(`  Status: unavailable`);
    console.log(`  Affects scheduling: true`);
    
    // Now test if the scheduler respects this time off
    console.log('\n🔍 Testing scheduler awareness of time off...');
    
    // Check if Drew is available during the time off period
    const availabilityCheck = await pool.query(`
      SELECT * FROM get_employee_working_hours(9, $1::date)
    `, [nextMonday.toISOString().split('T')[0]]);
    
    console.log(`\nDrew's availability on ${nextMonday.toDateString()}:`);
    if (availabilityCheck.rows[0]) {
      const hours = availabilityCheck.rows[0];
      console.log(`  Working day: ${hours.is_working_day}`);
      console.log(`  Start hour: ${hours.start_hour}`);
      console.log(`  End hour: ${hours.end_hour}`);
      console.log(`  Duration: ${hours.duration_hours} hours`);
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    console.error('Details:', error);
    process.exit(1);
  }
}

testTimeOff();