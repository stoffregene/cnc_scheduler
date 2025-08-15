const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const SchedulingService = require('./services/schedulingService');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function testSchedulingFix() {
  try {
    console.log('Testing scheduling fix for decimal hours...\n');
    
    const schedulingService = new SchedulingService(pool);
    
    // Test the working hours first
    const workingHours = await schedulingService.getOperatorWorkingHours(7, '2025-08-13');
    console.log('Chris Johnson working hours:', workingHours);
    
    const startTimeDecimal = parseFloat(workingHours.start_hour);
    const endTimeDecimal = parseFloat(workingHours.end_hour);
    
    console.log(`Start time decimal: ${startTimeDecimal} (${Math.floor(startTimeDecimal)}:${Math.round((startTimeDecimal % 1) * 60).toString().padStart(2, '0')})`);
    console.log(`End time decimal: ${endTimeDecimal} (${Math.floor(endTimeDecimal)}:${Math.round((endTimeDecimal % 1) * 60).toString().padStart(2, '0')})`);
    console.log(`Duration: ${workingHours.duration_hours} hours (${Math.floor(workingHours.duration_hours * 60)} minutes)\n`);
    
    // Test findConsecutiveSlots with a smaller chunk first
    console.log('Testing with a smaller 60-minute operation...');
    const testSlots = await schedulingService.findConsecutiveSlots(
      3, // HMC-002
      7, // Chris Johnson
      60, // 1 hour
      new Date('2025-08-13'),
      null
    );
    
    console.log(`Found ${testSlots.length} available slots for 1-hour operation`);
    if (testSlots.length > 0) {
      console.log('First slot:', testSlots[0]);
    }
    
    // If that works, try a larger operation
    if (testSlots.length > 0) {
      console.log('\nTesting with a 11.5-hour operation (690 minutes)...');
      const largeSlots = await schedulingService.findAvailableSlots(
        3, // HMC-002
        7, // Chris Johnson
        690, // 11.5 hours
        new Date('2025-08-13'),
        null
      );
      
      console.log(`Found ${largeSlots.length} available slots for 11.5-hour operation`);
      if (largeSlots.length > 0) {
        console.log('First slot:', largeSlots[0]);
      }
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

testSchedulingFix();