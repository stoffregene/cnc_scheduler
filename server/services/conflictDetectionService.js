const { Pool } = require('pg');

class ConflictDetectionService {
  constructor(pool) {
    this.pool = pool;
  }

  /**
   * Detect all types of scheduling conflicts
   * Returns comprehensive conflict analysis
   */
  async detectAllConflicts(options = {}) {
    const { 
      startDate = new Date(), 
      endDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      jobId = null,
      includeResolved = false 
    } = options;

    const conflicts = {
      machine_conflicts: await this.detectMachineConflicts(startDate, endDate, jobId),
      operator_conflicts: await this.detectOperatorConflicts(startDate, endDate, jobId),
      sequence_conflicts: await this.detectSequenceConflicts(startDate, endDate, jobId),
      capacity_conflicts: await this.detectCapacityConflicts(startDate, endDate, jobId),
      dependency_conflicts: await this.detectDependencyConflicts(startDate, endDate, jobId),
      shift_conflicts: await this.detectShiftConflicts(startDate, endDate, jobId)
    };

    // Calculate severity and impact scores
    const summary = this.calculateConflictSummary(conflicts);
    
    return {
      conflicts,
      summary,
      detected_at: new Date(),
      date_range: { startDate, endDate }
    };
  }

  /**
   * Detect machine double-booking conflicts
   * Multiple operations scheduled on same machine at overlapping times
   */
  async detectMachineConflicts(startDate, endDate, jobId = null) {
    const query = `
      WITH overlapping_slots AS (
        SELECT 
          s1.id as slot1_id,
          s1.job_id as job1_id,
          s1.machine_id,
          s1.start_datetime as slot1_start,
          s1.end_datetime as slot1_end,
          s1.job_routing_id as routing1_id,
          j1.job_number as job1_number,
          jr1.operation_name as operation1_name,
          
          s2.id as slot2_id,
          s2.job_id as job2_id,
          s2.start_datetime as slot2_start,
          s2.end_datetime as slot2_end,
          s2.job_routing_id as routing2_id,
          j2.job_number as job2_number,
          jr2.operation_name as operation2_name,
          
          m.name as machine_name,
          
          -- Calculate overlap duration in minutes
          EXTRACT(EPOCH FROM (
            LEAST(s1.end_datetime, s2.end_datetime) - 
            GREATEST(s1.start_datetime, s2.start_datetime)
          )) / 60 as overlap_minutes
          
        FROM schedule_slots s1
        JOIN schedule_slots s2 ON s1.machine_id = s2.machine_id 
          AND s1.id != s2.id
          AND s1.start_datetime < s2.end_datetime 
          AND s1.end_datetime > s2.start_datetime
        JOIN machines m ON s1.machine_id = m.id
        JOIN jobs j1 ON s1.job_id = j1.id
        JOIN jobs j2 ON s2.job_id = j2.id
        JOIN job_routings jr1 ON s1.job_routing_id = jr1.id
        JOIN job_routings jr2 ON s2.job_routing_id = jr2.id
        WHERE s1.status IN ('scheduled', 'in_progress')
          AND s2.status IN ('scheduled', 'in_progress')
          AND s1.slot_date BETWEEN $1::date AND $2::date
          AND ($3::integer IS NULL OR s1.job_id = $3 OR s2.job_id = $3)
      )
      SELECT 
        *,
        'machine_double_booking' as conflict_type,
        CASE 
          WHEN overlap_minutes > 480 THEN 'critical'
          WHEN overlap_minutes > 120 THEN 'high'
          WHEN overlap_minutes > 30 THEN 'medium'
          ELSE 'low'
        END as severity
      FROM overlapping_slots
      ORDER BY overlap_minutes DESC, slot1_start ASC
    `;

    const result = await this.pool.query(query, [startDate, endDate, jobId]);
    return result.rows;
  }

