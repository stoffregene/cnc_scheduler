const { Pool } = require('pg');
require('dotenv').config();

async function checkScheduleSlotsSchema() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL
  });

  try {
    console.log('📋 Schedule Slots Table Schema:\n');
    
    // Get table structure
    const schemaQuery = `
      SELECT 
        column_name,
        data_type,
        is_nullable,
        column_default
      FROM information_schema.columns 
      WHERE table_name = 'schedule_slots' 
      AND table_schema = 'public'
      ORDER BY ordinal_position;
    `;
    
    const schema = await pool.query(schemaQuery);
    
    console.log('Schedule Slots Columns:');
    console.log('='.repeat(80));
    schema.rows.forEach(col => {
      const nullable = col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL';
      const defaultVal = col.column_default ? ` DEFAULT ${col.column_default}` : '';
      
      console.log(`${col.column_name.padEnd(25)} | ${col.data_type} ${nullable}${defaultVal}`);
    });
    
  } catch (error) {
    console.error('❌ Error checking schema:', error.message);
  } finally {
    await pool.end();
  }
}

checkScheduleSlotsSchema();