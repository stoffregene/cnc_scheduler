const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function createDisplacementTables() {
  try {
    const client = await pool.connect();
    
    console.log('🔨 Creating displacement tables...\n');
    
    // Create displacement_logs table
    await client.query(`
      CREATE TABLE IF NOT EXISTS displacement_logs (
        id SERIAL PRIMARY KEY,
        trigger_job_id INTEGER REFERENCES jobs(id) ON DELETE CASCADE,
        trigger_job_number VARCHAR(50),
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        success BOOLEAN DEFAULT false,
        total_displaced INTEGER DEFAULT 0,
        total_rescheduled INTEGER DEFAULT 0,
        execution_time_ms INTEGER,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Created displacement_logs table');
    
    // Create displacement_details table for individual job displacements
    await client.query(`
      CREATE TABLE IF NOT EXISTS displacement_details (
        id SERIAL PRIMARY KEY,
        displacement_log_id INTEGER REFERENCES displacement_logs(id) ON DELETE CASCADE,
        displaced_job_id INTEGER REFERENCES jobs(id) ON DELETE CASCADE,
        displaced_job_number VARCHAR(50),
        original_start_time TIMESTAMP,
        original_end_time TIMESTAMP,
        machine_id INTEGER REFERENCES machines(id),
        machine_name VARCHAR(100),
        displacement_reason TEXT,
        hours_freed DECIMAL(10,2),
        reschedule_status VARCHAR(50) DEFAULT 'pending',
        new_start_time TIMESTAMP,
        new_end_time TIMESTAMP,
        reschedule_delay_hours DECIMAL(10,2),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Created displacement_details table');
    
    // Create displacement_impact table for tracking business impact
    await client.query(`
      CREATE TABLE IF NOT EXISTS displacement_impact (
        id SERIAL PRIMARY KEY,
        displacement_log_id INTEGER REFERENCES displacement_logs(id) ON DELETE CASCADE,
        customers_affected TEXT[], -- Array of customer names
        machines_affected TEXT[], -- Array of machine names
        total_hours_displaced DECIMAL(10,2),
        average_delay_days DECIMAL(5,2),
        priority_threshold_used DECIMAL(5,4),
        firm_zone_violations INTEGER DEFAULT 0,
        locked_job_attempts INTEGER DEFAULT 0,
        cost_impact DECIMAL(12,2), -- Future: estimated cost impact
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Created displacement_impact table');
    
    // Create indexes for performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_displacement_logs_trigger_job 
      ON displacement_logs(trigger_job_id)
    `);
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_displacement_logs_timestamp 
      ON displacement_logs(timestamp)
    `);
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_displacement_details_displaced_job 
      ON displacement_details(displaced_job_id)
    `);
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_displacement_details_log 
      ON displacement_details(displacement_log_id)
    `);
    
    console.log('✅ Created indexes');
    
    console.log('\n🎉 Displacement tables created successfully!');
    
    client.release();
  } catch (error) {
    console.error('❌ Error creating displacement tables:', error.message);
  } finally {
    await pool.end();
  }
}

createDisplacementTables();