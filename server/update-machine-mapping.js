const { Pool } = require('pg');
require('dotenv').config();

async function updateMachineMapping() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL
  });

  try {
    console.log('🔧 Updating Machine Names and Adding Missing Machines\n');
    
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // 1. Update existing machine names to match your actual machines
      console.log('1. Updating existing machine names...');
      console.log('='.repeat(80));
      
      const updates = [
        { old_name: 'LATHE-001', new_name: 'LATHE-001', model: 'Mori-Seiki SL204' },
        { old_name: 'LATHE-002', new_name: 'LATHE-002', model: 'Haas DS30Y' },
        { old_name: 'LATHE-003', new_name: 'LATHE-003', model: 'Femco HL-25' }
      ];
      
      for (const update of updates) {
        const result = await client.query(`
          UPDATE machines 
          SET model = $1, updated_at = CURRENT_TIMESTAMP
          WHERE name = $2
          RETURNING name, model
        `, [update.model, update.old_name]);
        
        if (result.rows.length > 0) {
          console.log(`✅ Updated ${update.old_name} model to: ${update.model}`);
        }
      }
      
      // 2. Add missing machines
      console.log('\n2. Adding missing machines...');
      console.log('='.repeat(80));
      
      const newMachines = [
        { name: 'VMC-002', model: 'Fadal 4020', capabilities: ['Milling', 'Drilling', 'Tapping'] },
        { name: 'VMC-003', model: 'Yama-Seiki BM1200', capabilities: ['Milling', 'Drilling', 'Tapping'] },
        { name: 'VMC-004', model: 'Hwacheon Vesta 1050B', capabilities: ['Milling', 'Drilling', 'Tapping'] },
        { name: 'VMC-005', model: 'Mori-Seiki MV-Junior', capabilities: ['Milling', 'Drilling', 'Tapping'] },
        { name: 'LATHE-004', model: 'Haas ST30Y', capabilities: ['Turning', 'Drilling', 'Tapping', 'Threading', 'Boring'] },
        { name: 'LATHE-005', model: 'Mori-Seiki SL-25 (Blue)', capabilities: ['Turning', 'Drilling', 'Tapping', 'Threading'] },
        { name: 'LATHE-006', model: 'Mori-Seiki SL-25 (Gray)', capabilities: ['Turning', 'Drilling', 'Tapping', 'Threading'] },
        { name: 'BLAST-001', model: 'Bead Blasting Station', capabilities: ['Surface Finishing'] },
        { name: 'TUMBLE-001', model: 'Tumbling Station', capabilities: ['Deburring', 'Surface Finishing'] },
        { name: 'ASSEMBLE-001', model: 'Assembly Bay', capabilities: ['Assembly'] },
        { name: 'BENDING-001', model: 'Brake Press Station', capabilities: ['Bending', 'Forming'] },
        { name: 'DEBURR-001', model: 'Deburring Station', capabilities: ['Deburring', 'Finishing'] }
      ];
      
      for (const machine of newMachines) {
        // Check if machine already exists
        const existingCheck = await client.query('SELECT id FROM machines WHERE name = $1', [machine.name]);
        
        if (existingCheck.rows.length === 0) {
          const result = await client.query(`
            INSERT INTO machines (name, model, status, capabilities, efficiency_modifier)
            VALUES ($1, $2, 'active', $3, 1.00)
            RETURNING id, name, model
          `, [machine.name, machine.model, machine.capabilities]);
          
          console.log(`✅ Added ${machine.name}: ${machine.model}`);
        } else {
          console.log(`⚠️  ${machine.name} already exists, skipping`);
        }
      }
      
      // 3. Create CSV workcenter mapping
      console.log('\n3. Creating workcenter mapping for JobBoss parser...');
      console.log('='.repeat(80));
      
      const workcenterMapping = {
        // Exact matches (already work)
        'INSPECT-001': 'INSPECT-001',
        'VMC-001': 'VMC-001',
        'LATHE-001': 'LATHE-001',
        'LATHE-002': 'LATHE-002', 
        'LATHE-003': 'LATHE-003',
        'INSPECT': 'INSPECT-001',
        
        // New mappings
        'VMC-002': 'VMC-002',
        'VMC-003': 'VMC-003',
        'VMC-004': 'VMC-004',
        'VMC-005': 'VMC-005',
        'LATHE-004': 'LATHE-004',
        'LATHE-006': 'LATHE-006',
        'BLAST-001': 'BLAST-001',
        'TUMBLE-001': 'TUMBLE-001',
        'ASSEMBLE-001': 'ASSEMBLE-001',
        'BENDING-001': 'BENDING-001',
        'DEBURR-001': 'DEBURR-001',
        
        // Generic names - map to first available
        'HMC': 'HMC-001',  // Could also be HMC-002
        'SAW': 'SAW-001'   // Could also be SAW-002
      };
      
      console.log('Workcenter mapping created:');
      Object.entries(workcenterMapping).forEach(([csv, machine]) => {
        console.log(`  "${csv}" → ${machine}`);
      });
      
      // 4. Update job routings to use correct machine IDs
      console.log('\n4. Updating job routings with correct machine assignments...');
      console.log('='.repeat(80));
      
      let routingsUpdated = 0;
      for (const [csvName, machineName] of Object.entries(workcenterMapping)) {
        // Get machine ID
        const machineResult = await client.query('SELECT id FROM machines WHERE name = $1', [machineName]);
        
        if (machineResult.rows.length > 0) {
          const machineId = machineResult.rows[0].id;
          
          // Update routings that match this CSV name
          const updateResult = await client.query(`
            UPDATE job_routings 
            SET machine_id = $1, updated_at = CURRENT_TIMESTAMP
            WHERE operation_name = $2 AND machine_id IS NULL
            RETURNING id
          `, [machineId, csvName]);
          
          if (updateResult.rows.length > 0) {
            console.log(`✅ Updated ${updateResult.rows.length} routings: "${csvName}" → ${machineName} (ID: ${machineId})`);
            routingsUpdated += updateResult.rows.length;
          }
        }
      }
      
      await client.query('COMMIT');
      
      console.log('\n📊 Summary:');
      console.log('='.repeat(80));
      console.log(`✅ Updated machine models for existing machines`);
      console.log(`✅ Added ${newMachines.length} new machines`);
      console.log(`✅ Created mapping for ${Object.keys(workcenterMapping).length} workcenters`);
      console.log(`✅ Updated ${routingsUpdated} routing assignments`);
      
      // 5. Show final machine list
      console.log('\n🔧 Final Machine List:');
      console.log('='.repeat(80));
      
      const finalMachines = await client.query(`
        SELECT name, model, status, efficiency_modifier, 
               array_to_string(capabilities, ', ') as capabilities
        FROM machines 
        ORDER BY name
      `);
      
      finalMachines.rows.forEach((machine, index) => {
        console.log(`${(index + 1).toString().padStart(2)}. ${machine.name.padEnd(15)} | ${machine.model.padEnd(25)} | ${machine.status} | ${machine.efficiency_modifier}x`);
      });
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    
  } catch (error) {
    console.error('❌ Error updating machine mapping:', error.message);
    console.error('Error stack:', error.stack);
  } finally {
    await pool.end();
  }
}

updateMachineMapping();