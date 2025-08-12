const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function checkRouting() {
  try {
    // Check what machine job_routing_id 8 should be on
    const routingResult = await pool.query(`
      SELECT 
        jr.id,
        jr.operation_name,
        jr.machine_id as correct_machine_id,
        m.name as correct_machine_name,
        jr.estimated_hours
      FROM job_routings jr
      LEFT JOIN machines m ON jr.machine_id = m.id
      WHERE jr.id = 8
    `);
    
    console.log('Correct routing for job_routing_id 8:');
    console.log(JSON.stringify(routingResult.rows[0], null, 2));
    
    // Check what's wrong with slot 985
    const slotResult = await pool.query(`
      SELECT 
        ss.id,
        ss.job_routing_id,
        ss.machine_id as current_machine_id,
        m.name as current_machine_name,
        ss.employee_id,
        ss.duration_minutes,
        jr.machine_id as should_be_machine_id,
        m2.name as should_be_machine_name
      FROM schedule_slots ss
      JOIN machines m ON ss.machine_id = m.id
      JOIN job_routings jr ON ss.job_routing_id = jr.id
      JOIN machines m2 ON jr.machine_id = m2.id
      WHERE ss.id = 985
    `);
    
    console.log('\nSlot 985 current vs correct machine:');
    console.log(JSON.stringify(slotResult.rows[0], null, 2));
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

checkRouting();