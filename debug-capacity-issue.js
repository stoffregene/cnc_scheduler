const { Pool } = require('./server/node_modules/pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

async function debugCapacityIssue() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/cnc_scheduler',
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });
  
  try {
    console.log('🔍 Debugging capacity over-packing issue...\n');
    
    // Check for days with excessive workload
    const capacityCheck = await pool.query(`
      SELECT 
        ss.slot_date,
        COUNT(DISTINCT ss.job_id) as unique_jobs,
        COUNT(ss.id) as total_slots,
        COUNT(ss.id) * 15 / 60.0 as total_hours,
        STRING_AGG(DISTINCT 'Job ' || j.job_number, ', ' ORDER BY 'Job ' || j.job_number) as job_numbers
      FROM schedule_slots ss
      JOIN jobs j ON ss.job_id = j.id
      WHERE ss.status IN ('scheduled', 'in_progress')
        AND ss.slot_date >= CURRENT_DATE
      GROUP BY ss.slot_date
      HAVING COUNT(ss.id) * 15 / 60.0 > 50 -- More than 50 hours in a day (unrealistic)
      ORDER BY ss.slot_date
      LIMIT 10
    `);
    
    if (capacityCheck.rows.length > 0) {
      console.log('🚨 Found days with excessive workload:');
      capacityCheck.rows.forEach(day => {
        console.log(`📅 ${day.slot_date}: ${day.total_hours}h (${day.unique_jobs} jobs, ${day.total_slots} slots)`);
        console.log(`   Jobs: ${day.job_numbers}\n`);
      });
    } else {
      console.log('✅ No days with excessive workload found.\n');
    }
    
    // Check machine utilization on busy days
    const machineUtilization = await pool.query(`
      SELECT 
        ss.slot_date,
        m.name as machine_name,
        e.first_name || ' ' || e.last_name as operator_name,
        COUNT(ss.id) as slots_used,
        COUNT(ss.id) * 15 / 60.0 as hours_used,
        COUNT(DISTINCT ss.job_id) as jobs_assigned
      FROM schedule_slots ss
      JOIN machines m ON ss.machine_id = m.id
      JOIN employees e ON ss.employee_id = e.id
      WHERE ss.status IN ('scheduled', 'in_progress')
        AND ss.slot_date >= CURRENT_DATE
      GROUP BY ss.slot_date, m.id, m.name, e.id, e.first_name, e.last_name
      HAVING COUNT(ss.id) * 15 / 60.0 > 8 -- More than 8 hours per day
      ORDER BY ss.slot_date, hours_used DESC
      LIMIT 20
    `);
    
    if (machineUtilization.rows.length > 0) {
      console.log('⚠️  Machine-operator pairs with high utilization:');
      machineUtilization.rows.forEach(pair => {
        console.log(`📅 ${pair.slot_date}: ${pair.machine_name} + ${pair.operator_name}`);
        console.log(`   ${pair.hours_used}h (${pair.slots_used} slots, ${pair.jobs_assigned} jobs)\n`);
      });
    } else {
      console.log('✅ No machine-operator pairs with excessive hours found.\n');
    }
    
    // Check for overlapping schedules (should not exist)
    const overlappingCheck = await pool.query(`
      SELECT 
        ss1.job_id as job1_id,
        j1.job_number as job1_number,
        ss1.machine_id,
        m.name as machine_name,
        ss1.employee_id,
        e.first_name || ' ' || e.last_name as operator_name,
        ss1.start_datetime as start1,
        ss1.end_datetime as end1,
        ss2.job_id as job2_id,
        j2.job_number as job2_number,
        ss2.start_datetime as start2,
        ss2.end_datetime as end2
      FROM schedule_slots ss1
      JOIN schedule_slots ss2 ON (
        (ss1.machine_id = ss2.machine_id OR ss1.employee_id = ss2.employee_id)
        AND ss1.id != ss2.id
        AND ss1.slot_date = ss2.slot_date
        AND ss1.start_datetime < ss2.end_datetime
        AND ss1.end_datetime > ss2.start_datetime
      )
      JOIN machines m ON ss1.machine_id = m.id
      JOIN employees e ON ss1.employee_id = e.id
      JOIN jobs j1 ON ss1.job_id = j1.id
      JOIN jobs j2 ON ss2.job_id = j2.id
      WHERE ss1.status IN ('scheduled', 'in_progress')
        AND ss2.status IN ('scheduled', 'in_progress')
      ORDER BY ss1.start_datetime
      LIMIT 10
    `);
    
    if (overlappingCheck.rows.length > 0) {
      console.log('🚨 Found overlapping schedules (CRITICAL ISSUE):');
      overlappingCheck.rows.forEach(overlap => {
        console.log(`⚠️  ${overlap.machine_name} + ${overlap.operator_name}:`);
        console.log(`   Job ${overlap.job1_number}: ${overlap.start1} - ${overlap.end1}`);
        console.log(`   Job ${overlap.job2_number}: ${overlap.start2} - ${overlap.end2}\n`);
      });
    } else {
      console.log('✅ No overlapping schedules found.\n');
    }
    
  } catch (error) {
    console.error('❌ Debug failed:', error.message);
  } finally {
    await pool.end();
  }
}

debugCapacityIssue();