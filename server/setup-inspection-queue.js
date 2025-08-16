const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5732/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function setupInspectionQueue() {
  try {
    console.log('🔧 Setting up Inspection Queue System...\n');
    
    // Read and execute the SQL file
    const sqlPath = path.join(__dirname, 'create-inspection-queue.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    // Split SQL into individual statements and execute them
    const statements = sql.split(';').filter(stmt => stmt.trim().length > 0);
    
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i].trim();
      if (statement) {
        try {
          console.log(`Executing statement ${i + 1}/${statements.length}...`);
          await pool.query(statement);
        } catch (error) {
          // Some statements might fail due to existing objects, that's OK
          if (error.message.includes('already exists')) {
            console.log(`  ℹ️ Object already exists, skipping...`);
          } else {
            console.log(`  ⚠️ Statement failed: ${error.message}`);
          }
        }
      }
    }
    
    console.log('\n✅ Inspection queue system setup completed!');
    
    // Test the setup
    console.log('\n🧪 Testing the setup...');
    
    const testResult = await pool.query(`
      SELECT table_name, column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'inspection_queue'
      ORDER BY ordinal_position
    `);
    
    console.log(`📋 Inspection queue table created with ${testResult.rows.length} columns:`);
    testResult.rows.forEach(row => {
      console.log(`   ${row.column_name}: ${row.data_type}`);
    });
    
    // Check if view was created
    const viewResult = await pool.query(`
      SELECT table_name 
      FROM information_schema.views 
      WHERE table_name = 'inspection_dashboard'
    `);
    
    if (viewResult.rows.length > 0) {
      console.log('✅ Inspection dashboard view created successfully');
    } else {
      console.log('❌ Inspection dashboard view not found');
    }
    
  } catch (error) {
    console.error('❌ Setup failed:', error.message);
  } finally {
    await pool.end();
  }
}

setupInspectionQueue();