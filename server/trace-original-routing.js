const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function traceOriginalRouting() {
  try {
    console.log('=== TRACING ORIGINAL ROUTING FOR JOB 60241 ===');
    
    // 1. Check the original JobBoss data
    console.log('\n1. Original JobBoss data:');
    const jobQuery = `
      SELECT job_boss_data, created_at, updated_at
      FROM jobs 
      WHERE job_number = '60241'
    `;
    
    const jobResult = await pool.query(jobQuery);
    
    if (jobResult.rows.length > 0) {
      const job = jobResult.rows[0];
      console.log(`Job created: ${job.created_at}`);
      console.log(`Job updated: ${job.updated_at}`);
      console.log(`Original workcenter: ${job.job_boss_data.amt_workcenter_vendor}`);
      
      // 2. Check the current routing state
      console.log('\n2. Current routing state:');
      const routingQuery = `
        SELECT jr.*, jr.created_at, jr.updated_at,
               m.name as specific_machine_name,
               mg.name as group_name
        FROM job_routings jr
        LEFT JOIN machines m ON jr.machine_id = m.id
        LEFT JOIN machine_groups mg ON jr.machine_group_id = mg.id
        WHERE jr.job_id = (SELECT id FROM jobs WHERE job_number = '60241')
      `;
      
      const routingResult = await pool.query(routingQuery);
      
      if (routingResult.rows.length > 0) {
        const routing = routingResult.rows[0];
        console.log(`Routing created: ${routing.created_at}`);
        console.log(`Routing updated: ${routing.updated_at}`);
        console.log(`Operation: ${routing.operation_name}`);
        console.log(`Machine ID: ${routing.machine_id} (${routing.specific_machine_name || 'NULL'})`);
        console.log(`Group ID: ${routing.machine_group_id} (${routing.group_name || 'NULL'})`);
        
        // 3. Determine what went wrong
        console.log('\n3. Analysis:');
        
        const originalWorkcenter = job.job_boss_data.amt_workcenter_vendor;
        const hasSpecificMachine = routing.machine_id !== null;
        
        if (originalWorkcenter === 'VMC-004' && !hasSpecificMachine) {
          console.log('🚨 CORE VIOLATION FOUND:');
          console.log(`- JobBoss specified: ${originalWorkcenter}`);
          console.log(`- Current routing: Machine Group ${routing.machine_group_id} (${routing.group_name})`);
          console.log('- This violates the principle that explicit machines must be respected');
          
          // Check if VMC-004 exists in the system
          const vmcCheckQuery = `SELECT id, name, status FROM machines WHERE name = 'VMC-004'`;
          const vmcCheckResult = await pool.query(vmcCheckQuery);
          
          if (vmcCheckResult.rows.length > 0) {
            const vmc = vmcCheckResult.rows[0];
            console.log(`\n✅ VMC-004 exists: ID ${vmc.id}, Status: ${vmc.status}`);
            
            // Check when the routing was changed from specific to group
            const timeDiff = new Date(routing.updated_at) - new Date(routing.created_at);
            const minutesDiff = Math.round(timeDiff / (1000 * 60));
            
            console.log(`\n⏰ Routing was changed ${minutesDiff} minutes after creation`);
            
            if (minutesDiff > 5) {
              console.log('💡 This suggests the routing was originally correct but was modified later');
              console.log('🔍 Likely cause: Manual rescheduling changed explicit machine to group');
            } else {
              console.log('💡 This suggests the routing was incorrect from the start');
              console.log('🔍 Likely cause: Job import logic incorrectly converted machine to group');
            }
            
            // 4. Check what the correct routing should be
            console.log('\n4. What the routing SHOULD be:');
            console.log(`machine_id: ${vmc.id} (VMC-004)`);
            console.log(`machine_group_id: null`);
            console.log('operation_name: Can remain "VMC-004" (describes the operation)');
            
            // 5. Check if this would work with the scheduler
            console.log('\n5. Checking if scheduler would respect explicit machine:');
            
            // Look at the scheduling service logic for explicit machines
            console.log('The scheduling service has this logic:');
            console.log('- Lines 357-360: "If specific machine is required, only that machine can be used"');
            console.log('- This should enforce machine_id requirements strictly');
            
            // Check if there are qualified operators for VMC-004
            const operatorQuery = `
              SELECT COUNT(*) as operator_count
              FROM operator_machine_assignments oma
              WHERE oma.machine_id = $1
            `;
            
            const operatorResult = await pool.query(operatorQuery, [vmc.id]);
            const operatorCount = operatorResult.rows[0].operator_count;
            
            console.log(`\n👥 VMC-004 has ${operatorCount} qualified operators`);
            
            if (operatorCount === 0) {
              console.log('❌ PROBLEM: No qualified operators for VMC-004');
              console.log('This could cause scheduling to fail if enforced strictly');
            } else {
              console.log('✅ VMC-004 has qualified operators - scheduling should work');
            }
            
          } else {
            console.log('❌ VMC-004 does not exist in machines table');
            console.log('This would explain why scheduler had to use substitution');
          }
          
        } else if (originalWorkcenter === 'VMC-004' && hasSpecificMachine) {
          console.log('✅ Routing correctly specifies explicit machine');
          if (routing.machine_id !== vmcCheckResult.rows[0]?.id) {
            console.log('❌ But it specifies the WRONG machine');
          }
        } else {
          console.log('🤔 Complex scenario - needs deeper analysis');
        }
        
      } else {
        console.log('❌ No routing found for job 60241');
      }
      
    } else {
      console.log('❌ Job 60241 not found');
    }
    
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
    process.exit();
  }
}

traceOriginalRouting();