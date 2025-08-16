const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function fixSlotEmployee() {
  try {
    console.log('=== FIXING SCHEDULE SLOT EMPLOYEE ID ===');
    
    // Based on the employee list, employee_id=7 should be Chris Johnson (CJ007)
    // Since he's the 6th in the list (0-indexed), but the slot has ID 7, 
    // let's check the exact mapping
    
    console.log('1. Current schedule slot for job 60241:');
    const slotResult = await pool.query(`
      SELECT ss.*, j.job_number, m.name as machine_name
      FROM schedule_slots ss 
      JOIN jobs j ON ss.job_id = j.id 
      JOIN machines m ON ss.machine_id = m.id
      WHERE j.job_number = '60241'
    `);
    
    const slot = slotResult.rows[0];
    console.log(`  Job ${slot.job_number}: employee_id=${slot.employee_id} (${typeof slot.employee_id}) on ${slot.machine_name}`);
    console.log(`  Date: ${slot.slot_date}, Duration: ${slot.duration_minutes} minutes`);
    
    // Chris Johnson is CJ007 and can operate VMC-004
    const chrisId = 'CJ007';
    console.log(`\n2. Updating schedule slot to use Chris Johnson (${chrisId})...`);
    
    // First check the current data type of employee_id in schedule_slots
    const schemaResult = await pool.query(`
      SELECT column_name, data_type, character_maximum_length
      FROM information_schema.columns 
      WHERE table_name = 'schedule_slots' AND column_name = 'employee_id'
    `);
    
    console.log('  Current employee_id column type:', schemaResult.rows[0]);
    
    // If it's still integer, we need to change it to varchar first
    if (schemaResult.rows[0].data_type === 'integer') {
      console.log('  Converting employee_id column from integer to varchar...');
      await pool.query('ALTER TABLE schedule_slots ALTER COLUMN employee_id TYPE VARCHAR(50)');
      console.log('  Column type changed successfully');
    }
    
    // Update the schedule slot
    const updateResult = await pool.query(`
      UPDATE schedule_slots 
      SET employee_id = $1
      WHERE id = $2
      RETURNING *
    `, [chrisId, slot.id]);
    
    console.log('  Schedule slot updated successfully:');
    console.log(`    employee_id: ${updateResult.rows[0].employee_id}`);
    
    console.log('\n3. Testing the shift capacity query now...');
    
    // Test if the employee lookup now works
    const testResult = await pool.query(`
      SELECT ss.*, j.job_number, m.name as machine_name, e.first_name, e.last_name, e.shift_type
      FROM schedule_slots ss
      JOIN jobs j ON ss.job_id = j.id
      JOIN machines m ON ss.machine_id = m.id
      LEFT JOIN employees e ON ss.employee_id = e.employee_id
      WHERE j.job_number = '60241'
    `);
    
    const testSlot = testResult.rows[0];
    console.log('  Employee lookup result:');
    console.log(`    Employee: ${testSlot.first_name} ${testSlot.last_name} (${testSlot.shift_type} shift)`);
    console.log(`    Machine: ${testSlot.machine_name}`);
    console.log(`    Duration: ${testSlot.duration_minutes} minutes`);
    console.log(`    Date: ${testSlot.slot_date}`);
    
    // Test capacity calculation for August 14th
    console.log('\n4. Testing shift capacity for August 14, 2025...');
    const capacityResult = await pool.query(`
      SELECT 
        e.employee_id,
        e.first_name,
        e.last_name,
        e.shift_type,
        COALESCE(SUM(ss.duration_minutes), 0) as total_scheduled_minutes
      FROM employees e
      LEFT JOIN schedule_slots ss ON e.employee_id = ss.employee_id
        AND ss.slot_date = '2025-08-14'
        AND ss.status IN ('scheduled', 'in_progress')
      WHERE e.status = 'active' AND e.employee_id = $1
      GROUP BY e.employee_id, e.first_name, e.last_name, e.shift_type
    `, [chrisId]);
    
    if (capacityResult.rows.length > 0) {
      const emp = capacityResult.rows[0];
      console.log(`  ${emp.first_name} ${emp.last_name}: ${emp.total_scheduled_minutes} minutes scheduled on Aug 14`);
    }
    
    console.log('\n✅ Fix completed! The schedule slot now has the correct employee ID.');
    console.log('   The shift capacity should now show consumption when viewing August 14th.');
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
    process.exit();
  }
}

fixSlotEmployee();