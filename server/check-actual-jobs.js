const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:sassysalad@localhost:5432/cnc_scheduler'
});

async function checkActualJobs() {
  try {
    console.log('=== CHECKING ACTUAL CHRIS JOHNSON JOBS ===\n');
    
    // Get Chris Johnson ID
    const chrisResult = await pool.query(`
      SELECT id, employee_id FROM employees WHERE first_name = 'Chris' AND last_name = 'Johnson'
    `);
    const chris = chrisResult.rows[0];
    console.log(`Chris Johnson: ID=${chris.id}, employee_id=${chris.employee_id}`);
    
    // Check what jobs Chris actually has scheduled
    console.log('\nChris scheduled jobs:');
    const jobs = await pool.query(`
      SELECT 
        ss.slot_date,
        ss.start_datetime,
        ss.duration_minutes,
        ss.status,
        j.job_number,
        jr.operation_name
      FROM schedule_slots ss
      JOIN job_routings jr ON ss.job_routing_id = jr.id
      JOIN jobs j ON jr.job_id = j.id
      WHERE ss.employee_id = $1
      AND ss.status IN ('scheduled', 'in_progress')
      ORDER BY ss.start_datetime
    `, [chris.id]);
    
    console.log(`Found ${jobs.rows.length} scheduled jobs for Chris:`);
    let totalMinutes = 0;
    jobs.rows.forEach(job => {
      totalMinutes += job.duration_minutes;
      console.log(`- ${job.job_number}: ${job.operation_name} on ${job.slot_date} (${job.duration_minutes} min)`);
    });
    
    const totalHours = (totalMinutes / 60).toFixed(1);
    console.log(`\nTotal: ${totalMinutes} minutes = ${totalHours} hours`);
    
    // Check what the Dashboard API is actually calling
    console.log('\n=== TESTING DASHBOARD API CALL ===');
    const today = new Date().toISOString().split('T')[0];
    console.log(`Today: ${today}`);
    
    // Test current day API call
    const fetch = require('child_process').execSync;
    const apiResult = fetch(`curl -s "http://localhost:5000/api/shift-capacity/capacity?date=${today}&period=day"`, {encoding: 'utf8'});
    const shiftData = JSON.parse(apiResult);
    
    console.log(`\nAPI Results for ${today}:`);
    console.log(`1st Shift: ${shiftData.first_shift?.scheduled_hours_formatted} (${shiftData.first_shift?.operators} operators)`);
    console.log(`2nd Shift: ${shiftData.second_shift?.scheduled_hours_formatted} (${shiftData.second_shift?.operators} operators)`);
    
    // Find Chris in the operators detail
    const chrisDetail = shiftData.operators_detail?.find(op => op.name === 'Chris Johnson');
    if (chrisDetail) {
      console.log(`\nChris in API: ${chrisDetail.scheduled_hours}h → ${chrisDetail.shift_type} shift`);
      console.log(`  Shift times: ${chrisDetail.shift_start} - ${chrisDetail.shift_end}`);
    }
    
    // Let's also check what the old API (pre-fix) would return by testing with actual job dates
    if (jobs.rows.length > 0) {
      const jobDate = jobs.rows[0].slot_date;
      console.log(`\n=== TESTING API WITH ACTUAL JOB DATE: ${jobDate} ===`);
      
      const jobDateResult = fetch(`curl -s "http://localhost:5000/api/shift-capacity/capacity?date=${jobDate}&period=day"`, {encoding: 'utf8'});
      const jobShiftData = JSON.parse(jobDateResult);
      
      console.log(`1st Shift: ${jobShiftData.first_shift?.scheduled_hours_formatted}`);
      console.log(`2nd Shift: ${jobShiftData.second_shift?.scheduled_hours_formatted}`);
      
      const chrisJobDetail = jobShiftData.operators_detail?.find(op => op.name === 'Chris Johnson');
      if (chrisJobDetail) {
        console.log(`Chris on job date: ${chrisJobDetail.scheduled_hours}h → ${chrisJobDetail.shift_type} shift`);
      }
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

checkActualJobs();
