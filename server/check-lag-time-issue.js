const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function checkLagTimeIssue() {
  try {
    console.log('=== CHECKING LAG TIME ISSUE ===\n');
    
    // Check current schedule for 12345-1
    const scheduleResult = await pool.query(`
      SELECT 
        j.job_number,
        jr.operation_name,
        jr.sequence_order,
        ss.start_datetime,
        ss.end_datetime,
        e.first_name || ' ' || e.last_name as employee_name,
        m.name as machine_name
      FROM jobs j
      INNER JOIN job_routings jr ON j.id = jr.job_id
      INNER JOIN schedule_slots ss ON jr.id = ss.job_routing_id
      INNER JOIN employees e ON ss.employee_id = e.numeric_id
      INNER JOIN machines m ON ss.machine_id = m.id
      WHERE j.job_number = '12345-1'
      ORDER BY jr.sequence_order
    `);
    
    console.log('Current Schedule for Job 12345-1:');
    console.log('==================================');
    scheduleResult.rows.forEach(op => {
      const start = new Date(op.start_datetime);
      const end = new Date(op.end_datetime);
      console.log(`Op ${op.sequence_order} (${op.operation_name}):`);
      console.log(`  Machine: ${op.machine_name}`);
      console.log(`  Operator: ${op.employee_name}`);
      console.log(`  Start: ${start.toLocaleString()}`);
      console.log(`  End: ${end.toLocaleString()}`);
      console.log('');
    });
    
    // Analyze the lag time
    if (scheduleResult.rows.length >= 2) {
      const op1 = scheduleResult.rows[0];
      const op2 = scheduleResult.rows[1];
      const op1End = new Date(op1.end_datetime);
      const op2Start = new Date(op2.start_datetime);
      const lagHours = (op2Start - op1End) / (1000 * 60 * 60);
      
      console.log('LAG TIME ANALYSIS:');
      console.log('==================');
      console.log(`Op 1 (${op1.operation_name}) ends: ${op1End.toLocaleString()}`);
      console.log(`Op 2 (${op2.operation_name}) starts: ${op2Start.toLocaleString()}`);
      console.log(`Lag time: ${lagHours.toFixed(2)} hours`);
      
      if (lagHours >= 24) {
        console.log('❌ PROBLEM: Using 24-hour lag instead of next calendar day!');
      }
    }
    
    // Check Jordan's availability on the day
    const jordanResult = await pool.query(`
      SELECT 
        e.numeric_id,
        e.first_name || ' ' || e.last_name as name,
        e.shift_type
      FROM employees e
      WHERE e.first_name ILIKE 'Jordan%' OR e.last_name ILIKE 'Jordan%'
    `);
    
    if (jordanResult.rows.length > 0) {
      const jordan = jordanResult.rows[0];
      console.log(`\n${jordan.name}'s Info:`);
      console.log('======================');
      console.log(`Employee ID: ${jordan.numeric_id}`);
      console.log(`Shift Type: ${jordan.shift_type}`);
      
      // Check Jordan's schedule on Aug 19
      const scheduleDate = '2025-08-19';
      const dayOfWeek = new Date(scheduleDate).getDay();
      
      const workSchedule = await pool.query(`
        SELECT start_time, end_time
        FROM employee_work_schedules
        WHERE employee_id = $1 AND day_of_week = $2
      `, [jordan.numeric_id, dayOfWeek]);
      
      if (workSchedule.rows.length > 0) {
        console.log(`Work Schedule on ${scheduleDate} (Day ${dayOfWeek}):`);
        console.log(`  Start: ${workSchedule.rows[0].start_time}`);
        console.log(`  End: ${workSchedule.rows[0].end_time}`);
      }
      
      // Check what Jordan has scheduled on Aug 19
      const jordanSchedule = await pool.query(`
        SELECT 
          j.job_number,
          jr.operation_name,
          ss.start_datetime,
          ss.end_datetime
        FROM schedule_slots ss
        INNER JOIN job_routings jr ON ss.job_routing_id = jr.id
        INNER JOIN jobs j ON ss.job_id = j.id
        WHERE ss.employee_id = $1
        AND DATE(ss.start_datetime) = $2
        ORDER BY ss.start_datetime
      `, [jordan.numeric_id, scheduleDate]);
      
      console.log(`\nJordan's Schedule on ${scheduleDate}:`);
      if (jordanSchedule.rows.length > 0) {
        jordanSchedule.rows.forEach(slot => {
          const start = new Date(slot.start_datetime);
          const end = new Date(slot.end_datetime);
          console.log(`  ${start.toLocaleTimeString()} - ${end.toLocaleTimeString()}: ${slot.job_number} (${slot.operation_name})`);
        });
      } else {
        console.log('  No jobs scheduled - Jordan is available!');
      }
    }
    
    console.log('\n=== PROBLEM IDENTIFIED ===');
    console.log('The system is using a strict 24-hour lag time between SAW/Waterjet and next operations.');
    console.log('It should be using "next calendar day" instead.');
    console.log('For example: If SAW finishes at 9am on Monday, the next op should be able to start');
    console.log('at the beginning of the shift on Tuesday, not 9am Tuesday.');
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

checkLagTimeIssue();