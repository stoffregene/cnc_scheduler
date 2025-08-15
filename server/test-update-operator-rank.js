const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5732/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function testUpdateOperatorRank() {
  try {
    console.log('Testing operator preference rank update...\n');
    
    // Find Drew's assignment to HMC-002
    const existing = await pool.query(`
      SELECT 
        oma.id,
        e.first_name || ' ' || e.last_name as employee_name,
        m.name as machine_name,
        oma.proficiency_level,
        oma.preference_rank,
        oma.notes
      FROM operator_machine_assignments oma
      JOIN employees e ON oma.employee_id = e.id
      JOIN machines m ON oma.machine_id = m.id
      WHERE e.id = 9 AND m.id = 3
    `);
    
    if (existing.rows.length === 0) {
      console.log('No existing assignment found for Drew (ID 9) on HMC-002 (ID 3)');
      return;
    }
    
    console.log('Current assignment:', existing.rows[0]);
    
    // Update preference rank to 3rd choice
    const updateResult = await pool.query(`
      UPDATE operator_machine_assignments 
      SET preference_rank = $1, notes = $2, updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
      RETURNING *
    `, [3, 'Updated to 3rd choice via test', existing.rows[0].id]);
    
    console.log('Update result:', updateResult.rows[0]);
    
    // Verify the update worked
    const verify = await pool.query(`
      SELECT 
        oma.id,
        e.first_name || ' ' || e.last_name as employee_name,
        m.name as machine_name,
        oma.proficiency_level,
        oma.preference_rank,
        oma.notes,
        oma.updated_at
      FROM operator_machine_assignments oma
      JOIN employees e ON oma.employee_id = e.id
      JOIN machines m ON oma.machine_id = m.id
      WHERE oma.id = $1
    `, [existing.rows[0].id]);
    
    console.log('Verification result:', verify.rows[0]);
    
    // Check all HMC-002 operators to see ranking
    console.log('\nAll HMC-002 operators after update:');
    const allOperators = await pool.query(`
      SELECT 
        e.first_name || ' ' || e.last_name as employee_name,
        oma.proficiency_level,
        oma.preference_rank,
        oma.notes
      FROM operator_machine_assignments oma
      JOIN employees e ON oma.employee_id = e.id
      WHERE oma.machine_id = 3
      ORDER BY oma.preference_rank, e.first_name
    `);
    
    allOperators.rows.forEach(op => {
      const suffix = op.preference_rank === 1 ? 'st' : op.preference_rank === 2 ? 'nd' : op.preference_rank === 3 ? 'rd' : 'th';
      console.log(`  ${op.employee_name}: ${op.preference_rank}${suffix} choice (${op.proficiency_level})`);
    });
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

testUpdateOperatorRank();