const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function checkColumnTypes() {
  try {
    console.log('🔍 Checking database column types...\n');
    
    const client = await pool.connect();
    
    // Check column types for jobs table
    console.log('📊 Jobs table column types:');
    const jobsColumns = await client.query(`
      SELECT column_name, data_type, numeric_precision, numeric_scale, character_maximum_length
      FROM information_schema.columns 
      WHERE table_name = 'jobs' 
      ORDER BY ordinal_position;
    `);
    
    jobsColumns.rows.forEach(row => {
      let typeInfo = row.data_type;
      if (row.numeric_precision) {
        typeInfo += `(${row.numeric_precision}`;
        if (row.numeric_scale) {
          typeInfo += `,${row.numeric_scale}`;
        }
        typeInfo += ')';
      } else if (row.character_maximum_length) {
        typeInfo += `(${row.character_maximum_length})`;
      }
      console.log(`  ${row.column_name}: ${typeInfo}`);
    });
    
    // Test inserting a problematic value to see exact error
    console.log('\\n🧪 Testing problematic value insertion...');
    
    try {
      const testResult = await client.query(`
        INSERT INTO jobs (
          job_number, customer_name, part_name, part_number, quantity,
          priority, estimated_hours, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id
      `, [
        '59917',
        'ROTO ROOTE', 
        'Drive Dogs .5 D-Shaft Drive',
        'test-part-number',
        500,
        5,
        816.9599999999998,
        'pending'
      ]);
      
      console.log(`✅ Test insertion successful! ID: ${testResult.rows[0].id}`);
      
      // Clean up
      await client.query('DELETE FROM jobs WHERE id = $1', [testResult.rows[0].id]);
      
    } catch (error) {
      console.log(`❌ Test insertion failed: ${error.message}`);
      console.log(`Error code: ${error.code}`);
      console.log(`Error detail: ${error.detail || 'No detail'}`);
      console.log(`Error hint: ${error.hint || 'No hint'}`);
    }
    
    // Check if the issue is with specific fields that might be missing in the import
    console.log('\\n🔍 Checking required vs optional fields...');
    
    const constraints = await client.query(`
      SELECT column_name, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_name = 'jobs' 
      AND is_nullable = 'NO'
      ORDER BY column_name;
    `);
    
    console.log('Required fields (NOT NULL):');
    constraints.rows.forEach(row => {
      console.log(`  ${row.column_name}: nullable=${row.is_nullable}, default=${row.column_default || 'none'}`);
    });
    
    client.release();
    
  } catch (error) {
    console.error('❌ Check failed:', error.message);
    console.error(error.stack);
  } finally {
    await pool.end();
  }
}

// Run the check
checkColumnTypes();