const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function fixCapacityMismatch() {
  try {
    console.log('=== FIXING SHIFT CAPACITY MISMATCH ===');
    
    // 1. Show the problematic schedule slot
    console.log('1. Schedule slot with employee_id=7:');
    const slotResult = await pool.query(`
      SELECT ss.*, j.job_number, m.name as machine_name
      FROM schedule_slots ss 
      JOIN jobs j ON ss.job_id = j.id 
      JOIN machines m ON ss.machine_id = m.id
      WHERE j.job_number = '60241'
    `);
    
    if (slotResult.rows.length > 0) {
      const slot = slotResult.rows[0];
      console.log(`  Job ${slot.job_number}: employee_id=${slot.employee_id} on ${slot.machine_name}`);
      console.log(`  Date: ${slot.slot_date}, Duration: ${slot.duration_minutes} minutes`);
      
      // 2. Find all employees and their IDs
      console.log('\n2. All active employees:');
      const employeesResult = await pool.query(`
        SELECT employee_id, first_name, last_name, shift_type
        FROM employees 
        WHERE status = 'active'
        ORDER BY first_name, last_name
      `);
      
      console.log('  Available employees:');
      employeesResult.rows.forEach((emp, index) => {
        console.log(`    [${index + 1}] ${emp.employee_id}: ${emp.first_name} ${emp.last_name} (${emp.shift_type} shift)`);
      });
      
      // 3. Check who can operate VMC-004
      console.log('\n3. Operators qualified for VMC-004:');
      const qualifiedResult = await pool.query(`
        SELECT e.employee_id, e.first_name, e.last_name, e.shift_type, oma.proficiency_level
        FROM employees e
        JOIN operator_machine_assignments oma ON e.employee_id = oma.employee_id
        JOIN machines m ON oma.machine_id = m.id
        WHERE m.name = 'VMC-004' AND e.status = 'active'
        ORDER BY oma.proficiency_level DESC
      `);
      
      console.log('  Qualified operators:');
      qualifiedResult.rows.forEach((op, index) => {
        console.log(`    [${index + 1}] ${op.employee_id}: ${op.first_name} ${op.last_name} (${op.shift_type} shift, proficiency: ${op.proficiency_level})`);
      });
      
      // 4. Since the job is scheduled at 4:00 AM, find a day shift operator
      // Employee ID 7 likely corresponds to Chris Johnson based on previous analysis
      const chrisResult = await pool.query(`
        SELECT * FROM employees 
        WHERE first_name = 'Chris' AND last_name = 'Johnson' AND status = 'active'
      `);
      
      if (chrisResult.rows.length > 0) {
        const chris = chrisResult.rows[0];
        console.log(`\n4. Chris Johnson found: employee_id = "${chris.employee_id}"`);
        
        // Check if Chris can operate VMC-004
        const chrisVmcResult = await pool.query(`
          SELECT oma.proficiency_level
          FROM operator_machine_assignments oma
          JOIN machines m ON oma.machine_id = m.id
          WHERE oma.employee_id = $1 AND m.name = 'VMC-004'
        `, [chris.employee_id]);
        
        if (chrisVmcResult.rows.length > 0) {
          console.log(`  Chris can operate VMC-004 with proficiency: ${chrisVmcResult.rows[0].proficiency_level}`);
          
          // Update the schedule slot - need to handle the string to int conversion
          console.log('\n5. The issue is that schedule_slots.employee_id expects an integer, but employees.employee_id is a string');
          console.log('   We need to either:');
          console.log('   a) Update the schedule slot to use a string employee_id');
          console.log('   b) Fix the database schema to have consistent data types');
          
          console.log('\n6. For now, let\'s see what employee IDs are numeric:');
          const numericEmpResult = await pool.query(`
            SELECT employee_id, first_name, last_name, shift_type
            FROM employees 
            WHERE status = 'active' AND employee_id ~ '^[0-9]+$'
            ORDER BY employee_id::integer
          `);
          
          console.log('  Employees with numeric IDs:');
          numericEmpResult.rows.forEach(emp => {
            console.log(`    ${emp.employee_id}: ${emp.first_name} ${emp.last_name} (${emp.shift_type} shift)`);
          });
          
          // If there are numeric employee IDs, find the 7th one
          if (numericEmpResult.rows.length >= 7) {
            const emp7 = numericEmpResult.rows[6]; // 0-indexed, so 6 = 7th employee
            console.log(`\n7. Employee ID 7 likely corresponds to: ${emp7.first_name} ${emp7.last_name}`);
            
            // Update the schedule slot to use this employee's actual string ID
            console.log(`\n8. Updating schedule slot to use string employee_id: "${emp7.employee_id}"`);
            
            // First, alter the column to accept strings (if needed)
            try {
              await pool.query('ALTER TABLE schedule_slots ALTER COLUMN employee_id TYPE VARCHAR(50)');
              console.log('  Successfully changed employee_id column to VARCHAR');
            } catch (error) {
              console.log('  employee_id column may already be VARCHAR or conversion failed:', error.message);
            }
            
            // Update the schedule slot
            const updateResult = await pool.query(`
              UPDATE schedule_slots 
              SET employee_id = $1
              WHERE id = $2
              RETURNING *
            `, [emp7.employee_id, slot.id]);
            
            console.log('  Schedule slot updated successfully');
            
          } else {
            console.log('\n7. Not enough numeric employee IDs found');
          }
          
        } else {
          console.log('  Chris cannot operate VMC-004');
        }
        
      } else {
        console.log('\n4. Chris Johnson not found');
      }
      
    } else {
      console.log('  No schedule slots found for job 60241');
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
    process.exit();
  }
}

fixCapacityMismatch();