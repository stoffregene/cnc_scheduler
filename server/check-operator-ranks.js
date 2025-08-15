const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5732/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function checkOperatorRanks() {
  try {
    console.log('Checking current operator preference ranks in database...\n');
    
    const result = await pool.query(`
      SELECT 
        oma.id,
        e.first_name || ' ' || e.last_name as employee_name,
        m.name as machine_name,
        oma.proficiency_level,
        oma.preference_rank,
        oma.created_at
      FROM operator_machine_assignments oma
      JOIN employees e ON oma.employee_id = e.id
      JOIN machines m ON oma.machine_id = m.id
      ORDER BY m.name, oma.preference_rank, e.first_name
    `);
    
    console.log('Current operator assignments:');
    result.rows.forEach(row => {
      const suffix = row.preference_rank === 1 ? 'st' : row.preference_rank === 2 ? 'nd' : row.preference_rank === 3 ? 'rd' : 'th';
      console.log(`${row.machine_name}: ${row.employee_name} - ${row.preference_rank}${suffix} choice (${row.proficiency_level})`);
    });
    
    console.log('\nAll preference ranks:');
    const uniqueRanks = [...new Set(result.rows.map(row => row.preference_rank))];
    console.log('Unique preference ranks found:', uniqueRanks);
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

checkOperatorRanks();