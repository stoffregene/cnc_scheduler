const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

const migrateScheduling = async () => {
  try {
    console.log('🔧 Running scheduling system database migration...');

    // Create machine group hierarchy table for tiers and parent-child relationships
    console.log('📝 Creating machine group hierarchy...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS machine_group_hierarchy (
        id SERIAL PRIMARY KEY,
        parent_group_id INTEGER REFERENCES machine_groups(id) ON DELETE CASCADE,
        child_group_id INTEGER REFERENCES machine_groups(id) ON DELETE CASCADE,
        tier_level INTEGER DEFAULT 1,
        substitution_allowed BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(parent_group_id, child_group_id)
      );
    `);

    // Add tier and priority columns to machine_groups
    console.log('📝 Enhancing machine groups table...');
    await pool.query(`
      ALTER TABLE machine_groups 
      ADD COLUMN IF NOT EXISTS tier_level INTEGER DEFAULT 1,
      ADD COLUMN IF NOT EXISTS parent_group_id INTEGER REFERENCES machine_groups(id),
      ADD COLUMN IF NOT EXISTS substitution_priority INTEGER DEFAULT 100;
    `);

    // Create customer frequency tracking table
    console.log('📝 Creating customer frequency tracking...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS customer_metrics (
        id SERIAL PRIMARY KEY,
        customer_name VARCHAR(100) NOT NULL UNIQUE,
        job_count INTEGER DEFAULT 0,
        total_value DECIMAL(12,2) DEFAULT 0,
        avg_job_value DECIMAL(10,2) DEFAULT 0,
        frequency_score DECIMAL(5,2) DEFAULT 0,
        priority_weight INTEGER DEFAULT 100,
        last_job_date DATE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Enhance jobs table with scheduling fields
    console.log('📝 Enhancing jobs table for scheduling...');
    await pool.query(`
      ALTER TABLE jobs 
      ADD COLUMN IF NOT EXISTS promised_date DATE,
      ADD COLUMN IF NOT EXISTS start_date DATE,
      ADD COLUMN IF NOT EXISTS completion_date DATE,
      ADD COLUMN IF NOT EXISTS lead_time_days INTEGER DEFAULT 28,
      ADD COLUMN IF NOT EXISTS priority_score DECIMAL(8,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS customer_priority_weight INTEGER DEFAULT 100,
      ADD COLUMN IF NOT EXISTS auto_scheduled BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS schedule_locked BOOLEAN DEFAULT false;
    `);

    // Create enhanced scheduling table with 15-minute granularity
    console.log('📝 Creating enhanced scheduling table...');
    await pool.query(`
      DROP TABLE IF EXISTS schedule_slots CASCADE;
      CREATE TABLE schedule_slots (
        id SERIAL PRIMARY KEY,
        job_id INTEGER REFERENCES jobs(id) ON DELETE CASCADE,
        job_routing_id INTEGER REFERENCES job_routings(id) ON DELETE CASCADE,
        machine_id INTEGER REFERENCES machines(id),
        employee_id INTEGER REFERENCES employees(id),
        start_datetime TIMESTAMP NOT NULL,
        end_datetime TIMESTAMP NOT NULL,
        duration_minutes INTEGER NOT NULL,
        slot_date DATE NOT NULL,
        time_slot INTEGER NOT NULL, -- 15-minute slots: 0-95 (24 hours * 4)
        status VARCHAR(20) DEFAULT 'scheduled',
        scheduling_method VARCHAR(20) DEFAULT 'auto', -- 'auto', 'manual', 'override'
        priority_score DECIMAL(8,2),
        sequence_order INTEGER,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create employee time-off table
    console.log('📝 Creating employee time-off tracking...');
    await pool.query(`
      ALTER TABLE employee_availability
      ADD COLUMN IF NOT EXISTS time_off_type VARCHAR(50),
      ADD COLUMN IF NOT EXISTS affects_scheduling BOOLEAN DEFAULT true,
      ADD COLUMN IF NOT EXISTS auto_reschedule BOOLEAN DEFAULT true;
    `);

    // Create scheduling conflicts log
    console.log('📝 Creating scheduling conflicts log...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS scheduling_conflicts (
        id SERIAL PRIMARY KEY,
        conflict_type VARCHAR(50) NOT NULL,
        job_id INTEGER REFERENCES jobs(id),
        machine_id INTEGER REFERENCES machines(id),
        employee_id INTEGER REFERENCES employees(id),
        conflict_datetime TIMESTAMP,
        description TEXT,
        resolution VARCHAR(100),
        resolved BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create scheduling parameters table
    console.log('📝 Creating scheduling parameters...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS scheduling_parameters (
        id SERIAL PRIMARY KEY,
        parameter_name VARCHAR(50) UNIQUE NOT NULL,
        parameter_value TEXT NOT NULL,
        description TEXT,
        last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Insert default scheduling parameters
    await pool.query(`
      INSERT INTO scheduling_parameters (parameter_name, parameter_value, description) VALUES
        ('default_lead_time_days', '28', 'Default lead time for backward scheduling'),
        ('time_slot_minutes', '15', 'Time slot granularity in minutes'),
        ('auto_schedule_enabled', 'true', 'Enable automatic scheduling'),
        ('overdue_priority_boost', '1000', 'Priority score boost for overdue jobs'),
        ('customer_frequency_weight', '0.5', 'Weight factor for customer frequency in priority calculation')
      ON CONFLICT (parameter_name) DO NOTHING;
    `);

    // Create indexes for performance
    console.log('📝 Creating indexes...');
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_schedule_slots_datetime ON schedule_slots(start_datetime, end_datetime);
      CREATE INDEX IF NOT EXISTS idx_schedule_slots_machine_date ON schedule_slots(machine_id, slot_date);
      CREATE INDEX IF NOT EXISTS idx_schedule_slots_employee_date ON schedule_slots(employee_id, slot_date);
      CREATE INDEX IF NOT EXISTS idx_schedule_slots_job_sequence ON schedule_slots(job_id, sequence_order);
      CREATE INDEX IF NOT EXISTS idx_jobs_priority_score ON jobs(priority_score DESC);
      CREATE INDEX IF NOT EXISTS idx_jobs_promised_date ON jobs(promised_date);
      CREATE INDEX IF NOT EXISTS idx_jobs_status_scheduled ON jobs(status) WHERE status IN ('pending', 'scheduled');
      CREATE INDEX IF NOT EXISTS idx_customer_metrics_priority ON customer_metrics(priority_weight DESC);
    `);

    // Create function to calculate time slots from datetime
    console.log('📝 Creating utility functions...');
    await pool.query(`
      CREATE OR REPLACE FUNCTION calculate_time_slot(input_time TIMESTAMP)
      RETURNS INTEGER AS $$
      BEGIN
        RETURN (EXTRACT(HOUR FROM input_time) * 4 + EXTRACT(MINUTE FROM input_time) / 15)::INTEGER;
      END;
      $$ LANGUAGE plpgsql;
    `);

    // Create function to update customer metrics
    await pool.query(`
      CREATE OR REPLACE FUNCTION update_customer_metrics()
      RETURNS TRIGGER AS $$
      BEGIN
        INSERT INTO customer_metrics (customer_name, job_count, last_job_date)
        VALUES (NEW.customer_name, 1, NEW.created_at::DATE)
        ON CONFLICT (customer_name) DO UPDATE SET
          job_count = customer_metrics.job_count + 1,
          last_job_date = NEW.created_at::DATE,
          frequency_score = CASE 
            WHEN (CURRENT_DATE - customer_metrics.last_job_date) < 30 THEN customer_metrics.frequency_score + 10
            WHEN (CURRENT_DATE - customer_metrics.last_job_date) < 90 THEN customer_metrics.frequency_score + 5
            ELSE customer_metrics.frequency_score + 1
          END,
          updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    // Create trigger to update customer metrics on job insert
    await pool.query(`
      DROP TRIGGER IF EXISTS trigger_update_customer_metrics ON jobs;
      CREATE TRIGGER trigger_update_customer_metrics
        AFTER INSERT ON jobs
        FOR EACH ROW
        EXECUTE FUNCTION update_customer_metrics();
    `);

    console.log('✅ Scheduling system migration completed successfully!');
    console.log('📋 New tables and enhancements created:');
    console.log('   - machine_group_hierarchy (machine tier system)');
    console.log('   - customer_metrics (frequency tracking)');
    console.log('   - schedule_slots (15-minute granularity scheduling)');
    console.log('   - scheduling_conflicts (conflict tracking)');
    console.log('   - scheduling_parameters (system configuration)');
    console.log('   - Enhanced jobs table (scheduling fields)');
    console.log('   - Enhanced employee_availability (time-off handling)');

  } catch (error) {
    console.error('❌ Scheduling migration failed:', error);
    throw error;
  } finally {
    await pool.end();
  }
};

// Run migration if this file is executed directly
if (require.main === module) {
  migrateScheduling()
    .then(() => {
      console.log('🎉 Scheduling system database is ready!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Migration failed:', error);
      process.exit(1);
    });
}

module.exports = { migrateScheduling };