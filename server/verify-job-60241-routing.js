const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function verifyJob60241Routing() {
  try {
    console.log('=== VERIFYING JOB 60241 ROUTING FOR TESTING ===');
    
    const routingQuery = `
      SELECT jr.*, j.status as job_status,
             m.name as machine_name, mg.name as group_name
      FROM job_routings jr
      JOIN jobs j ON jr.job_id = j.id
      LEFT JOIN machines m ON jr.machine_id = m.id
      LEFT JOIN machine_groups mg ON jr.machine_group_id = mg.id
      WHERE j.job_number = '60241'
    `;
    
    const result = await pool.query(routingQuery);
    
    if (result.rows.length > 0) {
      const routing = result.rows[0];
      console.log('Current routing configuration:');
      console.log(`  Job Status: ${routing.job_status}`);
      console.log(`  Operation: ${routing.operation_name}`);
      console.log(`  Machine ID: ${routing.machine_id} (${routing.machine_name || 'NULL'})`);
      console.log(`  Group ID: ${routing.machine_group_id} (${routing.group_name || 'NULL'})`);
      console.log(`  Updated: ${routing.updated_at}`);
      
      // Check if properly configured for testing
      if (routing.machine_id === 16 && routing.machine_group_id === null) {
        console.log('\n✅ ROUTING CORRECTLY CONFIGURED');
        console.log('- Explicit machine: VMC-004 (ID 16)');
        console.log('- No machine group fallback');
        console.log('- Scheduler should ONLY use VMC-004');
        
        // Check existing schedule slots
        const slotsQuery = `
          SELECT ss.*, m.name as scheduled_machine
          FROM schedule_slots ss
          JOIN machines m ON ss.machine_id = m.id
          WHERE ss.job_id = (SELECT id FROM jobs WHERE job_number = '60241')
        `;
        
        const slotsResult = await pool.query(slotsQuery);
        
        if (slotsResult.rows.length === 0) {
          console.log('\n🎯 READY FOR TESTING');
          console.log('- No existing schedule slots');
          console.log('- Job status: pending');
          console.log('- Ready to test scheduler with explicit VMC-004 requirement');
        } else {
          console.log(`\n⚠️  Found ${slotsResult.rows.length} existing schedule slots:`);
          slotsResult.rows.forEach(slot => {
            console.log(`  - Slot ${slot.id}: ${slot.scheduled_machine} (${slot.start_datetime})`);
          });
        }
        
      } else {
        console.log('\n❌ ROUTING NOT PROPERLY CONFIGURED');
        console.log('Expected: machine_id=16, machine_group_id=null');
        console.log(`Actual: machine_id=${routing.machine_id}, machine_group_id=${routing.machine_group_id}`);
      }
      
    } else {
      console.log('❌ No routing found for job 60241');
    }
    
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
    process.exit();
  }
}

verifyJob60241Routing();