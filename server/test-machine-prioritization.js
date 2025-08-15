const { Pool } = require('pg');
require('dotenv').config();

async function testMachinePrioritization() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL
  });

  try {
    console.log('🔧 Testing Machine Prioritization Algorithm\n');

    // Get sample machines with their efficiency modifiers
    const machinesQuery = `
      SELECT 
        m.id,
        m.name,
        m.efficiency_modifier,
        mg.name as group_name,
        COUNT(oma.id) as operator_count
      FROM machines m
      LEFT JOIN machine_group_assignments mga ON m.id = mga.machine_id
      LEFT JOIN machine_groups mg ON mga.machine_group_id = mg.id
      LEFT JOIN operator_machine_assignments oma ON m.id = oma.machine_id
      WHERE m.status = 'active'
      GROUP BY m.id, m.name, m.efficiency_modifier, mg.name
      ORDER BY m.name
      LIMIT 10
    `;
    
    const machines = await pool.query(machinesQuery);
    
    console.log('📊 Machine Efficiency Report:');
    console.log('='.repeat(80));
    machines.rows.forEach(machine => {
      const efficiencyPct = ((machine.efficiency_modifier - 1) * 100);
      const efficiencyIndicator = machine.efficiency_modifier > 1 ? '⚡' : machine.efficiency_modifier < 1 ? '⚠️ ' : '⚪';
      
      console.log(`${efficiencyIndicator} ${machine.name.padEnd(20)} | Efficiency: ${machine.efficiency_modifier}x (${efficiencyPct > 0 ? '+' : ''}${efficiencyPct.toFixed(0)}%) | Group: ${machine.group_name || 'None'} | Operators: ${machine.operator_count}`);
    });
    
    // Test priority scoring for a sample group
    console.log('\n🎯 Priority Scoring Algorithm Test:');
    console.log('='.repeat(80));
    
    const priorityTestQuery = `
      SELECT 
        m.id as machine_id,
        m.name as machine_name,
        m.efficiency_modifier,
        e.first_name || ' ' || e.last_name as employee_name,
        oma.proficiency_level,
        oma.preference_rank,
        COUNT(ss.id) as current_workload,
        -- Priority score: lower is better (higher priority)
        (oma.preference_rank * 100) + 
        (CASE oma.proficiency_level 
          WHEN 'certified' THEN 0 
          WHEN 'expert' THEN 10 
          WHEN 'trained' THEN 20 
          ELSE 30 
        END) + 
        (COUNT(ss.id) * 5) +  -- Workload penalty
        ((2.0 - COALESCE(m.efficiency_modifier, 1.0)) * 50) as priority_score
      FROM machines m
      JOIN machine_group_assignments mga ON m.id = mga.machine_id
      JOIN operator_machine_assignments oma ON m.id = oma.machine_id
      JOIN employees e ON oma.employee_id = e.id
      LEFT JOIN schedule_slots ss ON (m.id = ss.machine_id OR e.id = ss.employee_id) 
        AND ss.slot_date = CURRENT_DATE
        AND ss.status IN ('scheduled', 'in_progress')
      WHERE mga.machine_group_id = (
        SELECT id FROM machine_groups 
        WHERE name ILIKE '%HMC%' OR name ILIKE '%mill%' 
        LIMIT 1
      )
        AND m.status = 'active'
        AND e.status = 'active'
      GROUP BY m.id, m.name, m.efficiency_modifier, e.id, e.first_name, e.last_name, oma.proficiency_level, oma.preference_rank
      ORDER BY priority_score ASC
      LIMIT 10
    `;
    
    const priorityTest = await pool.query(priorityTestQuery);
    
    if (priorityTest.rows.length === 0) {
      console.log('No machine-operator combinations found for testing. Try creating some operator assignments first.');
    } else {
      console.log('Machine-Operator combinations ranked by priority (best first):');
      console.log('-'.repeat(80));
      
      priorityTest.rows.forEach((combo, index) => {
        const rank = index + 1;
        const efficiency = combo.efficiency_modifier || 1.00;
        const efficiencyBonus = efficiency > 1 ? `🚀 +${((efficiency - 1) * 100).toFixed(0)}%` : efficiency < 1 ? `🐌 ${((efficiency - 1) * 100).toFixed(0)}%` : '';
        
        console.log(`${rank.toString().padStart(2)}. ${combo.machine_name} + ${combo.employee_name}`);
        console.log(`    Preference: ${combo.preference_rank} | Proficiency: ${combo.proficiency_level} | Workload: ${combo.current_workload}`);
        console.log(`    Efficiency: ${efficiency}x ${efficiencyBonus} | Priority Score: ${parseFloat(combo.priority_score).toFixed(1)}`);
        console.log('');
      });
    }
    
    // Show algorithm explanation
    console.log('\n📚 Priority Scoring Algorithm:');
    console.log('='.repeat(80));
    console.log('Lower score = higher priority (better choice)');
    console.log('');
    console.log('Scoring factors:');
    console.log('• Operator Preference Rank: rank × 100 (1st choice = 100, 2nd = 200, etc.)');
    console.log('• Proficiency Level: Certified = 0, Expert = 10, Trained = 20, Other = 30');
    console.log('• Current Workload: scheduled_operations × 5');
    console.log('• Machine Efficiency: (2.0 - efficiency_modifier) × 50');
    console.log('  - 1.20x efficiency = -10 points (bonus)');
    console.log('  - 1.00x efficiency = 50 points (neutral)'); 
    console.log('  - 0.80x efficiency = +60 points (penalty)');
    
  } catch (error) {
    console.error('❌ Error testing machine prioritization:', error.message);
  } finally {
    await pool.end();
  }
}

testMachinePrioritization();