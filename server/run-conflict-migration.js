const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5732/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function runMigration() {
  try {
    console.log('Running conflict detection tables migration...');
    
    const sql = fs.readFileSync('../database/migrations/006_create_conflict_detection_tables.sql', 'utf8');
    await pool.query(sql);
    
    console.log('✅ Conflict detection tables created successfully');
    
    // Test the tables
    const testQuery = `
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('conflict_detection_runs', 'detected_conflicts', 'conflict_resolutions')
      ORDER BY table_name
    `;
    
    const result = await pool.query(testQuery);
    console.log('📋 Created tables:', result.rows.map(r => r.table_name));
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
  } finally {
    await pool.end();
  }
}

runMigration();