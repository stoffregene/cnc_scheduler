const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function restoreVMC004Routing() {
  try {
    console.log('=== RESTORING VMC-004 EXPLICIT ROUTING ===');
    
    // 1. Get the VMC-004 machine ID
    const vmcQuery = `SELECT id, name FROM machines WHERE name = 'VMC-004'`;
    const vmcResult = await pool.query(vmcQuery);
    
    if (vmcResult.rows.length === 0) {
      console.log('❌ VMC-004 not found');
      return;
    }
    
    const vmcMachine = vmcResult.rows[0];
    console.log(`Found VMC-004: ID ${vmcMachine.id}`);
    
    // 2. Get the current routing state
    const currentQuery = `
      SELECT jr.id, jr.machine_id, jr.machine_group_id, jr.operation_name
      FROM job_routings jr
      JOIN jobs j ON jr.job_id = j.id
      WHERE j.job_number = '60241'
    `;
    
    const currentResult = await pool.query(currentQuery);
    
    if (currentResult.rows.length === 0) {
      console.log('❌ No routing found for job 60241');
      return;
    }
    
    const currentRouting = currentResult.rows[0];
    console.log(`\nCurrent routing ID ${currentRouting.id}:`);
    console.log(`  machine_id: ${currentRouting.machine_id}`);
    console.log(`  machine_group_id: ${currentRouting.machine_group_id}`);
    console.log(`  operation_name: ${currentRouting.operation_name}`);
    
    // 3. Check if already correct
    if (currentRouting.machine_id === vmcMachine.id && currentRouting.machine_group_id === null) {
      console.log('✅ Routing is already correct');
      return;
    }
    
    // 4. Fix the routing
    console.log('\n🔧 Fixing routing to use explicit VMC-004 machine...');
    
    const updateQuery = `
      UPDATE job_routings 
      SET machine_id = $1,
          machine_group_id = null,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *
    `;
    
    const updateResult = await pool.query(updateQuery, [vmcMachine.id, currentRouting.id]);
    
    if (updateResult.rows.length > 0) {
      const updatedRouting = updateResult.rows[0];
      console.log('✅ Routing updated successfully:');
      console.log(`  machine_id: ${updatedRouting.machine_id} (VMC-004)`);
      console.log(`  machine_group_id: ${updatedRouting.machine_group_id}`);
      console.log(`  updated_at: ${updatedRouting.updated_at}`);
      
      // 5. Clear any existing schedule slots (they're using wrong machine)
      console.log('\n🗑️ Clearing existing schedule slots (they use wrong machine)...');
      
      const clearSlotsQuery = `
        DELETE FROM schedule_slots 
        WHERE job_id = (SELECT id FROM jobs WHERE job_number = '60241')
        RETURNING id
      `;
      
      const clearResult = await pool.query(clearSlotsQuery);
      console.log(`Cleared ${clearResult.rows.length} schedule slots`);
      
      // 6. Update job status back to pending
      const updateJobQuery = `
        UPDATE jobs 
        SET status = 'pending', auto_scheduled = false, updated_at = CURRENT_TIMESTAMP
        WHERE job_number = '60241'
        RETURNING status
      `;
      
      const jobUpdateResult = await pool.query(updateJobQuery);
      console.log(`Job status updated to: ${jobUpdateResult.rows[0].status}`);
      
      console.log('\n🎯 SUMMARY:');
      console.log('✅ Restored explicit VMC-004 machine requirement');
      console.log('✅ Cleared incorrect HMC-002 schedule slots');  
      console.log('✅ Job is now ready for proper rescheduling');
      console.log('');
      console.log('Next steps:');
      console.log('1. Reschedule the job - it should now ONLY use VMC-004');
      console.log('2. Fix the manual rescheduling logic to preserve explicit machines');
      
    } else {
      console.log('❌ Failed to update routing');
    }
    
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
    process.exit();
  }
}

restoreVMC004Routing();