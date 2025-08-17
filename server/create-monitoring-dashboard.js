const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:sassysalad@localhost:5432/cnc_scheduler'
});

async function createMonitoringDashboard() {
  try {
    console.log('Creating monitoring dashboard views and functions...\n');
    
    // 1. Create comprehensive time off monitoring view
    await pool.query(`
      CREATE OR REPLACE VIEW time_off_monitoring_dashboard AS
      SELECT 
        -- Current time off entries
        (SELECT COUNT(*) FROM employee_time_off WHERE end_date >= CURRENT_DATE) as active_time_off_entries,
        
        -- Current alerts
        (SELECT COUNT(*) FROM system_alerts WHERE acknowledged = FALSE) as unacknowledged_alerts,
        (SELECT COUNT(*) FROM system_alerts WHERE acknowledged = FALSE AND severity = 'critical') as critical_alerts,
        (SELECT COUNT(*) FROM system_alerts WHERE acknowledged = FALSE AND severity = 'high') as high_alerts,
        
        -- Recent displacement activity
        (SELECT COUNT(*) FROM displacement_logs WHERE created_at >= CURRENT_DATE - INTERVAL '24 hours') as displacements_24h,
        (SELECT COUNT(*) FROM displacement_logs WHERE created_at >= CURRENT_DATE - INTERVAL '7 days') as displacements_7d,
        
        -- Jobs needing attention
        (SELECT COUNT(*) FROM job_routings WHERE routing_status = 'reschedule') as jobs_needing_reschedule,
        (SELECT COUNT(*) FROM schedule_slots WHERE status = 'operator_unavailable') as slots_operator_unavailable,
        
        -- Workload stats
        (SELECT COUNT(DISTINCT employee_id) FROM schedule_slots WHERE start_datetime >= CURRENT_DATE) as employees_with_work,
        (SELECT COUNT(*) FROM schedule_slots WHERE start_datetime >= CURRENT_DATE AND start_datetime <= CURRENT_DATE + INTERVAL '7 days') as slots_next_7_days,
        
        -- System health
        CURRENT_TIMESTAMP as last_updated
    `);
    console.log('✅ Created time_off_monitoring_dashboard view');
    
    // 2. Create employee workload impact view
    await pool.query(`
      CREATE OR REPLACE VIEW employee_workload_impact AS
      SELECT 
        e.id,
        e.first_name || ' ' || e.last_name as employee_name,
        
        -- Current workload
        COUNT(ss.id) as total_scheduled_jobs,
        COUNT(CASE WHEN ss.start_datetime <= CURRENT_DATE + INTERVAL '7 days' THEN 1 END) as jobs_next_week,
        COUNT(CASE WHEN ss.start_datetime <= CURRENT_DATE + INTERVAL '14 days' THEN 1 END) as jobs_next_two_weeks,
        
        -- Priority breakdown
        COUNT(CASE WHEN j.priority_score > 700 THEN 1 END) as high_priority_jobs,
        COUNT(CASE WHEN j.priority_score BETWEEN 400 AND 700 THEN 1 END) as medium_priority_jobs,
        COUNT(CASE WHEN j.priority_score < 400 THEN 1 END) as low_priority_jobs,
        
        -- Time off status
        EXISTS(
          SELECT 1 FROM employee_time_off eto 
          WHERE eto.employee_id = e.id 
          AND CURRENT_DATE BETWEEN eto.start_date AND eto.end_date
        ) as currently_on_time_off,
        
        (SELECT COUNT(*) FROM employee_time_off eto 
         WHERE eto.employee_id = e.id 
         AND eto.start_date > CURRENT_DATE 
         AND eto.start_date <= CURRENT_DATE + INTERVAL '30 days'
        ) as upcoming_time_off_30d,
        
        -- Risk factors
        COUNT(CASE WHEN j.priority_score > 700 AND j.promised_date - CURRENT_DATE <= 14 THEN 1 END) as critical_jobs_in_firm_zone,
        
        MIN(ss.start_datetime) as next_job_date,
        MAX(ss.start_datetime) as last_job_date
        
      FROM employees e
      LEFT JOIN schedule_slots ss ON e.id = ss.employee_id 
        AND ss.start_datetime >= CURRENT_DATE
        AND ss.status IN ('scheduled', 'operator_unavailable')
      LEFT JOIN job_routings jr ON ss.job_routing_id = jr.id
      LEFT JOIN jobs j ON jr.job_id = j.id
      GROUP BY e.id, e.first_name, e.last_name
      HAVING COUNT(ss.id) > 0  -- Only employees with scheduled work
      ORDER BY COUNT(ss.id) DESC
    `);
    console.log('✅ Created employee_workload_impact view');
    
    // 3. Create displacement impact analysis view
    await pool.query(`
      CREATE OR REPLACE VIEW displacement_impact_analysis AS
      SELECT 
        dl.id as log_id,
        dl.trigger_type,
        dl.created_at as event_time,
        dl.execution_status,
        dl.affected_jobs,
        
        -- Extract employee info from trigger details
        (dl.trigger_details->>'employee_id')::integer as employee_id,
        e.first_name || ' ' || e.last_name as employee_name,
        
        -- Execution details
        (dl.execution_details->>'jobs_pushed_to_return')::integer as jobs_pushed,
        (dl.execution_details->>'jobs_with_substitutes')::integer as jobs_substituted, 
        (dl.execution_details->>'jobs_needing_reschedule')::integer as jobs_need_reschedule,
        
        -- Time impact
        (dl.trigger_details->>'start_date')::date as time_off_start,
        (dl.trigger_details->>'end_date')::date as time_off_end,
        (dl.trigger_details->>'return_date')::date as return_date,
        
        -- Calculate impact metrics
        CASE 
          WHEN dl.execution_status = 'completed' THEN 'Success'
          WHEN dl.execution_status = 'processing' THEN 'In Progress'
          ELSE 'Failed'
        END as status_display,
        
        -- Business impact score (higher = more disruptive)
        COALESCE(dl.affected_jobs, 0) * 10 + 
        COALESCE((dl.execution_details->>'high_priority_jobs')::integer, 0) * 50 +
        COALESCE((dl.execution_details->>'firm_zone_violations')::integer, 0) * 100 as impact_score
        
      FROM displacement_logs dl
      LEFT JOIN employees e ON (dl.trigger_details->>'employee_id')::integer = e.id
      WHERE dl.trigger_type IN ('time_off', 'time_off_advanced')
      ORDER BY dl.created_at DESC
    `);
    console.log('✅ Created displacement_impact_analysis view');
    
    // 4. Create alert priority view
    await pool.query(`
      CREATE OR REPLACE VIEW alert_priority_dashboard AS
      SELECT 
        sa.id,
        sa.alert_type,
        sa.severity,
        sa.message,
        sa.created_at,
        sa.acknowledged,
        sa.acknowledged_at,
        
        -- Extract job details if available
        sa.details->>'job_number' as job_number,
        (sa.details->>'priority_score')::numeric as job_priority_score,
        sa.details->>'employee' as affected_employee,
        sa.details->>'machine' as affected_machine,
        
        -- Calculate urgency score
        CASE sa.severity
          WHEN 'critical' THEN 1000
          WHEN 'high' THEN 500
          WHEN 'medium' THEN 200
          ELSE 100
        END +
        CASE 
          WHEN sa.created_at >= CURRENT_TIMESTAMP - INTERVAL '1 hour' THEN 200
          WHEN sa.created_at >= CURRENT_TIMESTAMP - INTERVAL '4 hours' THEN 100
          WHEN sa.created_at >= CURRENT_TIMESTAMP - INTERVAL '24 hours' THEN 50
          ELSE 0
        END as urgency_score,
        
        -- Time since creation
        EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - sa.created_at))/3600 as hours_since_created
        
      FROM system_alerts sa
      WHERE sa.acknowledged = FALSE
      ORDER BY 
        CASE sa.severity 
          WHEN 'critical' THEN 1
          WHEN 'high' THEN 2 
          WHEN 'medium' THEN 3
          ELSE 4
        END,
        sa.created_at DESC
    `);
    console.log('✅ Created alert_priority_dashboard view');
    
    // 5. Create system health check function
    await pool.query(`
      CREATE OR REPLACE FUNCTION get_system_health_summary()
      RETURNS TABLE(
        category VARCHAR,
        status VARCHAR,
        value INTEGER,
        message TEXT,
        action_required BOOLEAN
      ) AS $$
      BEGIN
        -- Critical alerts check
        RETURN QUERY
        SELECT 
          'Alerts'::VARCHAR as category,
          CASE WHEN COUNT(*) = 0 THEN 'Good' 
               WHEN COUNT(*) <= 5 THEN 'Warning'
               ELSE 'Critical' END as status,
          COUNT(*)::INTEGER as value,
          'Unacknowledged critical/high alerts'::TEXT as message,
          COUNT(*) > 0 as action_required
        FROM system_alerts 
        WHERE acknowledged = FALSE AND severity IN ('critical', 'high');
        
        -- Jobs needing rescheduling
        RETURN QUERY
        SELECT 
          'Scheduling'::VARCHAR as category,
          CASE WHEN COUNT(*) = 0 THEN 'Good'
               WHEN COUNT(*) <= 10 THEN 'Warning' 
               ELSE 'Critical' END as status,
          COUNT(*)::INTEGER as value,
          'Jobs marked for rescheduling'::TEXT as message,
          COUNT(*) > 20 as action_required
        FROM job_routings 
        WHERE routing_status = 'reschedule';
        
        -- Operator unavailable slots
        RETURN QUERY
        SELECT 
          'Operators'::VARCHAR as category,
          CASE WHEN COUNT(*) = 0 THEN 'Good'
               WHEN COUNT(*) <= 5 THEN 'Warning'
               ELSE 'Critical' END as status,
          COUNT(*)::INTEGER as value,
          'Schedule slots with unavailable operators'::TEXT as message,
          COUNT(*) > 0 as action_required
        FROM schedule_slots 
        WHERE status = 'operator_unavailable';
        
        -- Recent displacement activity
        RETURN QUERY
        SELECT 
          'Displacement'::VARCHAR as category,
          CASE WHEN COUNT(*) = 0 THEN 'Good'
               WHEN COUNT(*) <= 3 THEN 'Normal'
               ELSE 'High Activity' END as status,
          COUNT(*)::INTEGER as value,
          'Displacement events in last 24 hours'::TEXT as message,
          FALSE as action_required
        FROM displacement_logs 
        WHERE created_at >= CURRENT_TIMESTAMP - INTERVAL '24 hours';
        
      END;
      $$ LANGUAGE plpgsql;
    `);
    console.log('✅ Created get_system_health_summary function');
    
    // 6. Create quick monitoring queries
    console.log('\n=== MONITORING DASHBOARD CREATED ===\n');
    
    // Test the dashboard
    console.log('Current System Status:');
    const health = await pool.query('SELECT * FROM get_system_health_summary()');
    health.rows.forEach(item => {
      const icon = item.status === 'Good' ? '✅' : item.status === 'Critical' ? '❌' : '⚠️';
      const action = item.action_required ? ' [ACTION REQUIRED]' : '';
      console.log(`  ${icon} ${item.category}: ${item.status} (${item.value}) - ${item.message}${action}`);
    });
    
    console.log('\nDashboard Views Created:');
    console.log('  📊 time_off_monitoring_dashboard - Overall system metrics');
    console.log('  👥 employee_workload_impact - Per-employee workload analysis');
    console.log('  📈 displacement_impact_analysis - Displacement event tracking');
    console.log('  🚨 alert_priority_dashboard - Prioritized alert management');
    
    console.log('\nQuick Monitoring Queries:');
    console.log('  SELECT * FROM time_off_monitoring_dashboard;');
    console.log('  SELECT * FROM employee_workload_impact LIMIT 10;');
    console.log('  SELECT * FROM displacement_impact_analysis LIMIT 10;');
    console.log('  SELECT * FROM alert_priority_dashboard;');
    console.log('  SELECT * FROM get_system_health_summary();');
    
    // Run a quick test of workload impact
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
    
  } catch (error) {
    console.error('Error creating monitoring dashboard:', error);
  } finally {
    await pool.end();
  }
}

createMonitoringDashboard();