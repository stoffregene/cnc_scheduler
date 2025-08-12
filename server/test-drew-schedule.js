const { Pool } = require('pg');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function testDrewSchedule() {
  try {
    // Find Drew Darling's employee ID
    const drewResult = await pool.query(`
      SELECT id, first_name || ' ' || last_name as name, shift_pattern_id
      FROM employees 
      WHERE first_name = 'Drew' AND last_name = 'Darling'
    `);
    
    if (drewResult.rows.length === 0) {
      console.log('Drew Darling not found');
      return;
    }
    
    const drew = drewResult.rows[0];
    console.log('Drew Darling:', drew);
    
    // Get his shift pattern
    if (drew.shift_pattern_id) {
      const shiftResult = await pool.query(`
        SELECT * FROM shift_patterns WHERE id = $1
      `, [drew.shift_pattern_id]);
      
      console.log('Drew\'s shift pattern:', JSON.stringify(shiftResult.rows[0], null, 2));
    }
    
    // Test the working hours function for today
    const today = new Date();
    const workingHoursResult = await pool.query(`
      SELECT * FROM get_employee_working_hours($1, $2::date)
    `, [drew.id, today]);
    
    console.log('Drew\'s working hours for today:', JSON.stringify(workingHoursResult.rows[0], null, 2));
    
    // Find an existing scheduled job for Drew
    const jobResult = await pool.query(`
      SELECT 
        ss.id, 
        ss.job_id, 
        j.job_number, 
        ss.machine_id, 
        ss.employee_id,
        ss.duration_minutes,
        ss.start_datetime,
        ss.slot_date
      FROM schedule_slots ss
      JOIN jobs j ON ss.job_id = j.id
      WHERE ss.employee_id = $1
      ORDER BY ss.start_datetime
      LIMIT 1
    `, [drew.id]);
    
    if (jobResult.rows.length > 0) {
      const job = jobResult.rows[0];
      console.log('Drew\'s existing job:', job);
      
      // Test what available slots would be returned for this job
      const SchedulingService = require('./services/schedulingService');
      const schedulingService = new SchedulingService(pool);
      
      const availableSlots = await schedulingService.findAvailableSlots(
        job.machine_id,
        job.employee_id,
        job.duration_minutes,
        new Date(job.slot_date),
        job.job_id  // exclude the current job
      );
      
      console.log('Available slots for Drew on', job.slot_date, ':', availableSlots.length);
      if (availableSlots.length > 0) {
        console.log('First available slot:', JSON.stringify(availableSlots[0], null, 2));
      }
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

testDrewSchedule();