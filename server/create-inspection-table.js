const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5732/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function createInspectionTable() {
  try {
    console.log('🔧 Creating Inspection Queue Table...\n');
    
    // Drop existing table if it exists
    await pool.query('DROP TABLE IF EXISTS inspection_queue CASCADE');
    
    // Create the inspection queue table
    await pool.query(`
      CREATE TABLE inspection_queue (
        id SERIAL PRIMARY KEY,
        job_id INTEGER NOT NULL,
        job_number VARCHAR(50) NOT NULL,
        routing_id INTEGER NOT NULL,
        operation_number INTEGER NOT NULL,
        operation_name VARCHAR(100) NOT NULL,
        customer_name VARCHAR(100),
        priority_score DECIMAL(10,2),
        previous_operation_completed_at TIMESTAMP,
        entered_queue_at TIMESTAMP DEFAULT NOW(),
        inspection_started_at TIMESTAMP,
        inspection_completed_at TIMESTAMP,
        inspector_notes TEXT,
        status VARCHAR(20) DEFAULT 'awaiting' CHECK (status IN ('awaiting', 'in_progress', 'completed', 'hold'))
      )
    `);
    
    console.log('✅ Inspection queue table created');
    
    // Create indexes
    await pool.query('CREATE INDEX idx_inspection_queue_status ON inspection_queue(status)');
    await pool.query('CREATE INDEX idx_inspection_queue_priority ON inspection_queue(priority_score DESC)');
    await pool.query('CREATE INDEX idx_inspection_queue_entered ON inspection_queue(entered_queue_at)');
    
    console.log('✅ Indexes created');
    
    // Create unique constraint
    await pool.query('ALTER TABLE inspection_queue ADD CONSTRAINT unique_job_routing UNIQUE(job_id, routing_id)');
    
    console.log('✅ Unique constraint added');
    
    // Create the inspection dashboard view
    await pool.query(`
      CREATE OR REPLACE VIEW inspection_dashboard AS
      SELECT 
        iq.id,
        iq.job_number,
        iq.operation_number,
        iq.operation_name,
        iq.customer_name,
        iq.priority_score,
        iq.status,
        iq.entered_queue_at,
        iq.inspection_started_at,
        iq.inspection_completed_at,
        iq.inspector_notes,
        EXTRACT(EPOCH FROM (NOW() - iq.entered_queue_at))/3600 as hours_in_queue,
        next_jr.operation_name as next_operation,
        next_m.name as next_machine
      FROM inspection_queue iq
      LEFT JOIN job_routings next_jr ON (
        next_jr.job_id = iq.job_id 
        AND next_jr.sequence_order = (
          SELECT jr.sequence_order + 1 
          FROM job_routings jr 
          WHERE jr.id = iq.routing_id
        )
      )
      LEFT JOIN machines next_m ON next_jr.machine_id = next_m.id
      ORDER BY 
        CASE iq.status 
          WHEN 'in_progress' THEN 1
          WHEN 'awaiting' THEN 2  
          WHEN 'hold' THEN 3
          WHEN 'completed' THEN 4
        END,
        iq.priority_score DESC,
        iq.entered_queue_at ASC
    `);
    
    console.log('✅ Inspection dashboard view created');
    
    // Test the setup
    const testResult = await pool.query(`
      SELECT COUNT(*) as count FROM information_schema.tables 
      WHERE table_name = 'inspection_queue'
    `);
    
    if (testResult.rows[0].count > 0) {
      console.log('✅ Inspection queue table verified');
    }
    
    // Check columns
    const columnsResult = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'inspection_queue'
      ORDER BY ordinal_position
    `);
    
    console.log(`📋 Table created with ${columnsResult.rows.length} columns:`);
    columnsResult.rows.forEach(row => {
      console.log(`   ${row.column_name}: ${row.data_type}`);
    });
    
  } catch (error) {
    console.error('❌ Creation failed:', error.message);
  } finally {
    await pool.end();
  }
}

createInspectionTable();