  /**
   * Detect operator double-booking conflicts
   * Same operator assigned to multiple operations at overlapping times
   */
  async detectOperatorConflicts(startDate, endDate, jobId = null) {
    const query = `
      WITH overlapping_operators AS (
        SELECT 
          s1.id as slot1_id,
          s1.job_id as job1_id,
          s1.employee_id,
          s1.start_datetime as slot1_start,
          s1.end_datetime as slot1_end,
          j1.job_number as job1_number,
          jr1.operation_name as operation1_name,
          m1.name as machine1_name,
          
          s2.id as slot2_id,
          s2.job_id as job2_id,
          s2.start_datetime as slot2_start,
          s2.end_datetime as slot2_end,
          j2.job_number as job2_number,
          jr2.operation_name as operation2_name,
          m2.name as machine2_name,
          
          e.first_name || ' ' || e.last_name as operator_name,
          
          -- Calculate overlap duration in minutes
          EXTRACT(EPOCH FROM (
            LEAST(s1.end_datetime, s2.end_datetime) - 
            GREATEST(s1.start_datetime, s2.start_datetime)
          )) / 60 as overlap_minutes
          
        FROM schedule_slots s1
        JOIN schedule_slots s2 ON s1.employee_id = s2.employee_id 
          AND s1.id != s2.id
          AND s1.start_datetime < s2.end_datetime 
          AND s1.end_datetime > s2.start_datetime
        JOIN employees e ON s1.employee_id = e.id
        JOIN machines m1 ON s1.machine_id = m1.id
        JOIN machines m2 ON s2.machine_id = m2.id
        JOIN jobs j1 ON s1.job_id = j1.id
        JOIN jobs j2 ON s2.job_id = j2.id
        JOIN job_routings jr1 ON s1.job_routing_id = jr1.id
        JOIN job_routings jr2 ON s2.job_routing_id = jr2.id
        WHERE s1.status IN ('scheduled', 'in_progress')
          AND s2.status IN ('scheduled', 'in_progress')
          AND s1.slot_date BETWEEN $1::date AND $2::date
          AND ($3::integer IS NULL OR s1.job_id = $3 OR s2.job_id = $3)
      )
      SELECT 
        *,
        'operator_double_booking' as conflict_type,
        CASE 
          WHEN overlap_minutes > 480 THEN 'critical'
          WHEN overlap_minutes > 120 THEN 'high'
          WHEN overlap_minutes > 30 THEN 'medium'
          ELSE 'low'
        END as severity
      FROM overlapping_operators
      ORDER BY overlap_minutes DESC, slot1_start ASC
    `;

    const result = await this.pool.query(query, [startDate, endDate, jobId]);
    return result.rows;
  }

  /**
   * Detect sequence conflicts
   * Operations scheduled out of their proper sequence order
   */
  async detectSequenceConflicts(startDate, endDate, jobId = null) {
    const query = `
      WITH job_sequences AS (
        SELECT 
          s1.job_id,
          j.job_number,
          s1.id as current_slot_id,
          s1.start_datetime as current_start,
          s1.end_datetime as current_end,
          jr1.sequence_order as current_sequence,
          jr1.operation_name as current_operation,
          m1.name as current_machine,
          
          s2.id as conflicting_slot_id,
          s2.start_datetime as conflicting_start,
          s2.end_datetime as conflicting_end,
          jr2.sequence_order as conflicting_sequence,
          jr2.operation_name as conflicting_operation,
          m2.name as conflicting_machine
          
        FROM schedule_slots s1
        JOIN schedule_slots s2 ON s1.job_id = s2.job_id AND s1.id != s2.id
        JOIN job_routings jr1 ON s1.job_routing_id = jr1.id
        JOIN job_routings jr2 ON s2.job_routing_id = jr2.id
        JOIN jobs j ON s1.job_id = j.id
        JOIN machines m1 ON s1.machine_id = m1.id
        JOIN machines m2 ON s2.machine_id = m2.id
        WHERE s1.status IN ('scheduled', 'in_progress')
          AND s2.status IN ('scheduled', 'in_progress')
          AND s1.slot_date BETWEEN $1::date AND $2::date
          AND ($3::integer IS NULL OR s1.job_id = $3)
          -- Operation with higher sequence should start after lower sequence
          AND jr1.sequence_order > jr2.sequence_order
          AND s1.start_datetime < s2.end_datetime
      )
      SELECT 
        *,
        'sequence_violation' as conflict_type,
        CASE 
          WHEN current_sequence - conflicting_sequence > 2 THEN 'critical'
          WHEN current_sequence - conflicting_sequence > 1 THEN 'high'
          ELSE 'medium'
        END as severity
      FROM job_sequences
      ORDER BY job_id, current_sequence
    `;

    const result = await this.pool.query(query, [startDate, endDate, jobId]);
    return result.rows;
  }

