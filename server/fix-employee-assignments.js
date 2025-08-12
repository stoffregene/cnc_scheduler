const { Pool } = require('pg');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function fixEmployeeAssignments() {
  try {
    console.log('Finding schedule slots with missing employee assignments...');
    
    // Find slots with null employee_id
    const nullEmployeeResult = await pool.query(`
      SELECT 
        ss.id,
        ss.job_id,
        j.job_number,
        ss.machine_id,
        m.name as machine_name,
        ss.employee_id,
        ss.start_datetime,
        ss.notes
      FROM schedule_slots ss
      JOIN jobs j ON ss.job_id = j.id
      JOIN machines m ON ss.machine_id = m.id
      WHERE ss.employee_id IS NULL
      ORDER BY ss.start_datetime
    `);
    
    console.log(`Found ${nullEmployeeResult.rows.length} slots with missing employee assignments:`);
    nullEmployeeResult.rows.forEach(slot => {
      console.log(`  Slot ${slot.id}: Job ${slot.job_number} on ${slot.machine_name} at ${new Date(slot.start_datetime).toLocaleString()}`);
    });
    
    if (nullEmployeeResult.rows.length === 0) {
      console.log('No slots need fixing!');
      return;
    }
    
    // For each slot, find a suitable employee assignment
    for (const slot of nullEmployeeResult.rows) {
      console.log(`\nFixing slot ${slot.id} on machine ${slot.machine_name}...`);
      
      // Find employees who can operate this machine
      const operatorResult = await pool.query(`
        SELECT 
          e.id as employee_id,
          e.first_name || ' ' || e.last_name as employee_name,
          oma.proficiency_level
        FROM employees e
        JOIN operator_machine_assignments oma ON e.id = oma.employee_id
        WHERE oma.machine_id = $1
        AND e.status = 'active'
        ORDER BY oma.proficiency_level DESC, e.id
        LIMIT 1
      `, [slot.machine_id]);
      
      if (operatorResult.rows.length > 0) {
        const operator = operatorResult.rows[0];
        console.log(`  Assigning to ${operator.employee_name} (ID: ${operator.employee_id})`);
        
        // Update the slot
        await pool.query(`
          UPDATE schedule_slots 
          SET employee_id = $1, updated_at = CURRENT_TIMESTAMP
          WHERE id = $2
        `, [operator.employee_id, slot.id]);
        
        console.log(`  ✅ Updated slot ${slot.id}`);
      } else {
        console.log(`  ❌ No qualified operator found for machine ${slot.machine_name}`);
      }
    }
    
    console.log('\n🎉 Employee assignment fix complete!');
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

fixEmployeeAssignments();