const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const SchedulingService = require('./services/schedulingService');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5732/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function testJobScheduling() {
  try {
    console.log('Testing complete job scheduling...\n');
    
    const schedulingService = new SchedulingService(pool);
    
    // Try to schedule job 1 (the one that was failing)
    console.log('Attempting to schedule job 1...');
    const result = await schedulingService.scheduleJob(1, true); // force reschedule
    
    console.log('Scheduling result:', JSON.stringify(result, null, 2));
    
  } catch (error) {
    console.error('Scheduling failed:', error.message);
    console.error('Full error:', error);
  } finally {
    await pool.end();
  }
}

testJobScheduling();