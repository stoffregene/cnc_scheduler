const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function checkDisplacementTables() {
  try {
    const client = await pool.connect();
    
    // Check for displacement-related tables
    const tablesResult = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND (table_name LIKE '%displacement%' OR table_name LIKE '%conflict%')
      ORDER BY table_name
    `);
    
    console.log('📋 Displacement/Conflict Tables:');
    if (tablesResult.rows.length > 0) {
      tablesResult.rows.forEach(row => {
        console.log(`   - ${row.table_name}`);
      });
    } else {
      console.log('   No displacement tables found');
    }
    
    // Check if scheduling_conflicts table exists and has data
    try {
      const conflictsResult = await client.query('SELECT COUNT(*) as count FROM scheduling_conflicts');
      console.log(`\n📊 Current conflicts: ${conflictsResult.rows[0].count}`);
    } catch (error) {
      console.log('\n⚠️ scheduling_conflicts table does not exist');
    }
    
    client.release();
  } catch (error) {
    console.error('Error checking tables:', error.message);
  } finally {
    await pool.end();
  }
}

checkDisplacementTables();