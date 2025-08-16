const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5732/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function createUndoSystem() {
  try {
    console.log('🔄 Creating undo system database schema...\n');
    
    // Create undo_operations table to track reversible operations
    await pool.query(`
      CREATE TABLE IF NOT EXISTS undo_operations (
        id SERIAL PRIMARY KEY,
        operation_type VARCHAR(50) NOT NULL, -- 'displacement', 'manual_reschedule', 'auto_schedule', 'bulk_schedule'
        operation_description TEXT NOT NULL, -- Human readable description
        user_action TEXT, -- Original user action that triggered this
        created_at TIMESTAMP DEFAULT NOW(),
        expires_at TIMESTAMP DEFAULT (NOW() + INTERVAL '24 hours'), -- Undo operations expire after 24 hours
        is_undone BOOLEAN DEFAULT FALSE,
        undone_at TIMESTAMP NULL,
        metadata JSONB, -- Operation-specific metadata
        
        -- Reference to related operations
        displacement_log_id INTEGER REFERENCES displacement_logs(id),
        
        CONSTRAINT valid_operation_type CHECK (
          operation_type IN ('displacement', 'manual_reschedule', 'auto_schedule', 'bulk_schedule')
        )
      );
    `);
    
    // Create undo_schedule_snapshots table to store schedule state before operations
    await pool.query(`
      CREATE TABLE IF NOT EXISTS undo_schedule_snapshots (
        id SERIAL PRIMARY KEY,
        undo_operation_id INTEGER NOT NULL REFERENCES undo_operations(id) ON DELETE CASCADE,
        job_id INTEGER NOT NULL REFERENCES jobs(id),
        operation_number VARCHAR(10) NOT NULL,
        
        -- Original schedule slot data
        original_slot_id INTEGER, -- Reference to schedule_slots if it existed
        original_machine_id INTEGER REFERENCES machines(id),
        original_employee_id INTEGER REFERENCES employees(id),
        original_start_datetime TIMESTAMP,
        original_end_datetime TIMESTAMP,
        original_duration_minutes INTEGER,
        
        -- Was this slot scheduled before the operation?
        was_scheduled BOOLEAN DEFAULT TRUE,
        
        -- Additional metadata
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    
    // Create indexes for better performance
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_undo_operations_type ON undo_operations(operation_type);
      CREATE INDEX IF NOT EXISTS idx_undo_operations_created ON undo_operations(created_at);
      CREATE INDEX IF NOT EXISTS idx_undo_operations_expires ON undo_operations(expires_at);
      CREATE INDEX IF NOT EXISTS idx_undo_operations_undone ON undo_operations(is_undone);
      CREATE INDEX IF NOT EXISTS idx_undo_snapshots_operation ON undo_schedule_snapshots(undo_operation_id);
      CREATE INDEX IF NOT EXISTS idx_undo_snapshots_job ON undo_schedule_snapshots(job_id);
    `);
    
    // Create a cleanup function to remove expired undo operations
    await pool.query(`
      CREATE OR REPLACE FUNCTION cleanup_expired_undo_operations()
      RETURNS INTEGER AS $$
      DECLARE
        deleted_count INTEGER;
      BEGIN
        DELETE FROM undo_operations 
        WHERE expires_at < NOW() AND is_undone = FALSE;
        
        GET DIAGNOSTICS deleted_count = ROW_COUNT;
        RETURN deleted_count;
      END;
      $$ LANGUAGE plpgsql;
    `);
    
    console.log('✅ Created undo system tables:');
    console.log('   - undo_operations: Tracks reversible operations');
    console.log('   - undo_schedule_snapshots: Stores schedule state before changes');
    console.log('   - cleanup_expired_undo_operations(): Function to clean up expired operations');
    
    // Show current table structure
    const undoOpsResult = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_name = 'undo_operations' 
      ORDER BY ordinal_position
    `);
    
    console.log('\n📋 undo_operations table structure:');
    undoOpsResult.rows.forEach(col => {
      console.log(`   ${col.column_name}: ${col.data_type}${col.is_nullable === 'YES' ? ' (nullable)' : ''}`);
    });
    
    const snapshotsResult = await pool.query(`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'undo_schedule_snapshots' 
      ORDER BY ordinal_position
    `);
    
    console.log('\n📋 undo_schedule_snapshots table structure:');
    snapshotsResult.rows.forEach(col => {
      console.log(`   ${col.column_name}: ${col.data_type}${col.is_nullable === 'YES' ? ' (nullable)' : ''}`);
    });
    
    console.log('\n🎉 Undo system database schema created successfully!');
    console.log('\n💡 Next steps:');
    console.log('   1. Create UndoService for handling undo operations');
    console.log('   2. Integrate with displacement and scheduling services');
    console.log('   3. Add undo UI components to frontend');
    
  } catch (error) {
    console.error('❌ Failed to create undo system:', error.message);
    console.error(error.stack);
  } finally {
    await pool.end();
  }
}

// Run the script
createUndoSystem();