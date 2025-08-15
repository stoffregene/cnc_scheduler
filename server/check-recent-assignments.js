const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5732/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function checkRecentAssignments() {
  try {
    const result = await pool.query(`
      SELECT 
        oma.id,
        e.first_name || ' ' || e.last_name as employee_name,
        e.id as employee_db_id,
        m.name as machine_name,
        oma.proficiency_level,
        oma.preference_rank,
        oma.created_at,
        oma.updated_at
      FROM operator_machine_assignments oma
      JOIN employees e ON oma.employee_id = e.id
      JOIN machines m ON oma.machine_id = m.id
      WHERE m.id = 3
      ORDER BY oma.created_at DESC
    `);
    
    console.log('HMC-002 operator assignments (most recent first):');
    result.rows.forEach(op => {
      const suffix = op.preference_rank === 1 ? 'st' : op.preference_rank === 2 ? 'nd' : op.preference_rank === 3 ? 'rd' : 'th';
      console.log(`${op.employee_name} (DB ID: ${op.employee_db_id}): ${op.preference_rank}${suffix} choice - Created: ${op.created_at.toISOString()}`);
    });
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

checkRecentAssignments();