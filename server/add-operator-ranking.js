const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function addOperatorRanking() {
  try {
    console.log('Adding preference_rank column to operator_machine_assignments...\n');
    
    // Add the preference_rank column
    await pool.query(`
      ALTER TABLE operator_machine_assignments 
      ADD COLUMN IF NOT EXISTS preference_rank INTEGER DEFAULT 1
    `);
    
    console.log('✅ Added preference_rank column');
    
    // Update existing assignments with logical rankings
    // For machines with multiple operators, rank them by proficiency and training date
    const updateRankings = `
      WITH ranked_operators AS (
        SELECT 
          id,
          machine_id,
          employee_id,
          ROW_NUMBER() OVER (
            PARTITION BY machine_id 
            ORDER BY 
              CASE proficiency_level 
                WHEN 'expert' THEN 1
                WHEN 'advanced' THEN 2
                WHEN 'trained' THEN 3
                WHEN 'beginner' THEN 4
                ELSE 5
              END,
              training_date ASC NULLS LAST,
              created_at ASC
          ) as new_rank
        FROM operator_machine_assignments
      )
      UPDATE operator_machine_assignments oma
      SET preference_rank = ro.new_rank
      FROM ranked_operators ro
      WHERE oma.id = ro.id
    `;
    
    await pool.query(updateRankings);
    console.log('✅ Updated preference rankings for existing assignments');
    
    // Show the updated rankings
    const result = await pool.query(`
      SELECT 
        m.name as machine_name,
        e.first_name || ' ' || e.last_name as operator_name,
        oma.proficiency_level,
        oma.preference_rank,
        oma.training_date,
        oma.notes
      FROM operator_machine_assignments oma
      JOIN machines m ON oma.machine_id = m.id
      JOIN employees e ON oma.employee_id = e.id
      WHERE m.status = 'active' AND e.status = 'active'
      ORDER BY m.name, oma.preference_rank ASC
    `);
    
    console.log('\nUpdated operator rankings:');
    const machineOperators = {};
    result.rows.forEach(row => {
      if (!machineOperators[row.machine_name]) {
        machineOperators[row.machine_name] = [];
      }
      machineOperators[row.machine_name].push(row);
    });
    
    Object.keys(machineOperators).forEach(machineName => {
      console.log(`\n🔧 ${machineName}:`);
      machineOperators[machineName].forEach((op) => {
        const rank_suffix = op.preference_rank === 1 ? 'st' : op.preference_rank === 2 ? 'nd' : op.preference_rank === 3 ? 'rd' : 'th';
        console.log(`  ${op.preference_rank}${rank_suffix} choice: ${op.operator_name} (${op.proficiency_level}) ${op.notes ? '- ' + op.notes : ''}`);
      });
    });
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

addOperatorRanking();