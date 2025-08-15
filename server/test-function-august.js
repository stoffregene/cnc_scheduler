const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function testFunction() {
  try {
    console.log('=== TESTING get_employee_working_hours FUNCTION ===\n');
    
    // Get Drew's (employee 9) work schedule pattern
    const patternQuery = `
      SELECT 
        day_of_week,
        start_time,
        end_time,
        enabled
      FROM employee_work_schedules 
      WHERE employee_id = 9
      ORDER BY day_of_week;
    `;
    
    const patternResult = await pool.query(patternQuery);
    console.log('Drew (Employee 9) weekly schedule pattern:');
    patternResult.rows.forEach(row => {
      const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][row.day_of_week];
      console.log(`  ${dayName} (${row.day_of_week}): ${row.start_time} - ${row.end_time} (enabled: ${row.enabled})`);
    });
    
    // Check what day of week Aug 18, 2025 is
    const aug18_2025 = new Date('2025-08-18');
    const dayOfWeek = aug18_2025.getDay();
    const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dayOfWeek];
    console.log(`\nAugust 18, 2025 is a ${dayName} (day ${dayOfWeek})\n`);
    
    // Test the database function for multiple dates including Aug 18, 2025
    const testDates = ['2025-08-12', '2025-08-18', '2025-08-19', '2025-08-25'];
    
    for (const testDate of testDates) {
      const testDate_obj = new Date(testDate);
      const dayOfWeek = testDate_obj.getDay();
      const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dayOfWeek];
      
      console.log(`🔧 Testing ${testDate} (${dayName}, day ${dayOfWeek}):`);
      
      try {
        const functionResult = await pool.query(
          'SELECT * FROM get_employee_working_hours($1, $2::date)',
          [9, testDate]
        );
        
        if (functionResult.rows.length > 0) {
          const result = functionResult.rows[0];
          console.log(`  ✅ Result: ${result.start_hour} - ${result.end_hour} (${result.duration_hours}h, working: ${result.is_working_day}, overnight: ${result.is_overnight})`);
        } else {
          console.log('  ❌ No result returned');
        }
      } catch (err) {
        console.log(`  ❌ Function error: ${err.message}`);
      }
      console.log();
    }
    
    await pool.end();
  } catch (error) {
    console.error('Error:', error);
    await pool.end();
  }
}

testFunction();