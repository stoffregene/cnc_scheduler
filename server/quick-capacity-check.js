const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function checkCapacity() {
  try {
    console.log('🔍 Checking schedule capacity...\n');
    
    // Check recent scheduled days
    const dailyCapacity = await pool.query(`
      SELECT 
        ss.slot_date,
        COUNT(DISTINCT ss.job_id) as unique_jobs,
        COUNT(ss.id) as total_slots,
        COUNT(ss.id) * 15 / 60.0 as total_hours,
        STRING_AGG(DISTINCT j.job_number::text, ', ' ORDER BY j.job_number::text) as job_numbers
      FROM schedule_slots ss
      JOIN jobs j ON ss.job_id = j.id
      WHERE ss.status IN ('scheduled', 'in_progress')
      GROUP BY ss.slot_date
      ORDER BY ss.slot_date DESC
      LIMIT 10
    `);
    
    console.log('📊 Recent scheduled days:');
    if (dailyCapacity.rows.length === 0) {
      console.log('   No scheduled work found.\n');
    } else {
      dailyCapacity.rows.forEach(day => {
        console.log(`📅 ${day.slot_date}: ${day.total_hours}h (${day.unique_jobs} jobs, ${day.total_slots} slots)`);
        console.log(`   Jobs: ${day.job_numbers}\n`);
      });
    }
    
    // Check machine/operator utilization on the busiest day
    if (dailyCapacity.rows.length > 0) {
      const busiestDay = dailyCapacity.rows[0].slot_date;
      
      const machineUtilization = await pool.query(`
        SELECT 
          m.name as machine_name,
          e.first_name || ' ' || e.last_name as operator_name,
          COUNT(ss.id) as slots_used,
          COUNT(ss.id) * 15 / 60.0 as hours_used,
          COUNT(DISTINCT ss.job_id) as jobs_assigned,
          STRING_AGG(DISTINCT j.job_number::text, ', ' ORDER BY j.job_number::text) as job_numbers
        FROM schedule_slots ss
        JOIN machines m ON ss.machine_id = m.id
        JOIN employees e ON ss.employee_id = e.id
        JOIN jobs j ON ss.job_id = j.id
        WHERE ss.slot_date = $1
          AND ss.status IN ('scheduled', 'in_progress')
        GROUP BY m.id, m.name, e.id, e.first_name, e.last_name
        ORDER BY hours_used DESC
      `, [busiestDay]);
      
      console.log(`🏭 Machine-operator utilization on ${busiestDay}:`);
      machineUtilization.rows.forEach(pair => {
        console.log(`   ${pair.machine_name} + ${pair.operator_name}: ${pair.hours_used}h (${pair.jobs_assigned} jobs)`);
        console.log(`      Jobs: ${pair.job_numbers}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkCapacity();