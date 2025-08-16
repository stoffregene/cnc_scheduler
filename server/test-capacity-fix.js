const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function testCapacityFix() {
  try {
    console.log('=== TESTING SHIFT CAPACITY FIX ===');
    
    console.log('1. Testing the updated shift capacity query for August 14, 2025...');
    
    // Use the same query as the API
    const capacityQuery = `
      SELECT 
        e.employee_id,
        e.first_name,
        e.last_name,
        e.position,
        e.shift_type,
        e.start_time,
        e.end_time,
        e.numeric_id,
        COALESCE(SUM(ss.duration_minutes), 0) as total_scheduled_minutes,
        COUNT(DISTINCT ss.slot_date) as working_days
      FROM employees e
      LEFT JOIN schedule_slots ss ON e.numeric_id = ss.employee_id
        AND ss.slot_date BETWEEN $1::date AND $2::date
        AND ss.status IN ('scheduled', 'in_progress')
      WHERE e.status = 'active'
      GROUP BY e.employee_id, e.first_name, e.last_name, e.position, e.shift_type, e.start_time, e.end_time, e.numeric_id
      ORDER BY e.first_name, e.last_name
    `;
    
    const result = await pool.query(capacityQuery, ['2025-08-14', '2025-08-14']);
    
    console.log('  Results:');
    let firstShiftScheduled = 0;
    let secondShiftScheduled = 0;
    
    result.rows.forEach(emp => {
      if (emp.total_scheduled_minutes > 0) {
        console.log(`    ${emp.first_name} ${emp.last_name} (${emp.employee_id}, numeric_id: ${emp.numeric_id}): ${emp.total_scheduled_minutes} minutes, ${emp.shift_type} shift`);
        
        if (emp.shift_type === 'day') {
          firstShiftScheduled += emp.total_scheduled_minutes;
        } else if (emp.shift_type === 'night') {
          secondShiftScheduled += emp.total_scheduled_minutes;
        }
      }
    });
    
    console.log(`\n2. Summary for August 14, 2025:`);
    console.log(`   1st shift (day): ${firstShiftScheduled} minutes scheduled`);
    console.log(`   2nd shift (night): ${secondShiftScheduled} minutes scheduled`);
    
    // Verify the specific job 60241
    console.log('\n3. Verifying job 60241 details...');
    const jobResult = await pool.query(`
      SELECT ss.*, j.job_number, m.name as machine_name, e.first_name, e.last_name, e.shift_type, e.numeric_id
      FROM schedule_slots ss
      JOIN jobs j ON ss.job_id = j.id
      JOIN machines m ON ss.machine_id = m.id
      JOIN employees e ON ss.employee_id = e.numeric_id
      WHERE j.job_number = '60241'
    `);
    
    if (jobResult.rows.length > 0) {
      const job = jobResult.rows[0];
      console.log(`   Job 60241: ${job.duration_minutes}min on ${job.machine_name}`);
      console.log(`   Assigned to: ${job.first_name} ${job.last_name} (numeric_id: ${job.numeric_id}, ${job.shift_type} shift)`);
      console.log(`   Date: ${job.slot_date}`);
      console.log(`   Time: ${job.start_datetime} - ${job.end_datetime}`);
    }
    
    console.log('\n✅ Test completed! The shift capacity should now correctly show:');
    console.log('   - 0 minutes on day shift (since Corey is night shift)');
    console.log('   - 45 minutes on night shift for August 14th');
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
    process.exit();
  }
}

testCapacityFix();