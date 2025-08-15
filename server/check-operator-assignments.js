const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5732/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function checkOperatorAssignments() {
  try {
    console.log('Current operator-machine assignments and proficiency levels:\n');
    
    const query = `
      SELECT 
        m.name as machine_name,
        e.first_name || ' ' || e.last_name as operator_name,
        oma.proficiency_level,
        oma.notes,
        oma.created_at
      FROM operator_machine_assignments oma
      JOIN machines m ON oma.machine_id = m.id
      JOIN employees e ON oma.employee_id = e.id
      WHERE m.status = 'active' AND e.status = 'active'
      ORDER BY m.name, oma.proficiency_level DESC, e.first_name
    `;
    
    const result = await pool.query(query);
    
    // Group by machine
    const machineOperators = {};
    result.rows.forEach(row => {
      if (!machineOperators[row.machine_name]) {
        machineOperators[row.machine_name] = [];
      }
      machineOperators[row.machine_name].push(row);
    });
    
    Object.keys(machineOperators).forEach(machineName => {
      console.log(`🔧 ${machineName}:`);
      machineOperators[machineName].forEach((op, index) => {
        console.log(`  ${index + 1}. ${op.operator_name} (proficiency: ${op.proficiency_level}) ${op.notes ? '- ' + op.notes : ''}`);
      });
      console.log('');
    });
    
    // Check the operator_machine_assignments table structure
    console.log('Table structure:');
    const schema = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'operator_machine_assignments'
      ORDER BY ordinal_position
    `);
    
    schema.rows.forEach(row => {
      console.log(`  ${row.column_name}: ${row.data_type} (${row.is_nullable === 'YES' ? 'nullable' : 'not null'})`);
    });
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

checkOperatorAssignments();