const { Pool } = require('pg');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function testDrewSlots() {
  try {
    // Test what slots are actually occupied for Drew on Aug 12th
    const occupiedResult = await pool.query(`
      SELECT 
        ss.start_datetime,
        ss.end_datetime,
        ss.duration_minutes,
        j.job_number
      FROM schedule_slots ss
      JOIN jobs j ON ss.job_id = j.id
      WHERE ss.employee_id = 9 -- Drew
      AND ss.slot_date = '2025-08-12'
      ORDER BY ss.start_datetime
    `);
    
    console.log('Occupied slots for Drew on Aug 12:');
    occupiedResult.rows.forEach(slot => {
      console.log(`  Job ${slot.job_number}: ${new Date(slot.start_datetime).toLocaleTimeString()} - ${new Date(slot.end_datetime).toLocaleTimeString()} (${slot.duration_minutes} min)`);
    });
    
    // Check if there are any slots from 6-11 AM that should be available
    console.log('\nAnalyzing 6-11 AM availability:');
    console.log('Drew works 6 AM - 6 PM (12 hours = 720 minutes)');
    console.log('Current job: 11 AM - 11 PM (720 minutes)');
    console.log('Available window: 6 AM - 11 AM = 5 hours = 300 minutes');
    console.log('So a job up to 300 minutes COULD fit before the existing job');
    
    // Check time slot calculation
    const testTimes = [
      '2025-08-12 06:00:00', // 6 AM
      '2025-08-12 11:00:00', // 11 AM
      '2025-08-12 18:00:00', // 6 PM
      '2025-08-12 23:00:00'  // 11 PM
    ];
    
    console.log('\nTime slot calculations:');
    for (const testTime of testTimes) {
      const result = await pool.query('SELECT calculate_time_slot($1::timestamp) as slot', [testTime]);
      console.log(`  ${testTime} = slot ${result.rows[0].slot}`);
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

testDrewSlots();