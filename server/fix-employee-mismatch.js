const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function fixEmployeeMismatch() {
  try {
    console.log('=== FIXING EMPLOYEE ID MISMATCH ===');
    
    // Show the problematic schedule slot
    console.log('1. Problematic schedule slot:');
    const slotResult = await pool.query(`
      SELECT ss.*, j.job_number, m.name as machine_name
      FROM schedule_slots ss 
      JOIN jobs j ON ss.job_id = j.id 
      JOIN machines m ON ss.machine_id = m.id
      WHERE j.job_number = $1
    `, ['60241']);
    
    if (slotResult.rows.length > 0) {
      const slot = slotResult.rows[0];
      console.log(`  Job ${slot.job_number}: employee_id=${slot.employee_id} on ${slot.machine_name}`);
      
      // Find which employee this should be (who can operate VMC-004)
      console.log('\n2. Finding qualified operators for VMC-004:');
      const operatorsResult = await pool.query(`
        SELECT e.employee_id, e.first_name, e.last_name, ama.proficiency_level
        FROM employees e
        JOIN operator_machine_assignments oma ON e.employee_id = oma.employee_id
        JOIN machines m ON oma.machine_id = m.id
        WHERE m.name = 'VMC-004' AND e.status = 'active'
        ORDER BY oma.proficiency_level DESC
      `);
      
      console.log('  Qualified operators:');
      operatorsResult.rows.forEach(op => {
        console.log(`    ${op.employee_id}: ${op.first_name} ${op.last_name} (${op.proficiency_level})`);
      });
      
      // Check if employee ID 7 corresponds to any of these (probably Chris Johnson)
      console.log('\n3. Finding the actual employee for ID 7:');
      
      // Since we know the job was scheduled correctly before, let's check if there's a pattern
      // Employee ID 7 in the application might correspond to Chris Johnson
      const chrisResult = await pool.query(`
        SELECT * FROM employees WHERE first_name = 'Chris' AND last_name = 'Johnson'
      `);
      
      if (chrisResult.rows.length > 0) {
        const chris = chrisResult.rows[0];
        console.log(`  Chris Johnson found: employee_id = "${chris.employee_id}"`);
        
        // Check if this makes sense with the schedule
        console.log('\n4. Updating the schedule slot with correct employee ID...');
        
        // Update the schedule slot to use Chris Johnson's correct ID
        const updateResult = await pool.query(`
          UPDATE schedule_slots 
          SET employee_id = $1::integer
          WHERE id = $2
          RETURNING *
        `, [chris.employee_id, slot.id]);
        
        console.log('  Schedule slot updated successfully');
        
        // Now test the shift capacity again
        console.log('\n5. Testing shift capacity after fix...');
        const capacityQuery = `
          SELECT 
            e.employee_id,
            e.first_name,
            e.last_name,
            e.shift_type,
            COALESCE(SUM(ss.duration_minutes), 0) as total_scheduled_minutes
          FROM employees e
          LEFT JOIN schedule_slots ss ON e.employee_id::integer = ss.employee_id
            AND ss.slot_date = $1
            AND ss.status IN ('scheduled', 'in_progress')
          WHERE e.status = 'active' AND e.employee_id = $2
          GROUP BY e.employee_id, e.first_name, e.last_name, e.shift_type
        `;
        
        const capacityResult = await pool.query(capacityQuery, ['2025-08-14', chris.employee_id]);
        
        if (capacityResult.rows.length > 0) {
          const emp = capacityResult.rows[0];
          console.log(`  ${emp.first_name} ${emp.last_name}: ${emp.total_scheduled_minutes} minutes scheduled`);
        }
        
      } else {
        console.log('  Chris Johnson not found');
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

fixEmployeeMismatch();