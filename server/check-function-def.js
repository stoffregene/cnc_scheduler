const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function checkFunctionDefinition() {
  try {
    const result = await pool.query(`
      SELECT routine_definition 
      FROM information_schema.routines 
      WHERE routine_name = 'get_employee_working_hours'
      AND routine_type = 'FUNCTION'
    `);
    
    console.log('get_employee_working_hours function definition:');
    console.log(result.rows[0]?.routine_definition || 'Function not found');
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

checkFunctionDefinition();