const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// TEMPLATE: Update these with actual schedule information
const SCHEDULE_CORRECTIONS = {
  // Day shift operators - PLEASE UPDATE WITH ACTUAL HOURS
  day: {
    start_time: '06:00:00',  // Update this
    end_time: '18:00:00',    // Update this
    custom_start_hour: 6,
    custom_end_hour: 18,
    custom_duration_hours: 12.0
  },
  
  // Night shift operators - PLEASE UPDATE WITH ACTUAL HOURS
  night: {
    start_time: '18:00:00',  // Update this  
    end_time: '06:00:00',    // Update this (next day)
    custom_start_hour: 18,
    custom_end_hour: 6,
    custom_duration_hours: 12.0
  },
  
  // Individual corrections - ADD SPECIFIC EMPLOYEES HERE
  individuals: {
    // Drew Darling (already corrected)
    9: {
      start_time: '04:30:00',
      end_time: '15:00:00',
      custom_start_hour: 4,
      custom_end_hour: 15,
      custom_duration_hours: 10.5
    },
    // Add other specific employees here:
    // employeeId: { start_time: 'HH:MM:SS', end_time: 'HH:MM:SS', ... }
  }
};

async function fixAllSchedules() {
  try {
    console.log('🚨 SCHEDULE CORRECTION TEMPLATE');
    console.log('This script needs to be updated with actual employee hours before running.');
    console.log('Currently showing what WOULD be changed:\n');
    
    // Get all active employees
    const result = await pool.query(`
      SELECT id, first_name, last_name, shift_type, start_time, end_time
      FROM employees 
      WHERE status = 'active'
      ORDER BY shift_type, last_name
    `);
    
    console.log('PROPOSED CHANGES:');
    console.log('==================');
    
    for (const emp of result.rows) {
      let proposedSchedule;
      
      // Check for individual corrections first
      if (SCHEDULE_CORRECTIONS.individuals[emp.id]) {
        proposedSchedule = SCHEDULE_CORRECTIONS.individuals[emp.id];
        console.log(`\n${emp.first_name} ${emp.last_name} (Individual Schedule):`);
      } else if (SCHEDULE_CORRECTIONS[emp.shift_type]) {
        proposedSchedule = SCHEDULE_CORRECTIONS[emp.shift_type];
        console.log(`\n${emp.first_name} ${emp.last_name} (${emp.shift_type} shift):`);
      } else {
        console.log(`\n${emp.first_name} ${emp.last_name} (NO SCHEDULE DEFINED - NEEDS MANUAL UPDATE):`);
        continue;
      }
      
      console.log(`  Current: ${emp.start_time} to ${emp.end_time}`);
      console.log(`  Proposed: ${proposedSchedule.start_time} to ${proposedSchedule.end_time}`);
      console.log(`  Duration: ${proposedSchedule.custom_duration_hours} hours`);
    }
    
    console.log('\n\n📋 TO ACTUALLY APPLY THESE CHANGES:');
    console.log('1. Update the SCHEDULE_CORRECTIONS object with correct hours');
    console.log('2. Change DRY_RUN to false');
    console.log('3. Run the script again');
    
    // Set to false to actually apply changes
    const DRY_RUN = true;
    
    if (!DRY_RUN) {
      console.log('\n🔧 APPLYING CHANGES...');
      // Add actual update logic here when ready
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

fixAllSchedules();