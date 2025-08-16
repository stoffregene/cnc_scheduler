const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function checkVMC004Operators() {
  try {
    console.log('=== CHECKING VMC-004 QUALIFIED OPERATORS ===');
    
    // Get VMC-004 machine ID
    const vmcQuery = `SELECT id, name, status FROM machines WHERE name = 'VMC-004'`;
    const vmcResult = await pool.query(vmcQuery);
    
    if (vmcResult.rows.length === 0) {
      console.log('❌ VMC-004 not found');
      return;
    }
    
    const vmc = vmcResult.rows[0];
    console.log(`VMC-004: ID ${vmc.id}, Status: ${vmc.status}`);
    
    // Check qualified operators
    const operatorQuery = `
      SELECT 
        oma.employee_id,
        e.first_name,
        e.last_name,
        e.status as employee_status,
        oma.proficiency_level,
        oma.preference_rank,
        oma.training_date
      FROM operator_machine_assignments oma
      JOIN employees e ON oma.employee_id::text = e.employee_id
      WHERE oma.machine_id = $1
      ORDER BY oma.preference_rank, oma.proficiency_level DESC
    `;
    
    const operatorResult = await pool.query(operatorQuery, [vmc.id]);
    
    console.log(`\nQualified operators for VMC-004: ${operatorResult.rows.length}`);
    
    if (operatorResult.rows.length === 0) {
      console.log('❌ NO QUALIFIED OPERATORS FOUND!');
      console.log('This is a configuration issue - every machine should have qualified operators');
      
      // Check if there are any operator assignments at all
      const allAssignmentsQuery = `
        SELECT COUNT(*) as total_assignments
        FROM operator_machine_assignments
        WHERE machine_id = $1
      `;
      
      const totalResult = await pool.query(allAssignmentsQuery, [vmc.id]);
      console.log(`Total operator assignments for VMC-004: ${totalResult.rows[0].total_assignments}`);
      
    } else {
      console.log('Qualified operators:');
      operatorResult.rows.forEach((op, index) => {
        console.log(`  ${index + 1}. ${op.first_name} ${op.last_name} (${op.employee_id})`);
        console.log(`     Status: ${op.employee_status}, Proficiency: ${op.proficiency_level}, Preference: ${op.preference_rank}`);
        if (op.training_date) {
          console.log(`     Trained: ${op.training_date}`);
        }
      });
      
      // Check if any of these operators are available today
      console.log('\nChecking operator availability for today...');
      const today = new Date().toISOString().split('T')[0];
      
      for (const op of operatorResult.rows) {
        try {
          const availabilityQuery = `
            SELECT get_employee_working_hours($1::text, $2::date) as hours
          `;
          
          const availResult = await pool.query(availabilityQuery, [op.employee_id, today]);
          const hours = availResult.rows[0].hours;
          
          console.log(`  ${op.first_name} ${op.last_name}: ${hours ? `${hours.start_hour}:00-${hours.end_hour}:00 (${hours.duration_hours}h)` : 'Not working today'}`);
          
        } catch (err) {
          console.log(`  ${op.first_name} ${op.last_name}: Error checking schedule - ${err.message}`);
        }
      }
    }
    
    // Test the exact query used by the scheduler
    console.log('\n=== TESTING SCHEDULER QUERY ===');
    const dateString = new Date().toISOString().split('T')[0];
    
    const schedulerQuery = `
      SELECT 
        m.id as machine_id,
        m.name as machine_name,
        m.efficiency_modifier,
        e.id as employee_id,
        e.first_name || ' ' || e.last_name as employee_name,
        oma.proficiency_level,
        oma.preference_rank,
        COUNT(ss.id) as current_workload,
        'original' as selection_reason
      FROM machines m
      JOIN operator_machine_assignments oma ON m.id = oma.machine_id
      JOIN employees e ON oma.employee_id = e.id
      LEFT JOIN schedule_slots ss ON (m.id = ss.machine_id OR e.id = ss.employee_id) 
        AND ss.slot_date = $1::date
        AND ss.status IN ('scheduled', 'in_progress')
      WHERE m.id = $2
        AND m.status = 'active'
        AND e.status = 'active'
      GROUP BY m.id, m.name, m.efficiency_modifier, e.id, e.first_name, e.last_name, oma.proficiency_level, oma.preference_rank
      ORDER BY 
        oma.preference_rank ASC,    -- 1st choice operator first
        oma.proficiency_level DESC, -- Then highest proficiency
        current_workload ASC        -- Then least busy
    `;
    
    const schedulerResult = await pool.query(schedulerQuery, [dateString, vmc.id]);
    
    console.log(`Scheduler query returned ${schedulerResult.rows.length} candidates:`);
    schedulerResult.rows.forEach((candidate, index) => {
      console.log(`  ${index + 1}. ${candidate.employee_name} on ${candidate.machine_name}`);
      console.log(`     Preference: ${candidate.preference_rank}, Proficiency: ${candidate.proficiency_level}`);
      console.log(`     Current workload: ${candidate.current_workload}, Efficiency: ${candidate.efficiency_modifier}`);
    });
    
    if (schedulerResult.rows.length === 0) {
      console.log('\n🔍 Investigating why scheduler query returned no results...');
      
      // Check each part of the WHERE clause
      console.log('Checking WHERE clause components:');
      
      // Check machine status
      const machineStatusQuery = `SELECT id, name, status FROM machines WHERE id = $1`;
      const machineStatusResult = await pool.query(machineStatusQuery, [vmc.id]);
      console.log(`  Machine status: ${machineStatusResult.rows[0]?.status || 'NOT FOUND'}`);
      
      // Check employee statuses
      const empStatusQuery = `
        SELECT e.employee_id, e.first_name, e.last_name, e.status
        FROM operator_machine_assignments oma
        JOIN employees e ON oma.employee_id::text = e.employee_id
        WHERE oma.machine_id = $1
      `;
      
      const empStatusResult = await pool.query(empStatusQuery, [vmc.id]);
      console.log('  Employee statuses:');
      empStatusResult.rows.forEach(emp => {
        console.log(`    ${emp.first_name} ${emp.last_name}: ${emp.status}`);
      });
    }
    
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
    process.exit();
  }
}

checkVMC004Operators();