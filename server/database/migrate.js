const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

const migrate = async () => {
  try {
    console.log('🔧 Running database migration...');

    // Check if machine_group_id column exists
    const columnCheck = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'machines' AND column_name = 'machine_group_id'
    `);

    if (columnCheck.rows.length > 0) {
      console.log('📝 Removing old machine_group_id column from machines table...');
      
      // Remove the foreign key constraint first
      await pool.query(`
        ALTER TABLE machines DROP CONSTRAINT IF EXISTS machines_machine_group_id_fkey
      `);
      
      // Remove the column
      await pool.query(`
        ALTER TABLE machines DROP COLUMN IF EXISTS machine_group_id
      `);
      
      console.log('✅ Successfully removed machine_group_id column');
    } else {
      console.log('ℹ️  machine_group_id column already removed');
    }

    // Drop existing job_routings table if it exists
    console.log('📝 Dropping existing job_routings table...');
    await pool.query('DROP TABLE IF EXISTS job_routings CASCADE');
    
    // Create job_routings table for linking jobs to machines/groups
    console.log('📝 Creating job_routings table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS job_routings (
        id SERIAL PRIMARY KEY,
        job_id INTEGER REFERENCES jobs(id) ON DELETE CASCADE,
        operation_number VARCHAR(10) NOT NULL,
        operation_name VARCHAR(100) NOT NULL,
        machine_id INTEGER REFERENCES machines(id),
        machine_group_id INTEGER REFERENCES machine_groups(id),
        sequence_order INTEGER NOT NULL,
        estimated_hours DECIMAL(8,2) DEFAULT 0,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(job_id, operation_number)
      );
    `);

    // Create indexes for better performance
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_job_routings_job_id ON job_routings(job_id);
      CREATE INDEX IF NOT EXISTS idx_job_routings_sequence ON job_routings(job_id, sequence_order);
      CREATE INDEX IF NOT EXISTS idx_job_routings_machine ON job_routings(machine_id);
      CREATE INDEX IF NOT EXISTS idx_job_routings_group ON job_routings(machine_group_id);
    `);

    console.log('✅ Migration completed successfully!');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await pool.end();
  }
};

// Run migration if this file is executed directly
if (require.main === module) {
  migrate()
    .then(() => {
      console.log('🎉 Database migration completed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Migration failed:', error);
      process.exit(1);
    });
}

module.exports = { migrate };
