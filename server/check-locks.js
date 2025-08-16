const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function checkLocks() {
  try {
    // Check for locked jobs
    const result = await pool.query(`
      SELECT 
        j.job_number, 
        j.schedule_locked, 
        j.lock_reason,
        COUNT(ss.id) as locked_slots
      FROM jobs j
      LEFT JOIN schedule_slots ss ON j.id = ss.job_id AND ss.locked = true
      WHERE j.schedule_locked = true OR ss.locked = true
      GROUP BY j.id, j.job_number, j.schedule_locked, j.lock_reason
      ORDER BY j.job_number
    `);
    
    console.log('🔒 Locked Jobs and Operations:');
    console.log('============================');
    if (result.rows.length === 0) {
      console.log('No locked jobs or operations found');
      
      // Let's also check all jobs for lock-related fields
      const allJobs = await pool.query(`
        SELECT job_number, schedule_locked, lock_reason 
        FROM jobs 
        ORDER BY job_number
        LIMIT 5
      `);
      
      console.log('\nSample job lock status:');
      allJobs.rows.forEach(job => {
        console.log(`- ${job.job_number}: locked=${job.schedule_locked || false}, reason='${job.lock_reason || 'None'}'`);
      });
      
    } else {
      result.rows.forEach(row => {
        console.log(`Job ${row.job_number}: Job Locked=${row.schedule_locked}, Reason='${row.lock_reason || 'None'}', Locked Slots=${row.locked_slots}`);
      });
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkLocks();