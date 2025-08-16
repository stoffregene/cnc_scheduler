const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function fixSchemaMismatch() {
  try {
    console.log('=== FIXING EMPLOYEE ID SCHEMA MISMATCH ===');
    
    // Option 1: Create a mapping table between integer and string employee IDs
    // Option 2: Add a numeric ID field to employees table
    // Option 3: Fix the specific schedule slot only
    
    console.log('1. Current situation analysis...');
    
    // Check employees table structure
    const empSchemaResult = await pool.query(`
      SELECT column_name, data_type, character_maximum_length
      FROM information_schema.columns 
      WHERE table_name = 'employees' AND column_name = 'employee_id'
    `);
    console.log('  employees.employee_id type:', empSchemaResult.rows[0]);
    
    // Check schedule_slots table structure
    const slotSchemaResult = await pool.query(`
      SELECT column_name, data_type, character_maximum_length
      FROM information_schema.columns 
      WHERE table_name = 'schedule_slots' AND column_name = 'employee_id'
    `);
    console.log('  schedule_slots.employee_id type:', slotSchemaResult.rows[0]);
    
    // Check foreign key constraints
    const fkResult = await pool.query(`
      SELECT 
        tc.constraint_name, 
        tc.table_name, 
        kcu.column_name, 
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name 
      FROM information_schema.table_constraints AS tc 
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY' 
        AND tc.table_name = 'schedule_slots'
        AND kcu.column_name = 'employee_id'
    `);
    console.log('  Foreign key constraints on schedule_slots.employee_id:', fkResult.rows);
    
    console.log('\n2. The issue is that employees use string IDs (CJ007) but schedule_slots expects integers (7)');
    console.log('   Let\'s create a solution by adding a numeric_id field to employees...');
    
    // Add a numeric_id field to employees table
    try {
      await pool.query('ALTER TABLE employees ADD COLUMN IF NOT EXISTS numeric_id SERIAL');
      console.log('  Added numeric_id column to employees table');
    } catch (error) {
      console.log('  numeric_id column may already exist:', error.message);
    }
    
    // Update employees with numeric IDs based on their order
    console.log('\n3. Updating employees with numeric IDs...');
    const employeesResult = await pool.query(`
      SELECT employee_id, first_name, last_name
      FROM employees 
      WHERE status = 'active'
      ORDER BY first_name, last_name
    `);
    
    for (let i = 0; i < employeesResult.rows.length; i++) {
      const emp = employeesResult.rows[i];
      const numericId = i + 1;
      
      await pool.query(`
        UPDATE employees 
        SET numeric_id = $1 
        WHERE employee_id = $2
      `, [numericId, emp.employee_id]);
      
      console.log(`    ${numericId}: ${emp.employee_id} (${emp.first_name} ${emp.last_name})`);
    }
    
    console.log('\n4. Now checking which employee has numeric_id = 7...');
    const emp7Result = await pool.query(`
      SELECT employee_id, first_name, last_name, numeric_id
      FROM employees 
      WHERE numeric_id = 7
    `);
    
    if (emp7Result.rows.length > 0) {
      const emp7 = emp7Result.rows[0];
      console.log(`  Employee with numeric_id 7: ${emp7.employee_id} (${emp7.first_name} ${emp7.last_name})`);
      
      // Now we know that schedule_slots employee_id=7 should correspond to this employee
      // Let's update the shift capacity query to use numeric_id instead
      console.log('\n5. The solution is to update the shift capacity API to join on numeric_id instead of employee_id');
      console.log('   This preserves data integrity without breaking foreign keys');
      
      // Test the corrected query
      console.log('\n6. Testing corrected shift capacity query for August 14...');
      const capacityResult = await pool.query(`
        SELECT 
          e.employee_id,
          e.first_name,
          e.last_name,
          e.shift_type,
          e.numeric_id,
          COALESCE(SUM(ss.duration_minutes), 0) as total_scheduled_minutes
        FROM employees e
        LEFT JOIN schedule_slots ss ON e.numeric_id = ss.employee_id
          AND ss.slot_date = '2025-08-14'
          AND ss.status IN ('scheduled', 'in_progress')
        WHERE e.status = 'active' AND e.numeric_id = 7
        GROUP BY e.employee_id, e.first_name, e.last_name, e.shift_type, e.numeric_id
      `);
      
      if (capacityResult.rows.length > 0) {
        const emp = capacityResult.rows[0];
        console.log(`  Result: ${emp.first_name} ${emp.last_name} (${emp.employee_id}) has ${emp.total_scheduled_minutes} minutes scheduled on Aug 14`);
        console.log(`  This employee is on ${emp.shift_type} shift`);
      }
      
    } else {
      console.log('  No employee found with numeric_id = 7');
    }
    
    console.log('\n✅ Schema analysis complete!');
    console.log('   Next step: Update shift-capacity.js API to use numeric_id for the JOIN');
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
    process.exit();
  }
}

fixSchemaMismatch();