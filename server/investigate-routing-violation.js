const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function investigateRoutingViolation() {
  try {
    console.log('=== INVESTIGATING ROUTING VIOLATION FOR JOB 60241 ===');
    
    // 1. Check the explicit routing requirements
    console.log('\n1. Job routing requirements:');
    const routingQuery = `
      SELECT jr.*, m.name as required_machine_name, mg.name as required_group_name
      FROM job_routings jr
      LEFT JOIN machines m ON jr.machine_id = m.id
      LEFT JOIN machine_groups mg ON jr.machine_group_id = mg.id
      WHERE jr.job_id = (SELECT id FROM jobs WHERE job_number = '60241')
    `;
    
    const routingResult = await pool.query(routingQuery);
    
    if (routingResult.rows.length > 0) {
      const routing = routingResult.rows[0];
      console.log(`Operation: ${routing.operation_name}`);
      console.log(`Required Machine ID: ${routing.machine_id} (${routing.required_machine_name || 'NULL'})`);
      console.log(`Required Group ID: ${routing.machine_group_id} (${routing.required_group_name || 'NULL'})`);
      
      // 2. Check where it was actually scheduled
      console.log('\n2. Where it was actually scheduled:');
      const actualQuery = `
        SELECT ss.*, m.name as actual_machine_name, mg_assignments.group_names
        FROM schedule_slots ss
        JOIN machines m ON ss.machine_id = m.id
        LEFT JOIN (
          SELECT mga.machine_id, array_agg(mg.name) as group_names
          FROM machine_group_assignments mga
          JOIN machine_groups mg ON mga.machine_group_id = mg.id
          GROUP BY mga.machine_id
        ) mg_assignments ON m.id = mg_assignments.machine_id
        WHERE ss.job_id = (SELECT id FROM jobs WHERE job_number = '60241')
      `;
      
      const actualResult = await pool.query(actualQuery);
      
      if (actualResult.rows.length > 0) {
        const actual = actualResult.rows[0];
        console.log(`Scheduled Machine: ${actual.actual_machine_name} (ID: ${actual.machine_id})`);
        console.log(`Machine Groups: ${actual.group_names || 'None'}`);
        
        // 3. Check if there's a conflict
        const requiredMachineId = routing.machine_id;
        const actualMachineId = actual.machine_id;
        
        if (requiredMachineId && requiredMachineId !== actualMachineId) {
          console.log('\n🚨 ROUTING VIOLATION DETECTED!');
          console.log(`Required: Machine ID ${requiredMachineId} (${routing.required_machine_name})`);
          console.log(`Actual: Machine ID ${actualMachineId} (${actual.actual_machine_name})`);
          
          // 4. Check if the required machine exists and is available
          console.log('\n3. Checking if required machine VMC-004 exists and is available:');
          const vmcQuery = `
            SELECT m.*, array_agg(mg.name) as machine_groups
            FROM machines m
            LEFT JOIN machine_group_assignments mga ON m.id = mga.machine_id
            LEFT JOIN machine_groups mg ON mga.machine_group_id = mg.id
            WHERE m.name = 'VMC-004'
            GROUP BY m.id
          `;
          
          const vmcResult = await pool.query(vmcQuery);
          
          if (vmcResult.rows.length > 0) {
            const vmc = vmcResult.rows[0];
            console.log(`✅ VMC-004 exists: ID ${vmc.id}, Status: ${vmc.status}`);
            console.log(`VMC-004 groups: ${vmc.machine_groups || 'None'}`);
            
            // Check if there are qualified operators for VMC-004
            const operatorQuery = `
              SELECT e.employee_id, e.first_name, e.last_name, oma.proficiency_level
              FROM operator_machine_assignments oma
              JOIN employees e ON oma.employee_id::text = e.employee_id
              WHERE oma.machine_id = $1
              ORDER BY oma.proficiency_level DESC
            `;
            
            const operatorResult = await pool.query(operatorQuery, [vmc.id]);
            console.log(`\nQualified operators for VMC-004: ${operatorResult.rows.length}`);
            operatorResult.rows.forEach(op => {
              console.log(`  - ${op.first_name} ${op.last_name} (${op.employee_id}): ${op.proficiency_level}`);
            });
            
            // Check if VMC-004 has any conflicting schedule slots
            const conflictQuery = `
              SELECT COUNT(*) as conflict_count
              FROM schedule_slots ss
              WHERE ss.machine_id = $1
              AND ss.start_datetime < $2
              AND ss.end_datetime > $3
            `;
            
            const scheduleStart = actual.start_datetime;
            const scheduleEnd = actual.end_datetime;
            
            const conflictResult = await pool.query(conflictQuery, [vmc.id, scheduleEnd, scheduleStart]);
            const conflictCount = conflictResult.rows[0].conflict_count;
            
            console.log(`\nSchedule conflicts for VMC-004 during ${scheduleStart} to ${scheduleEnd}: ${conflictCount}`);
            
            if (conflictCount === 0 && operatorResult.rows.length > 0) {
              console.log('🤔 VMC-004 was available with qualified operators - should have been used!');
            } else if (conflictCount > 0) {
              console.log('📅 VMC-004 had schedule conflicts');
            } else if (operatorResult.rows.length === 0) {
              console.log('👥 VMC-004 has no qualified operators');
            }
            
          } else {
            console.log('❌ VMC-004 does not exist in machines table');
          }
          
        } else if (routing.machine_group_id && !requiredMachineId) {
          console.log('\n📋 Job specifies machine group, not specific machine');
          console.log('This is normal - scheduler should pick best machine from group');
        } else {
          console.log('\n✅ Routing requirements satisfied');
        }
        
        // 5. Check the scheduling log for why this decision was made
        console.log('\n4. Recent scheduling decision factors:');
        console.log('From the server logs, the scheduler used machine group 30 logic:');
        console.log('- Found 31 operators in machine group 30');  
        console.log('- Top choice: HMC-002 + Drew Darling (Priority Score: 160.00)');
        console.log('- This suggests the routing was changed to use machine group instead of specific machine');
        
      } else {
        console.log('❌ No schedule slots found for job 60241');
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

investigateRoutingViolation();