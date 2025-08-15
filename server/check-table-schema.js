const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function checkSchema() {
  try {
    console.log('=== CHECKING TABLE SCHEMAS ===\n');
    
    // Check employee_work_schedules table schema
    const schemaQuery = `
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'employee_work_schedules'
      ORDER BY ordinal_position;
    `;
    
    const result = await pool.query(schemaQuery);
    console.log('employee_work_schedules table schema:');
    result.rows.forEach(row => {
      console.log(`  ${row.column_name}: ${row.data_type} (${row.is_nullable === 'YES' ? 'nullable' : 'not null'})`);
    });
    
    console.log('\nSample data from employee_work_schedules:');
    const sampleQuery = `SELECT * FROM employee_work_schedules LIMIT 5`;
    const sampleResult = await pool.query(sampleQuery);
    console.log(JSON.stringify(sampleResult.rows, null, 2));
    
    // Also check if there are other schedule-related tables
    const tablesQuery = `
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_name LIKE '%schedule%' OR table_name LIKE '%shift%'
      AND table_schema = 'public';
    `;
    
    const tablesResult = await pool.query(tablesQuery);
    console.log('\nAll schedule/shift related tables:');
    tablesResult.rows.forEach(row => {
      console.log(`  ${row.table_name}`);
    });
    
    await pool.end();
  } catch (error) {
    console.error('Error:', error);
    await pool.end();
  }
}

checkSchema();