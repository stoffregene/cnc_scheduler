const { Pool } = require('pg');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function checkScheduleSlots() {
  try {
    const result = await pool.query(`
      SELECT 
        ss.id,
        j.job_number,
        jr.operation_name,
        jr.operation_number,
        jr.estimated_hours,
        m.name as machine_name,
        e.first_name || ' ' || e.last_name as employee_name,
        ss.duration_minutes,
        ss.slot_date,
        ss.notes
      FROM schedule_slots ss
      JOIN jobs j ON ss.job_id = j.id
      JOIN job_routings jr ON ss.job_routing_id = jr.id
      JOIN machines m ON ss.machine_id = m.id
      JOIN employees e ON ss.employee_id = e.id
      WHERE j.job_number = '12345'
      ORDER BY jr.sequence_order, ss.start_datetime;
    `);
    
    console.log('Schedule slots for job 12345:');
    console.log(JSON.stringify(result.rows, null, 2));
    
    console.log('\nSummary:');
    const summary = result.rows.reduce((acc, row) => {
      const key = `${row.machine_name}-${row.operation_name}`;
      if (!acc[key]) {
        acc[key] = { slots: 0, total_minutes: 0 };
      }
      acc[key].slots++;
      acc[key].total_minutes += row.duration_minutes;
      return acc;
    }, {});
    
    console.log(summary);
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

checkScheduleSlots();