const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5732/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function setupTestRanks() {
  try {
    // Set different preference ranks for HMC-002 operators
    await pool.query(`UPDATE operator_machine_assignments SET preference_rank = 1 
                     WHERE employee_id IN (SELECT id FROM employees WHERE first_name = 'Aaron') 
                     AND machine_id = 3`);
    
    await pool.query(`UPDATE operator_machine_assignments SET preference_rank = 2 
                     WHERE employee_id IN (SELECT id FROM employees WHERE first_name = 'Chris') 
                     AND machine_id = 3`);
    
    await pool.query(`UPDATE operator_machine_assignments SET preference_rank = 3 
                     WHERE employee_id IN (SELECT id FROM employees WHERE first_name = 'Drew') 
                     AND machine_id = 3`);
    
    console.log('Set test preference ranks: Aaron=1st, Chris=2nd, Drew=3rd');
    
    // Verify the changes
    const result = await pool.query(`
      SELECT 
        e.first_name || ' ' || e.last_name as name,
        oma.preference_rank
      FROM operator_machine_assignments oma
      JOIN employees e ON oma.employee_id = e.id
      WHERE oma.machine_id = 3
      ORDER BY oma.preference_rank
    `);
    
    console.log('Current HMC-002 operator rankings:');
    result.rows.forEach(op => {
      const suffix = op.preference_rank === 1 ? 'st' : op.preference_rank === 2 ? 'nd' : op.preference_rank === 3 ? 'rd' : 'th';
      console.log(`  ${op.name}: ${op.preference_rank}${suffix} choice`);
    });
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

setupTestRanks();