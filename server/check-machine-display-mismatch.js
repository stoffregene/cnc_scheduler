const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function checkMachineDisplayMismatch() {
  try {
    console.log('=== INVESTIGATING MACHINE DISPLAY MISMATCH ===');
    
    // 1. Check what the database actually shows
    console.log('\n1. Database reality for job 60241:');
    const actualQuery = `
      SELECT ss.id, ss.machine_id, ss.job_routing_id,
             m.name as actual_machine_name,
             j.job_number,
             jr.operation_name, jr.machine_id as routing_machine_id
      FROM schedule_slots ss
      JOIN jobs j ON ss.job_id = j.id
      JOIN machines m ON ss.machine_id = m.id
      LEFT JOIN job_routings jr ON ss.job_routing_id = jr.id
      WHERE j.job_number = '60241'
    `;
    
    const actualResult = await pool.query(actualQuery);
    
    if (actualResult.rows.length > 0) {
      const slot = actualResult.rows[0];
      console.log(`  Schedule slot machine: ${slot.actual_machine_name} (ID: ${slot.machine_id})`);
      console.log(`  Job routing machine ID: ${slot.routing_machine_id}`);
      console.log(`  Operation: ${slot.operation_name}`);
      
      // 2. Check if there's a mismatch between schedule slot machine and routing machine
      if (slot.machine_id !== slot.routing_machine_id) {
        console.log(`  ⚠️  MISMATCH: Schedule slot uses machine ${slot.machine_id}, but routing specifies machine ${slot.routing_machine_id}`);
        
        // Get the routing machine name
        const routingMachineQuery = `SELECT name FROM machines WHERE id = $1`;
        const routingMachineResult = await pool.query(routingMachineQuery, [slot.routing_machine_id]);
        
        if (routingMachineResult.rows.length > 0) {
          console.log(`  Routing machine: ${routingMachineResult.rows[0].name} (ID: ${slot.routing_machine_id})`);
          
          // Check if this is VMC-004
          if (routingMachineResult.rows[0].name === 'VMC-004') {
            console.log(`  🎯 FOUND IT: Frontend is showing routing machine (VMC-004) instead of scheduled machine (${slot.actual_machine_name})`);
          }
        }
      }
      
      // 3. Check job routing details
      console.log('\n2. Job routing details:');
      const routingQuery = `
        SELECT jr.*, m.name as machine_name
        FROM job_routings jr
        LEFT JOIN machines m ON jr.machine_id = m.id
        WHERE jr.job_id = (SELECT id FROM jobs WHERE job_number = '60241')
      `;
      
      const routingResult = await pool.query(routingQuery);
      routingResult.rows.forEach(routing => {
        console.log(`  Routing ${routing.id}: ${routing.operation_name}`);
        console.log(`    Machine ID: ${routing.machine_id} (${routing.machine_name || 'NULL'})`);
        console.log(`    Sequence: ${routing.sequence_order}`);
      });
      
      // 4. Check the API endpoint that the frontend might be using
      console.log('\n3. Checking what data the frontend API returns...');
      
      // Simulate the API call that might be used for job details
      const apiQuery = `
        SELECT j.job_number, j.part_name,
               jr.operation_name, 
               COALESCE(m_scheduled.name, m_routing.name) as display_machine_name,
               m_routing.name as routing_machine_name,
               m_scheduled.name as scheduled_machine_name,
               ss.start_datetime, ss.end_datetime
        FROM jobs j
        LEFT JOIN job_routings jr ON j.id = jr.job_id
        LEFT JOIN machines m_routing ON jr.machine_id = m_routing.id
        LEFT JOIN schedule_slots ss ON j.id = ss.job_id AND jr.id = ss.job_routing_id
        LEFT JOIN machines m_scheduled ON ss.machine_id = m_scheduled.id
        WHERE j.job_number = '60241'
        ORDER BY jr.sequence_order
      `;
      
      const apiResult = await pool.query(apiQuery);
      console.log('API-style data that frontend might receive:');
      apiResult.rows.forEach((row, index) => {
        console.log(`  ${index + 1}. ${row.operation_name}`);
        console.log(`     Routing machine: ${row.routing_machine_name}`);
        console.log(`     Scheduled machine: ${row.scheduled_machine_name || 'Not scheduled'}`);
        console.log(`     Display machine: ${row.display_machine_name}`);
        if (row.start_datetime) {
          console.log(`     Scheduled: ${row.start_datetime} to ${row.end_datetime}`);
        }
      });
      
      // 5. Check if frontend is using job routing data instead of schedule slot data
      if (apiResult.rows.length > 0) {
        const apiRow = apiResult.rows[0];
        if (apiRow.routing_machine_name === 'VMC-004' && apiRow.scheduled_machine_name === 'HMC-002') {
          console.log('\n🔍 ROOT CAUSE IDENTIFIED:');
          console.log('The frontend is likely displaying the job routing machine name (VMC-004)');
          console.log('instead of the actual scheduled machine name (HMC-002).');
          console.log('\nThis happens when:');
          console.log('- Job routing specifies one machine (VMC-004)');
          console.log('- But scheduler assigned it to a different compatible machine (HMC-002)');
          console.log('- Frontend displays routing data instead of schedule slot data');
        }
      }
      
    } else {
      console.log('❌ No schedule slots found for job 60241');
    }
    
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
    process.exit();
  }
}

checkMachineDisplayMismatch();