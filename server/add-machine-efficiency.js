const { Pool } = require('pg');
require('dotenv').config();

async function addMachineEfficiency() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL
  });

  try {
    console.log('Adding efficiency_modifier column to machines table...');
    
    await pool.query(`
      ALTER TABLE machines 
      ADD COLUMN IF NOT EXISTS efficiency_modifier DECIMAL(3,2) DEFAULT 1.00 
      CHECK (efficiency_modifier > 0 AND efficiency_modifier <= 2.00)
    `);
    
    console.log('✅ Successfully added efficiency_modifier column');
    console.log('   - Default value: 1.00 (normal efficiency)');
    console.log('   - Range: 0.01 to 2.00 (1% to 200% efficiency)');
    console.log('   - Higher values = more efficient machines');
    
    // Set some example values for existing machines
    const machinesResult = await pool.query('SELECT id, name FROM machines LIMIT 5');
    console.log('\n📊 Setting example efficiency modifiers:');
    
    for (const machine of machinesResult.rows) {
      // Random efficiency between 0.8 and 1.2 for demo
      const efficiency = (0.8 + Math.random() * 0.4).toFixed(2);
      await pool.query('UPDATE machines SET efficiency_modifier = $1 WHERE id = $2', [efficiency, machine.id]);
      console.log(`   - ${machine.name}: ${efficiency}x efficiency`);
    }
    
  } catch (error) {
    if (error.code === '42701') {
      console.log('✅ Column already exists, skipping...');
    } else {
      console.error('❌ Error adding efficiency_modifier column:', error.message);
    }
  } finally {
    await pool.end();
  }
}

addMachineEfficiency();