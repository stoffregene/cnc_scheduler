const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5732/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function testOperatorAssignment() {
  try {
    console.log('Testing operator assignment API simulation...\n');
    
    // Simulate what the frontend would send
    const testData = {
      employee_id: 9, // Drew Darling
      machine_id: 3,  // HMC-002
      proficiency_level: 'expert',
      preference_rank: 3, // 3rd choice
      training_date: null,
      notes: 'Test assignment with 3rd choice rank'
    };
    
    console.log('Simulating API call with data:', testData);
    
    // Insert directly into database like the API would
    const result = await pool.query(`
      INSERT INTO operator_machine_assignments (
        employee_id, machine_id, proficiency_level, preference_rank, training_date, notes
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [
      testData.employee_id, 
      testData.machine_id, 
      testData.proficiency_level || 'trained', 
      testData.preference_rank || 1, 
      testData.training_date, 
      testData.notes
    ]);
    
    console.log('Inserted assignment:', result.rows[0]);
    
    // Verify what was actually saved
    const verify = await pool.query(`
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
      WHERE oma.id = $1
    `, [result.rows[0].id]);
    
    console.log('Verification query result:', verify.rows[0]);
    
    // Clean up test data
    await pool.query('DELETE FROM operator_machine_assignments WHERE id = $1', [result.rows[0].id]);
    console.log('Test assignment cleaned up');
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

testOperatorAssignment();