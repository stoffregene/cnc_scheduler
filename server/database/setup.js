const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

const createTables = async () => {
  try {
    console.log('🔧 Setting up CNC Scheduler database...');

    // Create machine_groups table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS machine_groups (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL UNIQUE,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create machines table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS machines (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        model VARCHAR(100),
        manufacturer VARCHAR(100),
        capabilities TEXT[],
        max_workpiece_size VARCHAR(50),
        spindle_speed_max INTEGER,
        tool_capacity INTEGER,
        status VARCHAR(20) DEFAULT 'active',
        location VARCHAR(100),
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create employees table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS employees (
        id SERIAL PRIMARY KEY,
        employee_id VARCHAR(20) UNIQUE NOT NULL,
        first_name VARCHAR(50) NOT NULL,
        last_name VARCHAR(50) NOT NULL,
        email VARCHAR(100),
        phone VARCHAR(20),
        department VARCHAR(50),
        position VARCHAR(50),
        hire_date DATE,
        shift_type VARCHAR(20) DEFAULT 'day',
        work_days INTEGER[] DEFAULT '{1,2,3,4,5}',
        start_time TIME DEFAULT '08:00:00',
        end_time TIME DEFAULT '17:00:00',
        status VARCHAR(20) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create employee_availability table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS employee_availability (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
        date DATE NOT NULL,
        start_time TIME,
        end_time TIME,
        status VARCHAR(20) DEFAULT 'available',
        reason VARCHAR(100),
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create employee_work_schedules table for per-day schedules
    await pool.query(`
      CREATE TABLE IF NOT EXISTS employee_work_schedules (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
        day_of_week INTEGER NOT NULL CHECK (day_of_week >= 1 AND day_of_week <= 7),
        start_time TIME NOT NULL,
        end_time TIME NOT NULL,
        enabled BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(employee_id, day_of_week)
      );
    `);

    // Create jobs table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS jobs (
        id SERIAL PRIMARY KEY,
        job_number VARCHAR(50) UNIQUE NOT NULL,
        customer_name VARCHAR(100),
        part_name VARCHAR(100),
        part_number VARCHAR(50),
        quantity INTEGER NOT NULL,
        priority INTEGER DEFAULT 5,
        estimated_hours DECIMAL(8,2),
        due_date DATE,
        status VARCHAR(20) DEFAULT 'pending',
        material VARCHAR(50),
        material_size VARCHAR(50),
        operations TEXT[],
        special_instructions TEXT,
        job_boss_data JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create schedules table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS schedules (
        id SERIAL PRIMARY KEY,
        job_id INTEGER REFERENCES jobs(id) ON DELETE CASCADE,
        machine_id INTEGER REFERENCES machines(id),
        employee_id INTEGER REFERENCES employees(id),
        start_time TIMESTAMP,
        end_time TIMESTAMP,
        status VARCHAR(20) DEFAULT 'scheduled',
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create machine_group_assignments table for many-to-many relationship
    await pool.query(`
      CREATE TABLE IF NOT EXISTS machine_group_assignments (
        id SERIAL PRIMARY KEY,
        machine_id INTEGER REFERENCES machines(id) ON DELETE CASCADE,
        machine_group_id INTEGER REFERENCES machine_groups(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(machine_id, machine_group_id)
      );
    `);

    // Create operator_machine_assignments table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS operator_machine_assignments (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
        machine_id INTEGER REFERENCES machines(id) ON DELETE CASCADE,
        proficiency_level VARCHAR(20) DEFAULT 'trained', -- trained, expert, certified
        training_date DATE,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(employee_id, machine_id)
      );
    `);

    // Create indexes for better performance
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
      CREATE INDEX IF NOT EXISTS idx_jobs_due_date ON jobs(due_date);
      CREATE INDEX IF NOT EXISTS idx_machines_status ON machines(status);
      CREATE INDEX IF NOT EXISTS idx_employees_status ON employees(status);
      CREATE INDEX IF NOT EXISTS idx_schedules_start_time ON schedules(start_time);
      CREATE INDEX IF NOT EXISTS idx_schedules_machine_id ON schedules(machine_id);
      CREATE INDEX IF NOT EXISTS idx_machine_group_assignments_machine_id ON machine_group_assignments(machine_id);
      CREATE INDEX IF NOT EXISTS idx_machine_group_assignments_group_id ON machine_group_assignments(machine_group_id);
      CREATE INDEX IF NOT EXISTS idx_operator_machine_assignments_employee_id ON operator_machine_assignments(employee_id);
      CREATE INDEX IF NOT EXISTS idx_operator_machine_assignments_machine_id ON operator_machine_assignments(machine_id);
    `);

    // Insert default machine groups
    await pool.query(`
      INSERT INTO machine_groups (name, description) VALUES
        ('CNC Mills', 'Vertical and horizontal CNC milling machines'),
        ('CNC Lathes', 'CNC turning centers and lathes'),
        ('EDM', 'Electrical Discharge Machining equipment'),
        ('Grinders', 'Surface and cylindrical grinding machines'),
        ('Saws', 'Band saws and cutting equipment')
      ON CONFLICT (name) DO NOTHING;
    `);

    console.log('✅ Database setup completed successfully!');
    console.log('📋 Tables created:');
    console.log('   - machine_groups');
    console.log('   - machines');
    console.log('   - machine_group_assignments');
    console.log('   - employees');
    console.log('   - employee_availability');
    console.log('   - employee_work_schedules');
    console.log('   - operator_machine_assignments');
    console.log('   - jobs');
    console.log('   - schedules');

  } catch (error) {
    console.error('❌ Database setup failed:', error);
    throw error;
  } finally {
    await pool.end();
  }
};

// Run setup if this file is executed directly
if (require.main === module) {
  createTables()
    .then(() => {
      console.log('🎉 CNC Scheduler database is ready!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Setup failed:', error);
      process.exit(1);
    });
}

module.exports = { createTables };
