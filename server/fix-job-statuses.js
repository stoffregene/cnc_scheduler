const { Pool } = require('pg');
require('dotenv').config();

async function fixJobStatuses() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL
  });

  try {
    console.log('🔧 Fixing Job Statuses After Unschedule\n');
    
    // 1. Check current status
    console.log('1. Current job statuses...');
    const statusQuery = `
      SELECT status, COUNT(*) as count 
      FROM jobs 
      GROUP BY status 
      ORDER BY count DESC
    `;
    const currentStatus = await pool.query(statusQuery);
    
    console.log('Before fix:');
    currentStatus.rows.forEach(row => {
      console.log(`  ${row.status}: ${row.count} jobs`);
    });
    
    // 2. Fix jobs that are "scheduled" but have no schedule slots
    console.log('\n2. Fixing jobs with "scheduled" status but no schedule slots...');
    
    const fixQuery = `
      UPDATE jobs 
      SET status = 'pending', 
          auto_scheduled = FALSE,
          updated_at = CURRENT_TIMESTAMP
      WHERE status = 'scheduled' 
      AND id NOT IN (
        SELECT DISTINCT job_id 
        FROM schedule_slots 
        WHERE job_id IS NOT NULL
      )
      RETURNING id, job_number, status
    `;
    
    const fixResult = await pool.query(fixQuery);
    
    console.log(`✅ Fixed ${fixResult.rows.length} jobs - changed from "scheduled" to "pending"`);
    
    if (fixResult.rows.length > 0) {
      console.log('Fixed jobs:');
      fixResult.rows.slice(0, 10).forEach(job => {
        console.log(`  ${job.job_number} → ${job.status}`);
      });
      if (fixResult.rows.length > 10) {
        console.log(`  ... and ${fixResult.rows.length - 10} more`);
      }
    }
    
    // 3. Check status after fix
    console.log('\n3. Job statuses after fix...');
    const afterStatus = await pool.query(statusQuery);
    
    console.log('After fix:');
    afterStatus.rows.forEach(row => {
      console.log(`  ${row.status}: ${row.count} jobs`);
    });
    
    // 4. Check what's now available for scheduling
    console.log('\n4. Jobs now available for auto-scheduling...');
    const availableQuery = `
      SELECT 
        COUNT(*) as total_available
      FROM jobs j
      LEFT JOIN job_routings jr ON j.id = jr.job_id
      WHERE j.status IN ('pending', 'active') 
      AND j.auto_scheduled = FALSE
      AND (j.promised_date IS NOT NULL OR j.due_date IS NOT NULL)
      GROUP BY j.id
    `;
    
    const availableResult = await pool.query(availableQuery);
    const availableCount = availableResult.rows.length;
    
    console.log(`✅ ${availableCount} jobs are now available for scheduling!`);
    
    if (availableCount > 0) {
      // Show a few examples
      const exampleQuery = `
        SELECT 
          j.job_number,
          j.status,
          j.auto_scheduled,
          j.promised_date,
          COUNT(jr.id) as routing_count
        FROM jobs j
        LEFT JOIN job_routings jr ON j.id = jr.job_id
        WHERE j.status IN ('pending', 'active') 
        AND j.auto_scheduled = FALSE
        AND (j.promised_date IS NOT NULL OR j.due_date IS NOT NULL)
        GROUP BY j.id, j.job_number, j.status, j.auto_scheduled, j.promised_date
        HAVING COUNT(jr.id) > 0
        ORDER BY j.job_number
        LIMIT 5
      `;
      
      const examples = await pool.query(exampleQuery);
      console.log('\nExample available jobs:');
      examples.rows.forEach(job => {
        console.log(`  ${job.job_number}: ${job.status}, ${job.routing_count} routings, due ${job.promised_date}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Error fixing job statuses:', error.message);
  } finally {
    await pool.end();
  }
}

fixJobStatuses();