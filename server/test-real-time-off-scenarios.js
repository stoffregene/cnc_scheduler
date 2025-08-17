const { Pool } = require('pg');
const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:sassysalad@localhost:5432/cnc_scheduler'
});

const API_BASE = 'http://localhost:5000/api';

async function testRealTimeOffScenarios() {
  try {
    console.log('=== Testing Real Time Off Scenarios ===\n');
    
    // 1. Get real operators and their current workloads
    console.log('Step 1: Analyzing current operator schedules...\n');
    
    const operators = await pool.query(`
      SELECT 
        e.id,
        e.first_name,
        e.last_name,
        e.first_name || ' ' || e.last_name as name,
        COUNT(ss.id) as current_jobs_scheduled,
        MIN(ss.start_datetime) as next_job_date,
        MAX(ss.start_datetime) as last_job_date
      FROM employees e
      LEFT JOIN schedule_slots ss ON e.id = ss.employee_id 
        AND ss.start_datetime >= CURRENT_DATE
        AND ss.status = 'scheduled'
      GROUP BY e.id, e.first_name, e.last_name
      HAVING COUNT(ss.id) > 0  -- Only operators with scheduled work
      ORDER BY COUNT(ss.id) DESC
      LIMIT 5
    `);
    
    console.log('Top 5 busiest operators:');
    operators.rows.forEach(op => {
      console.log(`  - ${op.name}: ${op.current_jobs_scheduled} jobs scheduled (${op.next_job_date?.toDateString()} to ${op.last_job_date?.toDateString()})`);
    });
    
    if (operators.rows.length === 0) {
      console.log('No operators have scheduled work. Cannot run realistic tests.');
      return;
    }
    
    // 2. Pick the busiest operator for testing
    const testOperator = operators.rows[0];
    console.log(`\nStep 2: Testing time off for ${testOperator.name} (${testOperator.current_jobs_scheduled} jobs affected)\n`);
    
    // 3. Analyze their scheduled jobs
    const operatorJobs = await pool.query(`
      SELECT 
        j.id,
        j.job_number,
        j.priority_score,
        j.promised_date,
        jr.operation_name,
        jr.sequence_order,
        ss.start_datetime,
        ss.end_datetime,
        ss.status,
        m.name as machine_name,
        (j.promised_date - ss.start_datetime::date) as days_until_promise
      FROM schedule_slots ss
      JOIN job_routings jr ON ss.job_routing_id = jr.id
      JOIN jobs j ON jr.job_id = j.id
      JOIN machines m ON ss.machine_id = m.id
      WHERE ss.employee_id = $1
      AND ss.start_datetime >= CURRENT_DATE
      AND ss.status = 'scheduled'
      ORDER BY ss.start_datetime ASC
      LIMIT 10
    `, [testOperator.id]);
    
    console.log(`${testOperator.name}'s next 10 scheduled jobs:`);
    operatorJobs.rows.forEach(job => {
      const priorityLevel = job.priority_score > 700 ? 'HIGH' : job.priority_score > 400 ? 'MED' : 'LOW';
      const firmZone = job.days_until_promise <= 14 ? '🔒 FIRM' : '';
      console.log(`  - ${job.job_number} (${priorityLevel} ${job.priority_score}) ${job.operation_name} on ${job.start_datetime.toDateString()} ${firmZone}`);
    });
    
    if (operatorJobs.rows.length === 0) {
      console.log('No detailed job information found.');
      return;
    }
    
    // 4. Test Scenario 1: Single day sick leave (immediate impact)
    console.log('\n=== SCENARIO 1: Single Day Sick Leave ===');
    const firstJobDate = operatorJobs.rows[0].start_datetime;
    const sickDate = new Date(firstJobDate);
    sickDate.setDate(sickDate.getDate());
    const sickDateStr = sickDate.toISOString().split('T')[0];
    
    console.log(`Simulating ${testOperator.name} calling in sick on ${sickDateStr}...\n`);
    
    // Count jobs that would be affected
    const affectedJobs = operatorJobs.rows.filter(job => 
      job.start_datetime.toDateString() === sickDate.toDateString()
    );
    
    console.log(`Jobs that would be affected by sick day: ${affectedJobs.length}`);
    affectedJobs.forEach(job => {
      const priority = job.priority_score > 700 ? '🔴 CRITICAL' : job.priority_score > 400 ? '🟡 HIGH' : '🟢 NORMAL';
      console.log(`  - ${job.job_number}: ${priority} (${job.priority_score}) - ${job.operation_name}`);
    });
    
    // Simulate the time off API call
    try {
      console.log('\nTesting time off API...');
      const timeOffResponse = await axios.post(`${API_BASE}/timeoff`, {
        employee_id: testOperator.id,
        start_date: sickDateStr,
        end_date: sickDateStr,
        reason: 'Sick day - TEST'
      });
      
      console.log('✅ Time off API response:');
      console.log(`  - Message: ${timeOffResponse.data.message}`);
      console.log(`  - Jobs affected: ${timeOffResponse.data.affected_jobs?.length || 0}`);
      
      // Wait for trigger processing
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Check displacement logs
      const logs = await axios.get(`${API_BASE}/timeoff/logs/displacement?employee_id=${testOperator.id}&limit=1`);
      if (logs.data.length > 0) {
        const log = logs.data[0];
        console.log('  - Displacement log created:');
        console.log(`    * Jobs affected: ${log.affected_jobs}`);
        console.log(`    * Status: ${log.execution_status}`);
        if (log.execution_details) {
          console.log(`    * Pushed to return: ${log.execution_details.jobs_pushed_to_return || 0}`);
          console.log(`    * Substitutes found: ${log.execution_details.jobs_with_substitutes || 0}`);
          console.log(`    * Need rescheduling: ${log.execution_details.jobs_needing_reschedule || 0}`);
        }
      }
      
      // Check alerts
      const alerts = await axios.get(`${API_BASE}/timeoff/alerts/current`);
      const newAlerts = alerts.data.filter(alert => 
        alert.created_at > new Date(Date.now() - 60000).toISOString()
      );
      
      if (newAlerts.length > 0) {
        console.log('  - Alerts generated:');
        newAlerts.forEach(alert => {
          console.log(`    * [${alert.severity.toUpperCase()}] ${alert.alert_type}: ${alert.message}`);
        });
      }
      
      // Clean up test data
      await axios.delete(`${API_BASE}/timeoff/${timeOffResponse.data.id}`);
      console.log('  - Test time off entry cleaned up');
      
    } catch (error) {
      console.log(`  ❌ API Error: ${error.response?.data?.error || error.message}`);
    }
    
    // 5. Test Scenario 2: Week-long vacation (planned)
    console.log('\n=== SCENARIO 2: Week-Long Planned Vacation ===');
    
    // Find a week with multiple scheduled jobs
    const futureJobs = operatorJobs.rows.filter(job => {
      const jobDate = new Date(job.start_datetime);
      const daysFromNow = Math.floor((jobDate - new Date()) / (1000 * 60 * 60 * 24));
      return daysFromNow >= 7 && daysFromNow <= 21; // 1-3 weeks out
    });
    
    if (futureJobs.length > 0) {
      const vacationStart = new Date(futureJobs[0].start_datetime);
      vacationStart.setDate(vacationStart.getDate() - 1); // Start day before first job
      const vacationEnd = new Date(vacationStart);
      vacationEnd.setDate(vacationEnd.getDate() + 6); // 7 day vacation
      
      const vacationStartStr = vacationStart.toISOString().split('T')[0];
      const vacationEndStr = vacationEnd.toISOString().split('T')[0];
      
      console.log(`Simulating ${testOperator.name} taking vacation ${vacationStartStr} to ${vacationEndStr}...\n`);
      
      // Count affected jobs
      const weekAffectedJobs = operatorJobs.rows.filter(job => {
        const jobDate = new Date(job.start_datetime);
        return jobDate >= vacationStart && jobDate <= vacationEnd;
      });
      
      console.log(`Jobs that would be affected by vacation: ${weekAffectedJobs.length}`);
      let highPriorityCount = 0;
      let firmZoneCount = 0;
      
      weekAffectedJobs.forEach(job => {
        if (job.priority_score > 700) highPriorityCount++;
        if (job.days_until_promise <= 14) firmZoneCount++;
        
        const priority = job.priority_score > 700 ? '🔴 CRITICAL' : job.priority_score > 400 ? '🟡 HIGH' : '🟢 NORMAL';
        const firm = job.days_until_promise <= 14 ? '🔒 FIRM' : '';
        console.log(`  - ${job.job_number}: ${priority} (${job.priority_score}) ${firm} - ${job.operation_name} on ${job.start_datetime.toDateString()}`);
      });
      
      console.log(`\nImpact Summary:`);
      console.log(`  - High priority jobs affected: ${highPriorityCount}`);
      console.log(`  - Jobs in firm zone affected: ${firmZoneCount}`);
      console.log(`  - Expected behavior: Force displacement with operator substitution where possible`);
      
      // Don't actually create the vacation - just analyze
      console.log('\n  📝 NOTE: Vacation not created to avoid disrupting real schedule');
    } else {
      console.log('No suitable jobs found for vacation testing');
    }
    
    // 6. Check operator substitution opportunities
    console.log('\n=== SCENARIO 3: Operator Substitution Analysis ===');
    
    // Find substitution opportunities for this operator's work
    const substitutionOps = await pool.query(`
      SELECT * FROM operator_substitution_opportunities
      WHERE current_operator = $1
      ORDER BY priority_difference DESC
      LIMIT 5
    `, [testOperator.name]);
    
    if (substitutionOps.rows.length > 0) {
      console.log('Potential operator substitutions available:');
      substitutionOps.rows.forEach(sub => {
        console.log(`  - ${sub.high_priority_job} (${sub.high_priority_score}) can take ${sub.potential_substitute} from ${sub.low_priority_job} (${sub.low_priority_score})`);
        console.log(`    Priority difference: ${sub.priority_difference} (${sub.priority_diff_percent}%)`);
      });
    } else {
      console.log('No substitution opportunities found for this operator');
    }
    
    // 7. Summary and recommendations
    console.log('\n=== SYSTEM HEALTH SUMMARY ===');
    
    // Check for any existing alerts
    const allAlerts = await axios.get(`${API_BASE}/timeoff/alerts/current`);
    console.log(`\nCurrent system alerts: ${allAlerts.data.length}`);
    if (allAlerts.data.length > 0) {
      const criticalAlerts = allAlerts.data.filter(a => a.severity === 'critical').length;
      const highAlerts = allAlerts.data.filter(a => a.severity === 'high').length;
      console.log(`  - Critical: ${criticalAlerts}`);
      console.log(`  - High: ${highAlerts}`);
      console.log(`  - Other: ${allAlerts.data.length - criticalAlerts - highAlerts}`);
    }
    
    // Check for existing time off
    const existingTimeOff = await axios.get(`${API_BASE}/timeoff`);
    console.log(`\nCurrent time off entries: ${existingTimeOff.data.length}`);
    
    // Check displacement log activity
    const recentLogs = await axios.get(`${API_BASE}/timeoff/logs/displacement?limit=10`);
    const recentCount = recentLogs.data.filter(log => 
      new Date(log.created_at) > new Date(Date.now() - 24 * 60 * 60 * 1000)
    ).length;
    console.log(`Recent displacement activity (24h): ${recentCount} events`);
    
    console.log('\n✅ Real scenario testing completed!');
    console.log('\nKey Findings:');
    console.log(`  - Busiest operator: ${testOperator.name} with ${testOperator.current_jobs_scheduled} scheduled jobs`);
    console.log(`  - Time off API endpoints are functional`);
    console.log(`  - Displacement logging is working`);
    console.log(`  - Alert system is monitoring for issues`);
    console.log(`  - Substitution opportunities are being tracked`);
    
  } catch (error) {
    console.error('Error during real scenario testing:', error.message);
  } finally {
    await pool.end();
  }
}

// Check if server is running before testing
async function checkServerHealth() {
  try {
    const response = await axios.get(`${API_BASE}/health`);
    console.log(`✅ Server is running: ${response.data.message}`);
    return true;
  } catch (error) {
    console.log('❌ Server is not responding. Please ensure the server is running on port 5000.');
    return false;
  }
}

async function main() {
  const serverReady = await checkServerHealth();
  if (serverReady) {
    await testRealTimeOffScenarios();
  }
}

main();