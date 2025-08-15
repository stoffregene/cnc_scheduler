const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function testOperatorRanking() {
  try {
    console.log('Testing operator ranking system...\n');
    
    // Test the improved scheduling service query
    const dateString = '2025-08-13';
    
    const query = `
      SELECT 
        m.id as machine_id,
        m.name as machine_name,
        e.id as employee_id,
        e.first_name || ' ' || e.last_name as employee_name,
        oma.proficiency_level,
        oma.preference_rank,
        COUNT(ss.id) as current_workload
      FROM machines m
      LEFT JOIN machine_group_assignments mga ON m.id = mga.machine_id
      JOIN operator_machine_assignments oma ON m.id = oma.machine_id
      JOIN employees e ON oma.employee_id = e.id
      LEFT JOIN schedule_slots ss ON (m.id = ss.machine_id OR e.id = ss.employee_id) 
        AND ss.slot_date = $1::date
        AND ss.status IN ('scheduled', 'in_progress')
      WHERE m.status = 'active'
        AND e.status = 'active'
      GROUP BY m.id, m.name, e.id, e.first_name, e.last_name, oma.proficiency_level, oma.preference_rank
      ORDER BY 
        oma.preference_rank ASC,    -- 1st choice, 2nd choice, 3rd choice, etc.
        oma.proficiency_level DESC, -- Within same rank, prefer higher proficiency
        current_workload ASC,       -- Within same proficiency, prefer less busy
        m.id ASC                    -- Stable sort
    `;
    
    const result = await pool.query(query, [dateString]);
    
    // Group by machine to show selection order
    const machineOperators = {};
    result.rows.forEach(row => {
      if (!machineOperators[row.machine_name]) {
        machineOperators[row.machine_name] = [];
      }
      machineOperators[row.machine_name].push(row);
    });
    
    console.log('📊 Operator Selection Order (as used by scheduling service):\n');
    
    Object.keys(machineOperators).forEach(machineName => {
      console.log(`🔧 ${machineName}:`);
      machineOperators[machineName].forEach((op, index) => {
        const rank_suffix = op.preference_rank === 1 ? 'st' : op.preference_rank === 2 ? 'nd' : op.preference_rank === 3 ? 'rd' : 'th';
        console.log(`  ${index + 1}. ${op.employee_name} (${op.preference_rank}${rank_suffix} choice, ${op.proficiency_level}, workload: ${op.current_workload})`);
      });
      console.log('');
    });
    
    console.log('✅ Selection Priority Logic:');
    console.log('   1. Preference rank (1st choice beats 2nd choice)');
    console.log('   2. Proficiency level (expert beats trained)');
    console.log('   3. Current workload (less busy preferred)');
    console.log('   4. Machine ID (stable sort)');
    
    // Test: Simulate choosing operator for HMC-002
    const hmcOperators = machineOperators['HMC-002'];
    if (hmcOperators && hmcOperators.length > 0) {
      console.log(`\\n🎯 For HMC-002 operations, the scheduler will choose: ${hmcOperators[0].employee_name}`);
      console.log(`   Reason: ${hmcOperators[0].preference_rank}${hmcOperators[0].preference_rank === 1 ? 'st' : hmcOperators[0].preference_rank === 2 ? 'nd' : 'rd'} choice operator`);
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

testOperatorRanking();