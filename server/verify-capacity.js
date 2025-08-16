const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function verifyCapacity() {
  try {
    console.log('=== VERIFYING SHIFT CAPACITY AFTER FIX ===\n');
    
    const result = await pool.query(`
      SELECT 
        e.first_name, 
        e.last_name, 
        e.shift_type,
        COALESCE(SUM(ss.duration_minutes), 0) as minutes
      FROM employees e
      LEFT JOIN schedule_slots ss ON e.numeric_id = ss.employee_id
        AND ss.slot_date = '2025-08-14'
        AND ss.status IN ('scheduled', 'in_progress')
      WHERE e.status = 'active'
      GROUP BY e.employee_id, e.first_name, e.last_name, e.shift_type
      HAVING SUM(ss.duration_minutes) > 0
    `);
    
    console.log('August 14, 2025 capacity consumption:');
    let dayTotal = 0;
    let nightTotal = 0;
    
    result.rows.forEach(r => {
      console.log(`  ${r.first_name} ${r.last_name} (${r.shift_type} shift): ${r.minutes} minutes`);
      if (r.shift_type === 'day') dayTotal += parseInt(r.minutes);
      if (r.shift_type === 'night') nightTotal += parseInt(r.minutes);
    });
    
    console.log('\nTotals:');
    console.log(`  1st shift (day): ${dayTotal} minutes`);
    console.log(`  2nd shift (night): ${nightTotal} minutes`);
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
    process.exit();
  }
}

verifyCapacity();