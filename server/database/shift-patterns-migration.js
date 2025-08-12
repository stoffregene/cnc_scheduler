const { Pool } = require('pg');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function addShiftPatterns() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    console.log('🔄 Adding shift pattern support to scheduling system...');
    
    // 1. Create shift_patterns table
    await client.query(`
      CREATE TABLE IF NOT EXISTS shift_patterns (
        id SERIAL PRIMARY KEY,
        pattern_name VARCHAR(50) NOT NULL UNIQUE,
        start_hour INTEGER NOT NULL CHECK (start_hour >= 0 AND start_hour <= 23),
        end_hour INTEGER NOT NULL CHECK (end_hour >= 0 AND end_hour <= 23),
        duration_hours DECIMAL(4,2) NOT NULL CHECK (duration_hours > 0),
        is_overnight BOOLEAN NOT NULL DEFAULT false,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ Created shift_patterns table');
    
    // 2. Add shift_pattern_id to employees table
    await client.query(`
      ALTER TABLE employees 
      ADD COLUMN IF NOT EXISTS shift_pattern_id INTEGER REFERENCES shift_patterns(id),
      ADD COLUMN IF NOT EXISTS custom_start_hour INTEGER CHECK (custom_start_hour >= 0 AND custom_start_hour <= 23),
      ADD COLUMN IF NOT EXISTS custom_end_hour INTEGER CHECK (custom_end_hour >= 0 AND custom_end_hour <= 23),
      ADD COLUMN IF NOT EXISTS custom_duration_hours DECIMAL(4,2) CHECK (custom_duration_hours > 0);
    `);
    console.log('✅ Added shift pattern columns to employees table');
    
    // 3. Insert standard shift patterns
    await client.query(`
      INSERT INTO shift_patterns (pattern_name, start_hour, end_hour, duration_hours, is_overnight, description) VALUES
      ('Day Shift', 6, 18, 12.0, false, 'Standard day shift: 6 AM to 6 PM'),
      ('Night Shift', 18, 6, 12.0, true, 'Standard night shift: 6 PM to 6 AM (overnight)'),
      ('Swing Shift', 14, 22, 8.0, false, 'Afternoon/evening shift: 2 PM to 10 PM'),
      ('Early Day', 5, 17, 12.0, false, 'Early day shift: 5 AM to 5 PM'),
      ('Extended Day', 6, 22, 16.0, false, 'Extended day shift: 6 AM to 10 PM'),
      ('Split Shift', 6, 14, 8.0, false, 'Morning shift: 6 AM to 2 PM'),
      ('Late Split', 14, 22, 8.0, false, 'Afternoon shift: 2 PM to 10 PM')
      ON CONFLICT (pattern_name) DO NOTHING;
    `);
    console.log('✅ Inserted standard shift patterns');
    
    // 4. Create employee_shift_schedule table for complex scheduling
    await client.query(`
      CREATE TABLE IF NOT EXISTS employee_shift_schedule (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6), -- 0=Sunday, 6=Saturday
        start_hour INTEGER NOT NULL CHECK (start_hour >= 0 AND start_hour <= 23),
        end_hour INTEGER NOT NULL CHECK (end_hour >= 0 AND end_hour <= 23),
        duration_hours DECIMAL(4,2) NOT NULL CHECK (duration_hours > 0),
        is_overnight BOOLEAN NOT NULL DEFAULT false,
        is_working_day BOOLEAN NOT NULL DEFAULT true,
        effective_date DATE DEFAULT CURRENT_DATE,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(employee_id, day_of_week, effective_date)
      );
    `);
    console.log('✅ Created employee_shift_schedule table for complex scheduling');
    
    // 5. Update existing employees with default day shift pattern
    const dayShiftResult = await client.query("SELECT id FROM shift_patterns WHERE pattern_name = 'Day Shift'");
    const dayShiftId = dayShiftResult.rows[0].id;
    
    await client.query(`
      UPDATE employees 
      SET shift_pattern_id = $1,
          updated_at = CURRENT_TIMESTAMP
      WHERE shift_pattern_id IS NULL AND status = 'active';
    `, [dayShiftId]);
    console.log('✅ Assigned default day shift pattern to existing active employees');
    
    // 6. Create helper function to get employee working hours
    await client.query(`
      CREATE OR REPLACE FUNCTION get_employee_working_hours(
        emp_id INTEGER,
        target_date DATE DEFAULT CURRENT_DATE
      ) RETURNS TABLE (
        start_hour INTEGER,
        end_hour INTEGER,
        duration_hours DECIMAL,
        is_overnight BOOLEAN,
        is_working_day BOOLEAN
      ) AS $$
      BEGIN
        -- First check for custom schedule on specific day
        RETURN QUERY
        SELECT 
          ess.start_hour,
          ess.end_hour,
          ess.duration_hours,
          ess.is_overnight,
          ess.is_working_day
        FROM employee_shift_schedule ess
        WHERE ess.employee_id = emp_id 
          AND ess.day_of_week = EXTRACT(dow FROM target_date)
          AND ess.effective_date <= target_date
        ORDER BY ess.effective_date DESC
        LIMIT 1;
        
        -- If no custom schedule, check for employee custom hours
        IF NOT FOUND THEN
          RETURN QUERY
          SELECT 
            COALESCE(e.custom_start_hour, sp.start_hour) as start_hour,
            COALESCE(e.custom_end_hour, sp.end_hour) as end_hour,
            COALESCE(e.custom_duration_hours, sp.duration_hours) as duration_hours,
            sp.is_overnight,
            (EXTRACT(dow FROM target_date) BETWEEN 1 AND 5) as is_working_day -- Mon-Fri default
          FROM employees e
          LEFT JOIN shift_patterns sp ON e.shift_pattern_id = sp.id
          WHERE e.id = emp_id;
        END IF;
      END;
      $$ LANGUAGE plpgsql;
    `);
    console.log('✅ Created get_employee_working_hours helper function');
    
    // 7. Create index for performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_employee_shift_schedule_lookup 
      ON employee_shift_schedule(employee_id, day_of_week, effective_date DESC);
    `);
    console.log('✅ Created performance indexes');
    
    await client.query('COMMIT');
    console.log('🎉 Shift pattern migration completed successfully!');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error during shift pattern migration:', error);
    throw error;
  } finally {
    client.release();
  }
}

async function main() {
  try {
    await addShiftPatterns();
    console.log('✅ Shift pattern support added to CNC Scheduler!');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  main();
}

module.exports = { addShiftPatterns };