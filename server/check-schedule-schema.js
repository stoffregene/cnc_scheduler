const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5732/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function checkScheduleSchema() {
  try {
    console.log('🔍 Checking schedule_slots table schema...\n');
    
    const result = await pool.query(`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'schedule_slots' 
      ORDER BY ordinal_position
    `);
    
    console.log('Schedule_slots table columns:');
    result.rows.forEach(row => {
      console.log(`  ${row.column_name}: ${row.data_type} (nullable: ${row.is_nullable})`);
    });
    
    // Sample some schedule data
    console.log('\n📊 Sample schedule slots:');
    const sampleResult = await pool.query(`
      SELECT ss.*, j.job_number, j.customer_name
      FROM schedule_slots ss
      JOIN jobs j ON ss.job_id = j.id
      ORDER BY ss.id
      LIMIT 5
    `);
    
    sampleResult.rows.forEach(slot => {
      console.log(`   Job ${slot.job_number}: ${slot.scheduled_start} to ${slot.scheduled_end}`);
    });
    
  } catch (error) {
    console.error('Error checking schema:', error);
  } finally {
    await pool.end();
  }
}

checkScheduleSchema();