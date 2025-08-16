const { Pool } = require('pg');
const path = require('path');
const SchedulingService = require('./services/schedulingService');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function testAutoScheduleDistribution() {
  const schedulingService = new SchedulingService(pool);
  
  try {
    console.log('🧪 Testing auto-schedule workload distribution...\n');
    
    // Get pending jobs count
    const pendingJobsResult = await pool.query(`
      SELECT COUNT(*) as count 
      FROM jobs j
      WHERE j.status = 'pending' 
        AND j.id IN (SELECT DISTINCT job_id FROM job_routings WHERE job_id IS NOT NULL)
    `);
    
    const pendingCount = parseInt(pendingJobsResult.rows[0].count);
    console.log(`📋 Found ${pendingCount} pending jobs to schedule\n`);
    
    if (pendingCount === 0) {
      console.log('❌ No pending jobs found to test with. Create some test jobs first.');
      return;
    }
    
    // Clear existing schedules for testing
    console.log('🧹 Clearing existing schedules for clean test...');
    await pool.query('DELETE FROM schedule_slots WHERE status IN (\'scheduled\', \'in_progress\')');
    await pool.query('UPDATE jobs SET auto_scheduled = false, status = \'pending\' WHERE auto_scheduled = true');
    
    // Capture start time
    const startTime = new Date();
    
    // Run auto-schedule
    console.log('🚀 Starting auto-schedule process...\n');
    const results = await schedulingService.autoScheduleAllJobs();
    
    const endTime = new Date();
    const duration = (endTime - startTime) / 1000;
    
    // Analyze results
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    
    console.log(`\n📊 Auto-schedule Results (${duration.toFixed(2)}s):`);
    console.log(`   ✅ Successful: ${successful}/${results.length} jobs`);
    console.log(`   ❌ Failed: ${failed}/${results.length} jobs`);
    
    if (failed > 0) {
      console.log(`\n⚠️  Failed jobs:`);
      results.filter(r => !r.success).forEach(job => {
        console.log(`   - Job ${job.job_number}: ${job.error}`);
      });
    }
    
    // Analyze workload distribution
    console.log('\n🔍 Analyzing workload distribution...');
    
    const distributionResult = await pool.query(`
      SELECT 
        ss.slot_date,
        m.name as machine_name,
        e.first_name || ' ' || e.last_name as operator_name,
        COUNT(ss.id) as slots_assigned,
        COUNT(ss.id) * 15 / 60.0 as hours_assigned,
        COUNT(DISTINCT ss.job_id) as unique_jobs
      FROM schedule_slots ss
      JOIN machines m ON ss.machine_id = m.id
      JOIN employees e ON ss.employee_id = e.id
      WHERE ss.status IN ('scheduled', 'in_progress')
      GROUP BY ss.slot_date, m.id, m.name, e.id, e.first_name, e.last_name
      ORDER BY ss.slot_date, hours_assigned DESC
    `);
    
    // Group by date and analyze distribution
    const distributionByDate = {};
    distributionResult.rows.forEach(row => {
      const dateKey = row.slot_date.toISOString().split('T')[0];
      if (!distributionByDate[dateKey]) {
        distributionByDate[dateKey] = [];
      }
      distributionByDate[dateKey].push(row);
    });
    
    console.log(`\n📅 Workload distribution by date:`);
    Object.entries(distributionByDate).forEach(([date, assignments]) => {
      const totalHours = assignments.reduce((sum, a) => sum + parseFloat(a.hours_assigned), 0);
      const maxHours = Math.max(...assignments.map(a => parseFloat(a.hours_assigned)));
      const avgHours = totalHours / assignments.length;
      
      console.log(`\n   ${date}: ${totalHours.toFixed(1)}h total, ${assignments.length} assignments`);
      console.log(`   Max: ${maxHours.toFixed(1)}h, Avg: ${avgHours.toFixed(1)}h per assignment`);
      
      // Show top 5 most loaded assignments
      const topAssignments = assignments
        .sort((a, b) => parseFloat(b.hours_assigned) - parseFloat(a.hours_assigned))
        .slice(0, 5);
      
      topAssignments.forEach((assignment, index) => {
        console.log(`   ${index + 1}. ${assignment.machine_name} + ${assignment.operator_name}: ${parseFloat(assignment.hours_assigned).toFixed(1)}h (${assignment.unique_jobs} jobs)`);
      });
      
      // Check for over-packing (more than 8 hours per assignment)
      const overPacked = assignments.filter(a => parseFloat(a.hours_assigned) > 8);
      if (overPacked.length > 0) {
        console.log(`   ⚠️  ${overPacked.length} assignments over 8 hours:`);
        overPacked.forEach(assignment => {
          console.log(`      ${assignment.machine_name} + ${assignment.operator_name}: ${parseFloat(assignment.hours_assigned).toFixed(1)}h`);
        });
      }
    });
    
    // Overall statistics
    const totalAssignments = distributionResult.rows.length;
    const totalHours = distributionResult.rows.reduce((sum, row) => sum + parseFloat(row.hours_assigned), 0);
    const avgHoursPerAssignment = totalHours / totalAssignments;
    const maxHoursPerAssignment = Math.max(...distributionResult.rows.map(row => parseFloat(row.hours_assigned)));
    
    console.log(`\n📈 Overall Statistics:`);
    console.log(`   Total assignments: ${totalAssignments}`);
    console.log(`   Total hours scheduled: ${totalHours.toFixed(1)}h`);
    console.log(`   Average hours per assignment: ${avgHoursPerAssignment.toFixed(1)}h`);
    console.log(`   Maximum hours per assignment: ${maxHoursPerAssignment.toFixed(1)}h`);
    
    // Success criteria
    const maxReasonableHours = 10; // Allow up to 10 hours per assignment
    const overPackedAssignments = distributionResult.rows.filter(row => parseFloat(row.hours_assigned) > maxReasonableHours);
    
    if (overPackedAssignments.length === 0) {
      console.log(`\n✅ SUCCESS: No assignments exceed ${maxReasonableHours} hours!`);
      console.log(`   Workload distribution appears to be working correctly.`);
    } else {
      console.log(`\n❌ ISSUE: ${overPackedAssignments.length} assignments exceed ${maxReasonableHours} hours:`);
      overPackedAssignments.forEach(assignment => {
        console.log(`   - ${assignment.machine_name} + ${assignment.operator_name}: ${parseFloat(assignment.hours_assigned).toFixed(1)}h`);
      });
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
  } finally {
    await pool.end();
  }
}

testAutoScheduleDistribution();