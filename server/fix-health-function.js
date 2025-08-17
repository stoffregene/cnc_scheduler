const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:sassysalad@localhost:5732/cnc_scheduler'
});

async function fixHealthFunction() {
  try {
    // Drop and recreate the function
    await pool.query('DROP FUNCTION IF EXISTS get_system_health_summary()');
    
    // Fix the return type issue
    await pool.query(`
      CREATE OR REPLACE FUNCTION get_system_health_summary()
      RETURNS TABLE(
        category TEXT,
        status TEXT,
        value INTEGER,
        message TEXT,
        action_required BOOLEAN
      ) AS $$
      BEGIN
        -- Critical alerts check
        RETURN QUERY
        SELECT 
          'Alerts'::TEXT as category,
          CASE WHEN COUNT(*) = 0 THEN 'Good' 
               WHEN COUNT(*) <= 5 THEN 'Warning'
               ELSE 'Critical' END::TEXT as status,
          COUNT(*)::INTEGER as value,
          'Unacknowledged critical/high alerts'::TEXT as message,
          COUNT(*) > 0 as action_required
        FROM system_alerts 
        WHERE acknowledged = FALSE AND severity IN ('critical', 'high');
        
        -- Jobs needing rescheduling
        RETURN QUERY
        SELECT 
          'Scheduling'::TEXT as category,
          CASE WHEN COUNT(*) = 0 THEN 'Good'
               WHEN COUNT(*) <= 10 THEN 'Warning' 
               ELSE 'Critical' END::TEXT as status,
          COUNT(*)::INTEGER as value,
          'Jobs marked for rescheduling'::TEXT as message,
          COUNT(*) > 20 as action_required
        FROM job_routings 
        WHERE routing_status = 'reschedule';
        
        -- Operator unavailable slots
        RETURN QUERY
        SELECT 
          'Operators'::TEXT as category,
          CASE WHEN COUNT(*) = 0 THEN 'Good'
               WHEN COUNT(*) <= 5 THEN 'Warning'
               ELSE 'Critical' END::TEXT as status,
          COUNT(*)::INTEGER as value,
          'Schedule slots with unavailable operators'::TEXT as message,
          COUNT(*) > 0 as action_required
        FROM schedule_slots ss
        WHERE ss.status = 'operator_unavailable';
        
        -- Recent displacement activity
        RETURN QUERY
        SELECT 
          'Displacement'::TEXT as category,
          CASE WHEN COUNT(*) = 0 THEN 'Good'
               WHEN COUNT(*) <= 3 THEN 'Normal'
               ELSE 'High Activity' END::TEXT as status,
          COUNT(*)::INTEGER as value,
          'Displacement events in last 24 hours'::TEXT as message,
          FALSE as action_required
        FROM displacement_logs 
        WHERE created_at >= CURRENT_TIMESTAMP - INTERVAL '24 hours';
        
      END;
      $$ LANGUAGE plpgsql;
    `);
    
    console.log('✅ Fixed get_system_health_summary function');
    
    // Test it
    const health = await pool.query('SELECT * FROM get_system_health_summary()');
    console.log('\nCurrent System Status:');
    health.rows.forEach(item => {
      const icon = item.status === 'Good' ? '✅' : item.status === 'Critical' ? '❌' : '⚠️';
      const action = item.action_required ? ' [ACTION REQUIRED]' : '';
      console.log(`  ${icon} ${item.category}: ${item.status} (${item.value}) - ${item.message}${action}`);
    });
    
    // Test other views
    console.log('\nTop 5 Employees by Workload:');
    const workload = await pool.query(`
      SELECT employee_name, total_scheduled_jobs, high_priority_jobs, 
             currently_on_time_off, upcoming_time_off_30d 
      FROM employee_workload_impact 
      LIMIT 5
    `);
    
    workload.rows.forEach(emp => {
      const timeOffStatus = emp.currently_on_time_off ? '🏖️ ON TIME OFF' : 
                           emp.upcoming_time_off_30d > 0 ? `📅 ${emp.upcoming_time_off_30d} upcoming` : '✅';
      console.log(`  - ${emp.employee_name}: ${emp.total_scheduled_jobs} jobs (${emp.high_priority_jobs} high priority) ${timeOffStatus}`);
    });
    
    console.log('\nMonitoring Dashboard Ready! 📊');
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

fixHealthFunction();