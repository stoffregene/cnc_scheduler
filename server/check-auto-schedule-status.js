const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5732/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function checkAutoScheduleStatus() {
  try {
    console.log('🔍 Checking current auto-schedule status...\n');
    
    // Check job status
    const jobsResult = await pool.query(`
      SELECT 
        status,
        COUNT(*) as count,
        COUNT(*) FILTER (WHERE auto_scheduled = true) as auto_scheduled_count
      FROM jobs
      GROUP BY status
      ORDER BY count DESC
    `);
    
    console.log('📊 Job Status Summary:');
    jobsResult.rows.forEach(row => {
      console.log(`   ${row.status}: ${row.count} jobs (${row.auto_scheduled_count} auto-scheduled)`);
    });
    
    // Check schedule slots
    const slotsResult = await pool.query(`
      SELECT COUNT(*) as total_slots
      FROM schedule_slots
    `);
    
    console.log(`\n⏰ Schedule Slots: ${slotsResult.rows[0].total_slots}`);
    
    // Check inspection queue
    const inspectionResult = await pool.query(`
      SELECT COUNT(*) as total_items
      FROM inspection_queue
    `);
    
    console.log(`🔍 Inspection Queue: ${inspectionResult.rows[0].total_items} items`);
    
    // Check for any recent scheduling activity
    const recentSlotsResult = await pool.query(`
      SELECT 
        COUNT(*) as recent_slots,
        MIN(start_time) as earliest_slot,
        MAX(start_time) as latest_slot
      FROM schedule_slots
      WHERE start_time > CURRENT_DATE
    `);
    
    if (recentSlotsResult.rows[0].recent_slots > 0) {
      console.log(`\n📅 Recent Scheduling Activity:`);
      console.log(`   Slots created: ${recentSlotsResult.rows[0].recent_slots}`);
      console.log(`   Date range: ${recentSlotsResult.rows[0].earliest_slot} to ${recentSlotsResult.rows[0].latest_slot}`);
    }
    
    // Sample some scheduled jobs
    const scheduledJobsResult = await pool.query(`
      SELECT j.job_number, j.customer_name, j.status, j.auto_scheduled,
             COUNT(ss.id) as scheduled_operations
      FROM jobs j
      LEFT JOIN schedule_slots ss ON j.id = ss.job_id
      WHERE j.auto_scheduled = true OR j.status = 'scheduled'
      GROUP BY j.id, j.job_number, j.customer_name, j.status, j.auto_scheduled
      ORDER BY j.job_number
      LIMIT 10
    `);
    
    if (scheduledJobsResult.rows.length > 0) {
      console.log(`\n📋 Sample Scheduled Jobs (first 10):`);
      scheduledJobsResult.rows.forEach(job => {
        console.log(`   ${job.job_number} (${job.customer_name}): ${job.scheduled_operations} ops scheduled`);
      });
    } else {
      console.log(`\n📋 No jobs appear to be scheduled yet.`);
    }
    
  } catch (error) {
    console.error('Error checking status:', error);
  } finally {
    await pool.end();
  }
}

checkAutoScheduleStatus();