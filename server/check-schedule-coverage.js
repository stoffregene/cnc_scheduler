const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function checkScheduleCoverage() {
  try {
    console.log('=== EMPLOYEE WORK SCHEDULE DATABASE COVERAGE ===\n');
    
    // Check date range coverage in employee_work_schedules table
    const coverageQuery = `
      SELECT 
        MIN(date) as earliest_date,
        MAX(date) as latest_date,
        COUNT(DISTINCT date) as total_days,
        COUNT(DISTINCT employee_id) as total_employees
      FROM employee_work_schedules;
    `;
    
    const coverageResult = await pool.query(coverageQuery);
    const coverage = coverageResult.rows[0];
    
    console.log('📅 Date Coverage in employee_work_schedules table:');
    console.log('Earliest date:', coverage.earliest_date);
    console.log('Latest date:', coverage.latest_date);
    console.log('Total days covered:', coverage.total_days);
    console.log('Total employees:', coverage.total_employees);
    
    if (coverage.latest_date) {
      const latestDate = new Date(coverage.latest_date);
      const targetDate = new Date('2025-08-18');
      const daysDiff = Math.ceil((targetDate - latestDate) / (1000 * 60 * 60 * 24));
      console.log(`Gap between latest coverage (${coverage.latest_date}) and target date (2025-08-18): ${daysDiff} days\n`);
    }
    
    // Check if Aug 18, 2025 is covered
    const targetDateQuery = `
      SELECT 
        employee_id,
        date,
        start_time,
        end_time,
        is_working_day
      FROM employee_work_schedules 
      WHERE date = '2025-08-18'
      ORDER BY employee_id;
    `;
    
    const targetResult = await pool.query(targetDateQuery);
    
    console.log('🎯 Coverage for August 18, 2025:');
    if (targetResult.rows.length === 0) {
      console.log('❌ NO ENTRIES FOUND for August 18, 2025');
      console.log('This is likely why we\'re getting "Invalid target start time calculated" error!\n');
    } else {
      console.log(`✅ Found ${targetResult.rows.length} entries for August 18, 2025:`);
      targetResult.rows.forEach(row => {
        console.log(`   Employee ${row.employee_id}: ${row.start_time}-${row.end_time} (working: ${row.is_working_day})`);
      });
      console.log();
    }
    
    // Check what employee 9 (Drew) has for schedule coverage
    const drewQuery = `
      SELECT 
        MIN(date) as earliest_date,
        MAX(date) as latest_date,
        COUNT(*) as total_entries
      FROM employee_work_schedules 
      WHERE employee_id = 9;
    `;
    
    const drewResult = await pool.query(drewQuery);
    const drew = drewResult.rows[0];
    
    console.log('👤 Drew (Employee 9) schedule coverage:');
    console.log('Earliest date:', drew.earliest_date);
    console.log('Latest date:', drew.latest_date);
    console.log('Total entries:', drew.total_entries);
    console.log();
    
    // Check Drew's typical weekly pattern
    const patternQuery = `
      SELECT 
        EXTRACT(DOW FROM date) as day_of_week,
        start_time,
        end_time,
        is_working_day,
        COUNT(*) as occurrences
      FROM employee_work_schedules 
      WHERE employee_id = 9
      GROUP BY EXTRACT(DOW FROM date), start_time, end_time, is_working_day
      ORDER BY day_of_week;
    `;
    
    const patternResult = await pool.query(patternQuery);
    
    console.log('📊 Drew\'s weekly pattern (0=Sunday, 6=Saturday):');
    patternResult.rows.forEach(row => {
      const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][row.day_of_week];
      console.log(`   ${dayName}: ${row.start_time}-${row.end_time} (working: ${row.is_working_day}) - ${row.occurrences} occurrences`);
    });
    console.log();
    
    // Test the database function for Aug 18, 2025 with Drew
    console.log('🔧 Testing database function for Drew on Aug 18, 2025...');
    const functionTestQuery = `
      SELECT * FROM get_employee_working_hours(9, '2025-08-18'::date);
    `;
    
    try {
      const functionResult = await pool.query(functionTestQuery);
      console.log('Function result:');
      console.log(JSON.stringify(functionResult.rows[0], null, 2));
    } catch (err) {
      console.log('❌ Database function error:', err.message);
    }
    
    // Check what day of week Aug 18, 2025 is
    const aug18_2025 = new Date('2025-08-18');
    const dayOfWeek = aug18_2025.getDay();
    const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dayOfWeek];
    console.log(`\n📅 August 18, 2025 is a ${dayName} (day ${dayOfWeek})`);
    
    // Find Drew's pattern for that day of week
    const dayPatternQuery = `
      SELECT start_time, end_time, is_working_day
      FROM employee_work_schedules 
      WHERE employee_id = 9 
      AND EXTRACT(DOW FROM date) = $1
      LIMIT 1;
    `;
    
    const dayPatternResult = await pool.query(dayPatternQuery, [dayOfWeek]);
    if (dayPatternResult.rows.length > 0) {
      const pattern = dayPatternResult.rows[0];
      console.log(`Drew's typical pattern for ${dayName}s: ${pattern.start_time}-${pattern.end_time} (working: ${pattern.is_working_day})`);
    } else {
      console.log(`❌ No pattern found for Drew on ${dayName}s`);
    }
    
    await pool.end();
  } catch (error) {
    console.error('Error checking schedule coverage:', error);
    await pool.end();
  }
}

checkScheduleCoverage();