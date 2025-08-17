const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:sassysalad@localhost:5432/cnc_scheduler'
});

async function checkFunctionDef() {
  try {
    const result = await pool.query(`
      SELECT 
        prosrc as source_code,
        proname as function_name
      FROM pg_proc 
      WHERE proname = 'get_employee_working_hours'
    `);
    
    if (result.rows.length > 0) {
      console.log('get_employee_working_hours function source:');
      console.log(result.rows[0].source_code);
    } else {
      console.log('Function get_employee_working_hours not found');
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

checkFunctionDef();
