const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function fixSlot985() {
  try {
    // Find qualified operator for machine 5
    const operatorResult = await pool.query(`
      SELECT 
        e.id as employee_id,
        e.first_name || ' ' || e.last_name as employee_name,
        oma.proficiency_level
      FROM employees e
      JOIN operator_machine_assignments oma ON e.id = oma.employee_id
      WHERE oma.machine_id = 5
      AND e.status = 'active'
      ORDER BY oma.proficiency_level DESC
      LIMIT 1
    `);
    
    if (operatorResult.rows.length > 0) {
      const operator = operatorResult.rows[0];
      console.log(`Assigning slot 985 to ${operator.employee_name} (ID: ${operator.employee_id})`);
      
      await pool.query(`
        UPDATE schedule_slots 
        SET employee_id = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = 985
      `, [operator.employee_id]);
      
      console.log('✅ Fixed slot 985');
    } else {
      console.log('❌ No qualified operator found for machine 5');
    }
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

fixSlot985();