  /**
   * Detect capacity conflicts
   * Operators scheduled beyond their daily capacity limits
   */
  async detectCapacityConflicts(startDate, endDate, jobId = null) {
    const query = `
      WITH daily_workload AS (
        SELECT 
          s.employee_id,
          s.slot_date,
          e.first_name || ' ' || e.last_name as operator_name,
          SUM(s.duration_minutes) as total_minutes_scheduled,
          
          -- Get operator's daily capacity
          ABS((SELECT duration_hours FROM get_employee_working_hours(s.employee_id, s.slot_date))) * 60 as daily_capacity_minutes,
          
          -- Get all slots for this operator on this date
          array_agg(
            json_build_object(
              'slot_id', s.id,
              'job_number', j.job_number,
              'operation', jr.operation_name,
              'machine', m.name,
              'duration_minutes', s.duration_minutes,
              'start_datetime', s.start_datetime,
              'end_datetime', s.end_datetime
            ) ORDER BY s.start_datetime
          ) as scheduled_slots
          
        FROM schedule_slots s
        JOIN employees e ON s.employee_id = e.id
        JOIN jobs j ON s.job_id = j.id
        JOIN job_routings jr ON s.job_routing_id = jr.id
        JOIN machines m ON s.machine_id = m.id
        WHERE s.status IN ('scheduled', 'in_progress')
          AND s.slot_date BETWEEN $1::date AND $2::date
          AND ($3::integer IS NULL OR s.job_id = $3)
        GROUP BY s.employee_id, s.slot_date, e.first_name, e.last_name
        HAVING SUM(s.duration_minutes) > ABS((
          SELECT duration_hours FROM get_employee_working_hours(s.employee_id, s.slot_date)
        )) * 60
      )
      SELECT 
        *,
        total_minutes_scheduled - daily_capacity_minutes as overtime_minutes,
        'capacity_exceeded' as conflict_type,
        CASE 
          WHEN total_minutes_scheduled > daily_capacity_minutes * 1.5 THEN 'critical'
          WHEN total_minutes_scheduled > daily_capacity_minutes * 1.25 THEN 'high'
          WHEN total_minutes_scheduled > daily_capacity_minutes * 1.1 THEN 'medium'
          ELSE 'low'
        END as severity
      FROM daily_workload
      ORDER BY overtime_minutes DESC, slot_date ASC
    `;

    const result = await this.pool.query(query, [startDate, endDate, jobId]);
    return result.rows;
  }

  /**
   * Detect dependency conflicts
   * Jobs scheduled without considering prerequisite dependencies
   */
  async detectDependencyConflicts(startDate, endDate, jobId = null) {
    // For now, return empty array - can be expanded later for complex dependencies
    // This could include material dependencies, setup dependencies, etc.
    return [];
  }

