const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5732/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function testOperatorsAPI() {
  try {
    console.log('Testing /operators/:machineId API response...\n');
    
    // Test the same query that the API uses for HMC-002 (machine_id = 3)
    const result = await pool.query(`
      SELECT oma.*, 
             e.first_name, e.last_name, e.employee_id, e.department, e.position,
             m.name as machine_name, m.model as machine_model
      FROM operator_machine_assignments oma
      JOIN employees e ON oma.employee_id = e.id
      JOIN machines m ON oma.machine_id = m.id
      WHERE oma.machine_id = $1
      ORDER BY oma.preference_rank ASC, e.first_name, e.last_name
    `, [3]);
    
    console.log('API Response simulation for HMC-002:');
    console.log(JSON.stringify(result.rows, null, 2));
    
    console.log('\nFormatted operator list:');
    result.rows.forEach(op => {
      const suffix = op.preference_rank === 1 ? 'st' : op.preference_rank === 2 ? 'nd' : op.preference_rank === 3 ? 'rd' : 'th';
      console.log(`${op.first_name} ${op.last_name}: ${op.preference_rank}${suffix} choice (${op.proficiency_level})`);
    });
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

testOperatorsAPI();