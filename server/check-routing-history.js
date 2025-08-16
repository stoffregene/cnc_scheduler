const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function checkRoutingHistory() {
  try {
    console.log('=== CHECKING ROUTING HISTORY AND MACHINE HIERARCHY ===');
    
    // 1. Check VMC-004 machine details and groups
    console.log('\n1. VMC-004 machine details:');
    const vmcQuery = `
      SELECT m.id, m.name, m.status,
             array_agg(DISTINCT mg.name ORDER BY mg.name) as machine_groups,
             array_agg(DISTINCT mg.id ORDER BY mg.id) as group_ids
      FROM machines m
      LEFT JOIN machine_group_assignments mga ON m.id = mga.machine_id
      LEFT JOIN machine_groups mg ON mga.machine_group_id = mg.id
      WHERE m.name = 'VMC-004'
      GROUP BY m.id, m.name, m.status
    `;
    
    const vmcResult = await pool.query(vmcQuery);
    
    if (vmcResult.rows.length > 0) {
      const vmc = vmcResult.rows[0];
      console.log(`VMC-004: ID ${vmc.id}, Status: ${vmc.status}`);
      console.log(`Groups: ${vmc.machine_groups}`);
      console.log(`Group IDs: ${vmc.group_ids}`);
      
      // Check if VMC-004 is in the CNC Mills group (ID 30)
      const isCncMill = vmc.group_ids.includes(30);
      console.log(`Is VMC-004 in CNC Mills group (30)? ${isCncMill ? 'YES' : 'NO'}`);
      
      // 2. Check what machines are in the CNC Mills group
      console.log('\n2. All machines in CNC Mills group (ID 30):');
      const cncGroupQuery = `
        SELECT m.id, m.name, m.status,
               array_agg(DISTINCT mg.name ORDER BY mg.name) as all_groups
        FROM machine_group_assignments mga
        JOIN machines m ON mga.machine_id = m.id
        JOIN machine_groups mg_all ON m.id = mg_all.id  -- This join looks wrong, let me fix it
        WHERE mga.machine_group_id = 30
        GROUP BY m.id, m.name, m.status
        ORDER BY m.name
      `;
      
      // Fixed query
      const cncGroupQueryFixed = `
        SELECT DISTINCT m.id, m.name, m.status
        FROM machine_group_assignments mga
        JOIN machines m ON mga.machine_id = m.id
        WHERE mga.machine_group_id = 30
        ORDER BY m.name
      `;
      
      const cncGroupResult = await pool.query(cncGroupQueryFixed);
      console.log('Machines in CNC Mills group:');
      cncGroupResult.rows.forEach(machine => {
        console.log(`  - ${machine.name} (ID: ${machine.id}, Status: ${machine.status})`);
      });
      
      // 3. Check the original vs current routing
      console.log('\n3. Current routing configuration:');
      const currentRoutingQuery = `
        SELECT jr.*, 
               m_specific.name as specific_machine_name,
               mg.name as group_name,
               jr.updated_at
        FROM job_routings jr
        LEFT JOIN machines m_specific ON jr.machine_id = m_specific.id
        LEFT JOIN machine_groups mg ON jr.machine_group_id = mg.id
        WHERE jr.job_id = (SELECT id FROM jobs WHERE job_number = '60241')
      `;
      
      const currentRoutingResult = await pool.query(currentRoutingQuery);
      
      if (currentRoutingResult.rows.length > 0) {
        const routing = currentRoutingResult.rows[0];
        console.log(`Operation: ${routing.operation_name}`);
        console.log(`Specific Machine: ${routing.specific_machine_name || 'NULL'} (ID: ${routing.machine_id})`);
        console.log(`Machine Group: ${routing.group_name || 'NULL'} (ID: ${routing.machine_group_id})`);
        console.log(`Last Updated: ${routing.updated_at}`);
        
        // 4. Look for clues about when/why this changed
        console.log('\n4. Investigating routing changes:');
        
        if (!routing.machine_id && routing.machine_group_id === 30) {
          console.log('🔍 The routing is currently set to use machine group 30 (CNC Mills)');
          console.log('🤔 This could have happened during:');
          console.log('   a) Initial job import/creation');
          console.log('   b) Manual rescheduling that changed machine requirements');
          console.log('   c) System logic that converts specific machines to groups');
          
          // Check if this matches the original JobBoss data
          const jobQuery = `SELECT job_boss_data FROM jobs WHERE job_number = '60241'`;
          const jobResult = await pool.query(jobQuery);
          
          if (jobResult.rows.length > 0) {
            const jobBossData = jobResult.rows[0].job_boss_data;
            console.log('\n5. Original JobBoss data:');
            console.log(`amt_workcenter_vendor: ${jobBossData.amt_workcenter_vendor}`);
            
            if (jobBossData.amt_workcenter_vendor === 'VMC-004') {
              console.log('🚨 MISMATCH FOUND!');
              console.log('Original JobBoss data specified VMC-004');
              console.log('But current routing uses machine group 30 instead of specific machine');
              console.log('');
              console.log('EXPECTED BEHAVIOR:');
              console.log('1. Job should try VMC-004 first (specific machine requirement)');
              console.log('2. Only if VMC-004 unavailable, consider other VMCs in same group');
              console.log('3. HMC-002 should be last resort since it\'s a different machine type');
            }
          }
        }
        
        // 5. Check machine priority within CNC Mills group
        console.log('\n6. Machine type analysis:');
        const machineTypesQuery = `
          SELECT m.name, 
                 CASE 
                   WHEN m.name LIKE '%VMC%' THEN 'VMC'
                   WHEN m.name LIKE '%HMC%' THEN 'HMC'
                   WHEN m.name LIKE '%MILL%' THEN 'MILL'
                   ELSE 'OTHER'
                 END as machine_type,
                 array_agg(DISTINCT mg.name ORDER BY mg.name) as groups
          FROM machine_group_assignments mga
          JOIN machines m ON mga.machine_id = m.id
          LEFT JOIN machine_groups mg ON mga.machine_group_id = mg.id
          WHERE mga.machine_group_id = 30
          GROUP BY m.id, m.name
          ORDER BY machine_type, m.name
        `;
        
        const machineTypesResult = await pool.query(machineTypesQuery);
        console.log('Machine types in CNC Mills group:');
        machineTypesResult.rows.forEach(machine => {
          console.log(`  ${machine.machine_type}: ${machine.name}`);
        });
        
        console.log('\n🎯 CONCLUSION:');
        console.log('For a VMC-004 operation, the scheduler should prioritize:');
        console.log('1. VMC-004 (exact match)');
        console.log('2. Other VMCs (same type)');  
        console.log('3. Other CNC Mills (fallback)');
        console.log('');
        console.log('But it chose HMC-002 over VMC-004, which suggests:');
        console.log('- Either VMC-004 isn\'t available/qualified');
        console.log('- Or the scheduling algorithm doesn\'t prioritize machine type matching');
      }
      
    } else {
      console.log('❌ VMC-004 not found in machines table');
    }
    
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
    process.exit();
  }
}

checkRoutingHistory();