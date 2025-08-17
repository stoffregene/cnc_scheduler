const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:sassysalad@localhost:5432/cnc_scheduler'
});

async function checkScheduleSlots() {
  try {
    const result = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'schedule_slots'
      ORDER BY ordinal_position
    `);
    
    console.log('schedule_slots table columns:');
    result.rows.forEach(row => {
      console.log(`  - ${row.column_name}: ${row.data_type}`);
    });
    
    // Check sample data
    const sample = await pool.query(`
      SELECT * FROM schedule_slots LIMIT 1
    `);
    
    console.log('\nSample schedule_slots data:');
    if (sample.rows.length > 0) {
      console.log(Object.keys(sample.rows[0]));
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

checkScheduleSlots();