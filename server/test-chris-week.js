const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:sassysalad@localhost:5732/cnc_scheduler'
});

async function testChrisWeek() {
  try {
    console.log('=== TESTING CHRIS WORKING HOURS FOR WEEK ===\n');
    
    const chrisId = 7;
    const startDate = '2025-08-18'; // Monday of that week
    
    console.log(`Testing get_employee_working_hours for Chris (ID: ${chrisId}) on ${startDate}:`);
    
    try {
      const result = await pool.query(`
        SELECT * FROM get_employee_working_hours($1, $2::date)
      `, [chrisId, startDate]);
      
      console.log('Success! Result:', result.rows[0]);
      
      if (result.rows[0]) {
        const wh = result.rows[0];
        const shift = (wh.start_hour >= 4 && wh.start_hour <= 15) ? '1st shift' : '2nd shift';
        console.log(`Shift assignment: ${shift}`);
      }
    } catch (error) {
      console.log('ERROR:', error.message);
      console.log('This explains why Chris is skipped in the shift-capacity route!');
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

testChrisWeek();
