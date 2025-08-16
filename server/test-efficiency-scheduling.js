const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function testEfficiencyScheduling() {
  try {
    console.log('=== TESTING EFFICIENCY MODIFIERS IN SCHEDULING ===\n');
    
    // Test with a few employees from each shift
    const testEmployees = [
      { name: 'Chris Johnson', id: 'CJ007', numeric_id: 6 },  // Day shift
      { name: 'Drew Darling', id: 'DD009', numeric_id: 9 },   // Day shift  
      { name: 'Corey Smith', id: 'CS005', numeric_id: 7 },     // Night shift
      { name: 'Andy Pontier', id: 'AP003', numeric_id: 3 }     // Night shift
    ];
    
    for (const emp of testEmployees) {
      const result = await pool.query(`
        SELECT 
          e.employee_id,
          e.first_name,
          e.last_name,
          e.shift_type,
          e.start_time,
          e.end_time,
          e.numeric_id,
          -- Calculate raw shift duration
          CASE 
            WHEN e.end_time::time < e.start_time::time THEN
              -- Overnight shift
              EXTRACT(HOUR FROM ('24:00:00'::time - e.start_time::time + e.end_time::time)) +
              EXTRACT(MINUTE FROM ('24:00:00'::time - e.start_time::time + e.end_time::time)) / 60.0
            ELSE
              -- Regular shift
              EXTRACT(HOUR FROM (e.end_time::time - e.start_time::time)) +
              EXTRACT(MINUTE FROM (e.end_time::time - e.start_time::time)) / 60.0
          END as raw_hours
        FROM employees e
        WHERE e.employee_id = $1
      `, [emp.id]);
      
      if (result.rows.length > 0) {
        const employee = result.rows[0];
        const rawHours = parseFloat(employee.raw_hours);
        const rawMinutes = rawHours * 60;
        
        // Apply efficiency modifiers
        const efficiency = employee.shift_type === 'day' ? 0.85 : 0.60;
        const effectiveMinutes = Math.floor(rawMinutes * efficiency);
        const effectiveHours = effectiveMinutes / 60;
        
        console.log(`${employee.first_name} ${employee.last_name} (${employee.shift_type} shift):`);
        console.log(`  Shift: ${employee.start_time} - ${employee.end_time}`);
        console.log(`  Raw capacity: ${rawHours.toFixed(1)}h (${rawMinutes.toFixed(0)} min)`);
        console.log(`  Efficiency: ${efficiency * 100}%`);
        console.log(`  Effective capacity: ${effectiveHours.toFixed(1)}h (${effectiveMinutes} min)`);
        console.log(`  ${employee.shift_type === 'day' ? '✅' : '⚠️'} ${employee.shift_type === 'day' ? '1st shift - Higher reliability' : '2nd shift - Lower reliability'}\n`);
      }
    }
    
    console.log('=== PRACTICAL IMPACT ===');
    console.log('Example: 8-hour job assignment');
    console.log('  1st shift (85% efficiency): Would need 9.4 hours of scheduled time');
    console.log('  2nd shift (60% efficiency): Would need 13.3 hours of scheduled time');
    console.log('\nThis ensures we only schedule what operators can realistically complete!');
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
    process.exit();
  }
}

testEfficiencyScheduling();