  /**
   * Detect shift conflicts
   * Operations scheduled outside operator's working hours
   */
  async detectShiftConflicts(startDate, endDate, jobId = null) {
    const query = `
      WITH shift_violations AS (
        SELECT 
          s.id as slot_id,
          s.job_id,
          s.employee_id,
          j.job_number,
          jr.operation_name,
          m.name as machine_name,
          e.first_name || ' ' || e.last_name as operator_name,
          s.start_datetime,
          s.end_datetime,
          s.slot_date,
          
          -- Get operator's shift hours for this date
          wh.start_hour as shift_start_hour,
          wh.end_hour as shift_end_hour,
          wh.duration_hours as shift_duration,
          wh.is_overnight,
          wh.is_working_day,
          
          -- Calculate actual schedule times as decimal hours
          EXTRACT(hour FROM s.start_datetime) + EXTRACT(minute FROM s.start_datetime)/60.0 as schedule_start_hour,
          EXTRACT(hour FROM s.end_datetime) + EXTRACT(minute FROM s.end_datetime)/60.0 as schedule_end_hour
          
        FROM schedule_slots s
        JOIN employees e ON s.employee_id = e.id
        JOIN jobs j ON s.job_id = j.id
        JOIN job_routings jr ON s.job_routing_id = jr.id
        JOIN machines m ON s.machine_id = m.id
        CROSS JOIN LATERAL get_employee_working_hours(s.employee_id, s.slot_date) wh
        WHERE s.status IN ('scheduled', 'in_progress')
          AND s.slot_date BETWEEN $1::date AND $2::date
          AND ($3::integer IS NULL OR s.job_id = $3)
      )
      SELECT 
        *,
        'shift_violation' as conflict_type,
        CASE 
          WHEN NOT is_working_day THEN 'critical'
          WHEN NOT is_overnight AND (schedule_start_hour < shift_start_hour OR schedule_end_hour > shift_end_hour) THEN 'high'
          WHEN is_overnight AND (schedule_start_hour < shift_start_hour AND schedule_start_hour > shift_end_hour) THEN 'high'
          ELSE 'medium'
        END as severity,
        CASE 
          WHEN NOT is_working_day THEN 'Scheduled on non-working day'
          WHEN NOT is_overnight AND schedule_start_hour < shift_start_hour THEN 'Starts before shift'
          WHEN NOT is_overnight AND schedule_end_hour > shift_end_hour THEN 'Ends after shift'
          WHEN is_overnight AND (schedule_start_hour < shift_start_hour AND schedule_start_hour > shift_end_hour) THEN 'Outside overnight shift hours'
          ELSE 'Other shift violation'
        END as violation_reason
      FROM shift_violations
      WHERE NOT is_working_day 
        OR (NOT is_overnight AND (schedule_start_hour < shift_start_hour OR schedule_end_hour > shift_end_hour))
        OR (is_overnight AND (schedule_start_hour < shift_start_hour AND schedule_start_hour > shift_end_hour))
      ORDER BY severity DESC, slot_date ASC, schedule_start_hour ASC
    `;

    const result = await this.pool.query(query, [startDate, endDate, jobId]);
    return result.rows;
  }

  /**
   * Calculate conflict summary statistics
   */
  calculateConflictSummary(conflicts) {
    const summary = {
      total_conflicts: 0,
      by_type: {},
      by_severity: { critical: 0, high: 0, medium: 0, low: 0 },
      most_affected_jobs: {},
      most_affected_operators: {},
      most_affected_machines: {}
    };

    // Count conflicts by type and severity
    Object.entries(conflicts).forEach(([type, conflictList]) => {
      summary.by_type[type] = conflictList.length;
      summary.total_conflicts += conflictList.length;

      conflictList.forEach(conflict => {
        if (conflict.severity) {
          summary.by_severity[conflict.severity]++;
        }

        // Track most affected resources
        if (conflict.job1_number) {
          summary.most_affected_jobs[conflict.job1_number] = 
            (summary.most_affected_jobs[conflict.job1_number] || 0) + 1;
        }
        if (conflict.job2_number) {
          summary.most_affected_jobs[conflict.job2_number] = 
            (summary.most_affected_jobs[conflict.job2_number] || 0) + 1;
        }
        if (conflict.operator_name) {
          summary.most_affected_operators[conflict.operator_name] = 
            (summary.most_affected_operators[conflict.operator_name] || 0) + 1;
        }
        if (conflict.machine_name) {
          summary.most_affected_machines[conflict.machine_name] = 
            (summary.most_affected_machines[conflict.machine_name] || 0) + 1;
        }
      });
    });

    return summary;
  }

