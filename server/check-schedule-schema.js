const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:sassysalad@localhost:5432/cnc_scheduler'
});

async function checkScheduleSchema() {
  try {
    console.log('=== CHECKING EMPLOYEE SCHEDULE TABLES SCHEMA ===\n');
    
    // Check employee_work_schedules table structure
    console.log('1. employee_work_schedules table columns:');
    const workSchedulesSchema = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'employee_work_schedules'
      ORDER BY ordinal_position
    `);
    
    if (workSchedulesSchema.rows.length > 0) {
      workSchedulesSchema.rows.forEach(col => {
        console.log(`- ${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable})`);
      });
    } else {
      console.log('❌ employee_work_schedules table does not exist');
    }
    
    // Check what tables exist that might contain schedule data
    console.log('\n2. Looking for schedule-related tables:');
    const tables = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name LIKE '%schedule%' OR table_name LIKE '%shift%'
      ORDER BY table_name
    `);
    
    console.log('Found schedule/shift tables:');
    tables.rows.forEach(table => {
      console.log(`- ${table.table_name}`);
    });
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

checkScheduleSchema();
