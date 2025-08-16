const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function testSimpleSchedule() {
  try {
    console.log('🚀 Testing basic scheduling functionality...\n');
    
    const client = await pool.connect();
    
    // Get job statistics
    const stats = await client.query(`
      SELECT 
        COUNT(*) as total_jobs,
        COUNT(CASE WHEN priority_score >= 200 THEN 1 END) as high_priority,
        COUNT(CASE WHEN has_outsourcing = true THEN 1 END) as outsourced,
        COUNT(CASE WHEN is_expedite = true THEN 1 END) as expedite
      FROM jobs
      WHERE status != 'completed'
    `);
    
    console.log('📊 Job Overview:');
    console.log(`   Total jobs: ${stats.rows[0].total_jobs}`);
    console.log(`   High priority (score >= 200): ${stats.rows[0].high_priority}`);
    console.log(`   Outsourced jobs: ${stats.rows[0].outsourced}`);
    console.log(`   Expedite jobs: ${stats.rows[0].expedite}`);
    
    // Check routing statistics
    const routingStats = await client.query(`
      SELECT 
        COUNT(*) as total_routings,
        COUNT(DISTINCT job_id) as jobs_with_routings,
        COUNT(CASE WHEN is_outsourced = true THEN 1 END) as outsourced_ops,
        AVG(estimated_hours) as avg_hours
      FROM job_routings
    `);
    
    console.log('\n⚙️ Routing Overview:');
    console.log(`   Total operations: ${routingStats.rows[0].total_routings}`);
    console.log(`   Jobs with routings: ${routingStats.rows[0].jobs_with_routings}`);
    console.log(`   Outsourced operations: ${routingStats.rows[0].outsourced_ops}`);
    console.log(`   Average operation hours: ${parseFloat(routingStats.rows[0].avg_hours).toFixed(2)}`);
    
    // Check schedule slots
    const scheduleStats = await client.query(`
      SELECT 
        COUNT(DISTINCT job_id) as scheduled_jobs,
        COUNT(*) as total_slots,
        MIN(start_datetime) as earliest_start,
        MAX(end_datetime) as latest_end
      FROM schedule_slots
    `);
    
    console.log('\n📅 Current Schedule:');
    console.log(`   Scheduled jobs: ${scheduleStats.rows[0].scheduled_jobs}`);
    console.log(`   Total time slots: ${scheduleStats.rows[0].total_slots}`);
    if (scheduleStats.rows[0].earliest_start) {
      console.log(`   Schedule range: ${scheduleStats.rows[0].earliest_start} to ${scheduleStats.rows[0].latest_end}`);
    } else {
      console.log(`   No jobs currently scheduled`);
    }
    
    // Try to schedule the highest priority job
    console.log('\n🎯 Testing scheduling of highest priority job...');
    
    const topJob = await client.query(`
      SELECT j.id, j.job_number, j.customer_name, j.priority_score, j.promised_date,
             COUNT(jr.id) as operation_count
      FROM jobs j
      LEFT JOIN job_routings jr ON j.id = jr.job_id
      LEFT JOIN schedule_slots ss ON j.id = ss.job_id
      WHERE j.status != 'completed'
      AND ss.id IS NULL
      AND j.schedule_locked = false
      GROUP BY j.id
      ORDER BY j.priority_score DESC, j.promised_date ASC
      LIMIT 1
    `);
    
    if (topJob.rows.length > 0) {
      const job = topJob.rows[0];
      console.log(`\nSelected job: ${job.job_number} (${job.customer_name})`);
      console.log(`   Priority score: ${job.priority_score}`);
      console.log(`   Due date: ${job.promised_date}`);
      console.log(`   Operations: ${job.operation_count}`);
      
      // Get the routings for this job
      const routings = await client.query(`
        SELECT operation_number, operation_name, estimated_hours, sequence_order, is_outsourced
        FROM job_routings
        WHERE job_id = $1
        ORDER BY sequence_order, operation_number
      `, [job.id]);
      
      if (routings.rows.length > 0) {
        console.log('\nOperations to schedule:');
        routings.rows.forEach((op, index) => {
          console.log(`   ${index + 1}. Op ${op.operation_number}: ${op.operation_name}`);
          console.log(`      Hours: ${op.estimated_hours}, Sequence: ${op.sequence_order}${op.is_outsourced ? ' (OUTSOURCED)' : ''}`);
        });
        
        // Try to schedule using the API endpoint
        console.log('\n🔄 Attempting to schedule via API...');
        
        try {
          const axios = require('axios');
          const response = await axios.post(`http://localhost:5000/api/scheduling/schedule-job/${job.id}`);
          
          if (response.data.success) {
            console.log('✅ Job scheduled successfully!');
            console.log(`   Scheduled operations: ${response.data.scheduledOperations.length}`);
            
            // Show first few scheduled operations
            response.data.scheduledOperations.slice(0, 3).forEach(op => {
              console.log(`   - ${op.operation_name} on ${op.machine_name}`);
              console.log(`     Start: ${op.start_time}`);
            });
          } else {
            console.log(`❌ Scheduling failed: ${response.data.message}`);
          }
        } catch (error) {
          if (error.response) {
            console.log(`❌ API error: ${error.response.data.error || error.response.data.message}`);
          } else {
            console.log(`❌ Request failed: ${error.message}`);
          }
        }
      } else {
        console.log('⚠️ No routings found for this job');
      }
    } else {
      console.log('⚠️ No unscheduled jobs found');
    }
    
    // Check machine availability
    const machines = await client.query(`
      SELECT m.name, mg.name as group_name, m.is_active
      FROM machines m
      LEFT JOIN machine_groups mg ON m.machine_group_id = mg.id
      WHERE m.is_active = true
      ORDER BY mg.name, m.name
      LIMIT 10
    `);
    
    console.log('\n🏭 Available Machines (sample):');
    machines.rows.forEach(machine => {
      console.log(`   ${machine.name} (${machine.group_name || 'No group'})`);
    });
    
    client.release();
    
    console.log('\n✅ Basic scheduling test completed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
  } finally {
    await pool.end();
  }
}

// Run the test
testSimpleSchedule();