  /**
   * Get conflict resolution suggestions
   */
  async suggestConflictResolutions(conflictId, conflictType) {
    const suggestions = [];

    switch (conflictType) {
      case 'machine_double_booking':
        suggestions.push(
          { action: 'reschedule_later', description: 'Move one operation to later available slot' },
          { action: 'reschedule_different_machine', description: 'Assign to alternative machine' },
          { action: 'split_operation', description: 'Split operation across multiple time slots' }
        );
        break;

      case 'operator_double_booking':
        suggestions.push(
          { action: 'assign_different_operator', description: 'Assign to alternative qualified operator' },
          { action: 'reschedule_sequential', description: 'Schedule operations sequentially' },
          { action: 'cross_train_operator', description: 'Cross-train additional operators' }
        );
        break;

      case 'sequence_violation':
        suggestions.push(
          { action: 'reorder_operations', description: 'Reschedule to maintain proper sequence' },
          { action: 'expedite_prerequisite', description: 'Fast-track prerequisite operations' }
        );
        break;

      case 'capacity_exceeded':
        suggestions.push(
          { action: 'distribute_workload', description: 'Distribute work across multiple operators' },
          { action: 'reschedule_overtime', description: 'Schedule some work for overtime hours' },
          { action: 'extend_timeline', description: 'Extend completion timeline' }
        );
        break;

      case 'shift_violation':
        suggestions.push(
          { action: 'reschedule_within_shift', description: 'Move to operator\'s working hours' },
          { action: 'assign_shift_operator', description: 'Assign to operator working those hours' },
          { action: 'approve_overtime', description: 'Approve overtime for this operation' }
        );
        break;

      default:
        suggestions.push(
          { action: 'manual_review', description: 'Requires manual review and resolution' }
        );
    }

    return suggestions;
  }

  /**
   * Log detected conflicts to database for tracking
   */
  async logConflicts(conflicts, detectionRun) {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');

      // Create detection run record
      const runResult = await client.query(`
        INSERT INTO conflict_detection_runs (
          detection_date, 
          total_conflicts_found, 
          conflicts_data
        ) VALUES ($1, $2, $3)
        RETURNING id
      `, [
        detectionRun.detected_at,
        detectionRun.summary.total_conflicts,
        JSON.stringify(conflicts)
      ]);

      const runId = runResult.rows[0].id;

      // Log individual conflicts
      for (const [conflictType, conflictList] of Object.entries(conflicts)) {
        for (const conflict of conflictList) {
          await client.query(`
            INSERT INTO detected_conflicts (
              detection_run_id,
              conflict_type,
              severity,
              affected_job_ids,
              affected_employee_ids,
              affected_machine_ids,
              conflict_data,
              suggested_resolutions,
              status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          `, [
            runId,
            conflictType,
            conflict.severity || 'medium',
            [conflict.job1_id, conflict.job2_id].filter(Boolean),
            [conflict.employee_id].filter(Boolean),
            [conflict.machine_id].filter(Boolean),
            JSON.stringify(conflict),
            JSON.stringify(await this.suggestConflictResolutions(conflict.slot1_id, conflictType)),
            'detected'
          ]);
        }
      }

      await client.query('COMMIT');
      return runId;

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

module.exports = ConflictDetectionService;