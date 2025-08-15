const { Pool } = require('pg');
require('dotenv').config();

async function analyzeScheduleConflicts() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL
  });

  try {
    console.log('🔍 Analyzing Schedule for Conflicts and Overlaps\n');
    
    // 1. Overall schedule statistics
    console.log('1. Schedule Overview...');
    console.log('='.repeat(80));
    
    const overviewQuery = `
      SELECT 
        COUNT(*) as total_slots,
        COUNT(DISTINCT job_id) as unique_jobs,
        COUNT(DISTINCT machine_id) as machines_used,
        COUNT(DISTINCT employee_id) as employees_used,
        MIN(slot_date) as earliest_date,
        MAX(slot_date) as latest_date
      FROM schedule_slots
    `;
    
    const overview = await pool.query(overviewQuery);
    const stats = overview.rows[0];
    
    console.log(`Total Schedule Slots: ${stats.total_slots}`);
    console.log(`Unique Jobs: ${stats.unique_jobs}`);
    console.log(`Machines Used: ${stats.machines_used}`);
    console.log(`Employees Used: ${stats.employees_used}`);
    console.log(`Date Range: ${stats.earliest_date} to ${stats.latest_date}`);
    
    // 2. Machine conflicts (same machine, overlapping times)
    console.log('\n2. Machine Double-Booking Conflicts...');
    console.log('='.repeat(80));
    
    const machineConflictsQuery = `
      SELECT 
        m.name as machine_name,
        s1.slot_date,
        s1.job_id as job1_id,
        j1.job_number as job1_number,
        s1.start_datetime as job1_start,
        s1.end_datetime as job1_end,
        s2.job_id as job2_id,
        j2.job_number as job2_number,
        s2.start_datetime as job2_start,
        s2.end_datetime as job2_end
      FROM schedule_slots s1
      JOIN schedule_slots s2 ON s1.machine_id = s2.machine_id 
        AND s1.slot_date = s2.slot_date
        AND s1.id < s2.id  -- Avoid duplicates
        AND (
          (s1.start_datetime < s2.end_datetime AND s1.end_datetime > s2.start_datetime)
        )
      JOIN machines m ON s1.machine_id = m.id
      JOIN jobs j1 ON s1.job_id = j1.id
      JOIN jobs j2 ON s2.job_id = j2.id
      ORDER BY m.name, s1.slot_date, s1.start_datetime
    `;
    
    const machineConflicts = await pool.query(machineConflictsQuery);
    
    if (machineConflicts.rows.length === 0) {
      console.log('✅ No machine double-booking conflicts found!');
    } else {
      console.log(`❌ Found ${machineConflicts.rows.length} machine conflicts:`);
      console.log('-'.repeat(80));
      machineConflicts.rows.forEach(conflict => {
        console.log(`${conflict.machine_name} on ${conflict.slot_date}:`);
        console.log(`  Job ${conflict.job1_number}: ${conflict.job1_start} - ${conflict.job1_end}`);
        console.log(`  Job ${conflict.job2_number}: ${conflict.job2_start} - ${conflict.job2_end}`);
        console.log('');
      });
    }
    
    // 3. Employee conflicts (same employee, overlapping times)
    console.log('3. Employee Double-Booking Conflicts...');
    console.log('='.repeat(80));
    
    const employeeConflictsQuery = `
      SELECT 
        e.first_name || ' ' || e.last_name as employee_name,
        s1.slot_date,
        s1.job_id as job1_id,
        j1.job_number as job1_number,
        m1.name as machine1_name,
        s1.start_datetime as job1_start,
        s1.end_datetime as job1_end,
        s2.job_id as job2_id,
        j2.job_number as job2_number,
        m2.name as machine2_name,
        s2.start_datetime as job2_start,
        s2.end_datetime as job2_end
      FROM schedule_slots s1
      JOIN schedule_slots s2 ON s1.employee_id = s2.employee_id 
        AND s1.slot_date = s2.slot_date
        AND s1.id < s2.id  -- Avoid duplicates
        AND (
          (s1.start_datetime < s2.end_datetime AND s1.end_datetime > s2.start_datetime)
        )
      JOIN employees e ON s1.employee_id = e.id
      JOIN jobs j1 ON s1.job_id = j1.id
      JOIN jobs j2 ON s2.job_id = j2.id
      JOIN machines m1 ON s1.machine_id = m1.id
      JOIN machines m2 ON s2.machine_id = m2.id
      ORDER BY e.last_name, s1.slot_date, s1.start_datetime
    `;
    
    const employeeConflicts = await pool.query(employeeConflictsQuery);
    
    if (employeeConflicts.rows.length === 0) {
      console.log('✅ No employee double-booking conflicts found!');
    } else {
      console.log(`❌ Found ${employeeConflicts.rows.length} employee conflicts:`);
      console.log('-'.repeat(80));
      employeeConflicts.rows.forEach(conflict => {
        console.log(`${conflict.employee_name} on ${conflict.slot_date}:`);
        console.log(`  Job ${conflict.job1_number} on ${conflict.machine1_name}: ${conflict.job1_start} - ${conflict.job1_end}`);
        console.log(`  Job ${conflict.job2_number} on ${conflict.machine2_name}: ${conflict.job2_start} - ${conflict.job2_end}`);
        console.log('');
      });
    }
    
    // 4. Machine utilization per day
    console.log('4. Machine Utilization Analysis...');
    console.log('='.repeat(80));
    
    const utilizationQuery = `
      SELECT 
        m.name as machine_name,
        s.slot_date,
        COUNT(*) as jobs_scheduled,
        SUM(s.duration_minutes) as total_minutes,
        ROUND(SUM(s.duration_minutes) / 60.0, 1) as total_hours,
        ROUND((SUM(s.duration_minutes) / (8.0 * 60)) * 100, 1) as utilization_percent
      FROM schedule_slots s
      JOIN machines m ON s.machine_id = m.id
      GROUP BY m.name, s.slot_date
      HAVING COUNT(*) > 1 OR SUM(s.duration_minutes) > 480  -- More than 1 job or 8 hours
      ORDER BY s.slot_date, utilization_percent DESC
    `;
    
    const utilization = await pool.query(utilizationQuery);
    
    if (utilization.rows.length === 0) {
      console.log('No heavily utilized machines found.');
    } else {
      console.log('Machines with high utilization or multiple jobs:');
      console.log('Machine'.padEnd(15) + '| Date       | Jobs | Hours | Utilization');
      console.log('-'.repeat(65));
      utilization.rows.forEach(util => {
        const utilizationColor = util.utilization_percent > 100 ? '🔴' : util.utilization_percent > 80 ? '🟡' : '🟢';
        console.log(`${util.machine_name.padEnd(15)}| ${util.slot_date} | ${util.jobs_scheduled.toString().padEnd(4)} | ${util.total_hours.toString().padEnd(5)} | ${utilizationColor} ${util.utilization_percent}%`);
      });
    }
    
    // 5. Jobs scheduled outside working hours
    console.log('\n5. Jobs Scheduled Outside Working Hours...');
    console.log('='.repeat(80));
    
    const outsideHoursQuery = `
      SELECT 
        j.job_number,
        m.name as machine_name,
        e.first_name || ' ' || e.last_name as employee_name,
        s.slot_date,
        s.start_datetime,
        s.end_datetime,
        EXTRACT(HOUR FROM s.start_datetime) as start_hour,
        EXTRACT(HOUR FROM s.end_datetime) as end_hour
      FROM schedule_slots s
      JOIN jobs j ON s.job_id = j.id
      JOIN machines m ON s.machine_id = m.id
      JOIN employees e ON s.employee_id = e.id
      WHERE 
        EXTRACT(HOUR FROM s.start_datetime) < 6 
        OR EXTRACT(HOUR FROM s.end_datetime) > 18
        OR EXTRACT(DOW FROM s.slot_date) IN (0, 6)  -- Weekend
      ORDER BY s.slot_date, s.start_datetime
      LIMIT 20
    `;
    
    const outsideHours = await pool.query(outsideHoursQuery);
    
    if (outsideHours.rows.length === 0) {
      console.log('✅ All jobs scheduled within normal working hours');
    } else {
      console.log(`⚠️  Found ${outsideHours.rows.length} jobs scheduled outside normal hours:`);
      console.log('Job Number'.padEnd(12) + '| Machine'.padEnd(15) + '| Employee'.padEnd(20) + '| Date/Time');
      console.log('-'.repeat(80));
      outsideHours.rows.slice(0, 10).forEach(job => {
        console.log(`${job.job_number.padEnd(12)}| ${job.machine_name.padEnd(15)}| ${job.employee_name.padEnd(20)}| ${job.slot_date} ${job.start_hour}:00-${job.end_hour}:00`);
      });
      if (outsideHours.rows.length > 10) {
        console.log(`... and ${outsideHours.rows.length - 10} more`);
      }
    }
    
    // 6. Failed jobs summary
    console.log('\n6. Jobs that Failed to Schedule...');
    console.log('='.repeat(80));
    
    const failedJobsQuery = `
      SELECT 
        j.job_number,
        j.status,
        j.promised_date,
        j.due_date,
        COUNT(jr.id) as routing_count,
        COUNT(ss.id) as scheduled_count
      FROM jobs j
      LEFT JOIN job_routings jr ON j.id = jr.job_id
      LEFT JOIN schedule_slots ss ON j.id = ss.job_id
      WHERE j.status = 'pending'
      AND j.auto_scheduled = FALSE
      GROUP BY j.id, j.job_number, j.status, j.promised_date, j.due_date
      HAVING COUNT(ss.id) = 0  -- No schedule slots
      ORDER BY j.promised_date ASC NULLS LAST
    `;
    
    const failedJobs = await pool.query(failedJobsQuery);
    
    if (failedJobs.rows.length === 0) {
      console.log('✅ All schedulable jobs were successfully scheduled!');
    } else {
      console.log(`❌ ${failedJobs.rows.length} jobs failed to schedule:`);
      console.log('Job Number'.padEnd(12) + '| Due Date   | Routings | Reason');
      console.log('-'.repeat(50));
      failedJobs.rows.forEach(job => {
        const dueDate = job.promised_date || job.due_date || 'No due date';
        console.log(`${job.job_number.padEnd(12)}| ${dueDate.toString().substring(0, 10).padEnd(10)} | ${job.routing_count.toString().padEnd(8)} | Unknown`);
      });
    }
    
  } catch (error) {
    console.error('❌ Error analyzing schedule:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    await pool.end();
  }
}

analyzeScheduleConflicts();