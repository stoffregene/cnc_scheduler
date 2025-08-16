const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function fixScheduleSchema() {
  try {
    console.log('=== SCHEDULE SCHEMA FIX ===');
    
    // 1. Check all schedule slots with invalid employee IDs
    console.log('\n1. Checking for invalid employee assignments...');
    const invalidQuery = `
      SELECT ss.id, ss.employee_id, ss.job_id, ss.machine_id, 
             j.job_number, m.name as machine_name
      FROM schedule_slots ss
      JOIN jobs j ON ss.job_id = j.id
      JOIN machines m ON ss.machine_id = m.id
      WHERE ss.employee_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM employees e 
        WHERE e.employee_id = ss.employee_id::text
      )
    `;
    
    const invalidResult = await pool.query(invalidQuery);
    console.log(`Found ${invalidResult.rows.length} schedule slots with invalid employee IDs:`);
    
    invalidResult.rows.forEach(row => {
      console.log(`  Slot ${row.id}: Job ${row.job_number}, Machine ${row.machine_name}, Employee ID ${row.employee_id} (INVALID)`);
    });
    
    // 2. Find qualified operators for each invalid assignment
    for (const slot of invalidResult.rows) {
      console.log(`\n2. Finding qualified operators for machine ${slot.machine_name} (ID ${slot.machine_id})...`);
      
      // Cast machine_id to text for comparison
      const qualifiedQuery = `
        SELECT e.employee_id, e.first_name, e.last_name
        FROM operator_machine_assignments oma
        JOIN employees e ON oma.employee_id = e.employee_id
        WHERE oma.machine_id = $1
        ORDER BY e.employee_id
        LIMIT 1
      `;
      
      const qualifiedResult = await pool.query(qualifiedQuery, [slot.machine_id]);
      
      if (qualifiedResult.rows.length > 0) {
        const operator = qualifiedResult.rows[0];
        console.log(`  Qualified operator: ${operator.employee_id} (${operator.first_name} ${operator.last_name})`);
        
        // 3. Fix the assignment
        console.log(`  Fixing slot ${slot.id}...`);
        const updateQuery = `
          UPDATE schedule_slots 
          SET employee_id = $1::integer
          WHERE id = $2
        `;
        
        // Try to convert string employee_id to integer if possible
        // But this won't work since employee IDs are alphanumeric
        // We need to change the schema instead
        console.log(`  ⚠️  Cannot fix: employee_id '${operator.employee_id}' cannot be converted to integer`);
        console.log(`  📋 SOLUTION NEEDED: Change schedule_slots.employee_id from integer to varchar`);
        
      } else {
        console.log(`  ❌ No qualified operators found for machine ${slot.machine_name}`);
      }
    }
    
    // 4. Recommend schema change
    if (invalidResult.rows.length > 0) {
      console.log('\n=== SCHEMA CHANGE REQUIRED ===');
      console.log('The schedule_slots.employee_id column needs to be changed from integer to varchar');
      console.log('to match the employees.employee_id column type.');
      console.log('\nRecommended SQL:');
      console.log('ALTER TABLE schedule_slots ALTER COLUMN employee_id TYPE VARCHAR;');
      console.log('\nThen update invalid assignments:');
      
      for (const slot of invalidResult.rows) {
        const qualifiedResult = await pool.query(`
          SELECT e.employee_id
          FROM operator_machine_assignments oma
          JOIN employees e ON oma.employee_id = e.employee_id
          WHERE oma.machine_id = $1
          ORDER BY e.employee_id
          LIMIT 1
        `, [slot.machine_id]);
        
        if (qualifiedResult.rows.length > 0) {
          console.log(`UPDATE schedule_slots SET employee_id = '${qualifiedResult.rows[0].employee_id}' WHERE id = ${slot.id};`);
        }
      }
    }
    
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
    process.exit();
  }
}

fixScheduleSchema();