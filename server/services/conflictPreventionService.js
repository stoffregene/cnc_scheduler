const { Pool } = require('pg');

/**
 * ConflictPreventionService - Validates scheduling conflicts BEFORE they occur
 * Used by both auto-scheduling and manual drag-and-drop operations
 */
class ConflictPreventionService {
  constructor(pool) {
    this.pool = pool;
  }

  /**
   * Validate a proposed schedule slot before committing it
   * @param {Object} proposedSlot - The slot to validate
   * @param {number} proposedSlot.job_id - Job ID
   * @param {number} proposedSlot.job_routing_id - Job routing ID
   * @param {number} proposedSlot.machine_id - Machine ID
   * @param {number} proposedSlot.employee_id - Employee ID
   * @param {Date} proposedSlot.start_datetime - Start time
   * @param {Date} proposedSlot.end_datetime - End time
   * @param {number} proposedSlot.excludeSlotId - Optional: Slot ID to exclude (for updates)
   * @returns {Object} Validation result with conflicts and suggestions
   */
  async validateProposedSlot(proposedSlot) {
    const conflicts = [];
    const warnings = [];
    
    try {
      // 1. Validate operation sequence order
      const sequenceConflict = await this.validateOperationSequence(proposedSlot);
      if (sequenceConflict) conflicts.push(sequenceConflict);

      // 1.5. Validate SAW/waterjet lag time requirements
      const lagConflict = await this.validateSawWaterjetLagTime(proposedSlot);
      if (lagConflict) conflicts.push(lagConflict);

      // 2. Check machine availability conflicts
      const machineConflict = await this.validateMachineAvailability(proposedSlot);
      if (machineConflict) conflicts.push(machineConflict);

      // 3. Check operator availability conflicts
      const operatorConflict = await this.validateOperatorAvailability(proposedSlot);
      if (operatorConflict) conflicts.push(operatorConflict);

      // 4. Validate operator shift hours
      const shiftViolation = await this.validateOperatorShiftHours(proposedSlot);
      if (shiftViolation) conflicts.push(shiftViolation);

      // 5. Check machine-operation compatibility
      const compatibilityIssue = await this.validateMachineCompatibility(proposedSlot);
      if (compatibilityIssue) conflicts.push(compatibilityIssue);

      // 6. Check for capacity overruns
      const capacityWarning = await this.validateCapacityLimits(proposedSlot);
      if (capacityWarning) warnings.push(capacityWarning);

      return {
        isValid: conflicts.length === 0,
        conflicts,
        warnings,
        canProceed: conflicts.filter(c => c.severity === 'critical').length === 0,
        suggestions: this.generateResolutionSuggestions(conflicts, proposedSlot)
      };

    } catch (error) {
      console.error('Error validating proposed slot:', error);
      return {
        isValid: false,
        conflicts: [{
          type: 'validation_error',
          severity: 'critical',
          message: 'Unable to validate slot due to system error',
          details: error.message
        }],
        warnings: [],
        canProceed: false,
        suggestions: []
      };
    }
  }

  /**
   * Validate operation sequence order - CRITICAL for manufacturing flow
   */
  async validateOperationSequence(proposedSlot) {
    const query = `
      WITH job_operations AS (
        SELECT 
          jr.id as routing_id,
          jr.sequence_order,
          jr.operation_name,
          ss.start_datetime,
          ss.end_datetime,
          ss.id as slot_id
        FROM job_routings jr
        LEFT JOIN schedule_slots ss ON jr.id = ss.job_routing_id 
          AND ss.status IN ('scheduled', 'in_progress')
          AND ($4::integer IS NULL OR ss.id != $4)
        WHERE jr.job_id = $1
      ),
      current_operation AS (
        SELECT sequence_order, operation_name
        FROM job_routings 
        WHERE id = $2
      ),
      sequence_violations AS (
        -- Check if any LATER operations are already scheduled BEFORE proposed start
        SELECT 
          jo.routing_id,
          jo.sequence_order as violation_seq,
          jo.operation_name as violation_op,
          jo.start_datetime as violation_start,
          co.sequence_order as current_seq,
          co.operation_name as current_op
        FROM job_operations jo
        CROSS JOIN current_operation co
        WHERE jo.sequence_order > co.sequence_order  -- Later operation
          AND jo.start_datetime IS NOT NULL         -- Already scheduled
          AND jo.start_datetime < $3                -- Starts before proposed time
          
        UNION ALL
        
        -- Check if any EARLIER operations end AFTER proposed start
        SELECT 
          jo.routing_id,
          jo.sequence_order as violation_seq,
          jo.operation_name as violation_op,
          jo.end_datetime as violation_start,
          co.sequence_order as current_seq,
          co.operation_name as current_op
        FROM job_operations jo
        CROSS JOIN current_operation co
        WHERE jo.sequence_order < co.sequence_order  -- Earlier operation
          AND jo.end_datetime IS NOT NULL           -- Already scheduled
          AND jo.end_datetime > $3                  -- Ends after proposed start
      )
      SELECT * FROM sequence_violations
      LIMIT 1
    `;

    const result = await this.pool.query(query, [
      proposedSlot.job_id,
      proposedSlot.job_routing_id,
      proposedSlot.start_datetime,
      proposedSlot.excludeSlotId || null
    ]);

    if (result.rows.length > 0) {
      const violation = result.rows[0];
      return {
        type: 'sequence_violation',
        severity: 'critical',
        message: `Operation sequence violation detected`,
        details: `${violation.current_op} (sequence ${violation.current_seq}) cannot be scheduled before ${violation.violation_op} (sequence ${violation.violation_seq}) is completed`,
        metadata: {
          conflicting_operation: violation.violation_op,
          conflicting_sequence: violation.violation_seq,
          current_operation: violation.current_op,
          current_sequence: violation.current_seq
        }
      };
    }

    return null;
  }

  /**
   * Validate SAW/waterjet 24-hour lag time requirements
   */
  async validateSawWaterjetLagTime(proposedSlot) {
    const query = `
      WITH job_operations AS (
        SELECT 
          jr.id as routing_id,
          jr.sequence_order,
          jr.operation_name,
          ss.start_datetime,
          ss.end_datetime,
          ss.id as slot_id
        FROM job_routings jr
        LEFT JOIN schedule_slots ss ON jr.id = ss.job_routing_id 
          AND ss.status IN ('scheduled', 'in_progress')
          AND ($4::integer IS NULL OR ss.id != $4)
        WHERE jr.job_id = $1
      ),
      current_operation AS (
        SELECT sequence_order, operation_name
        FROM job_routings 
        WHERE id = $2
      )
      SELECT 
        jo.operation_name as previous_operation,
        jo.sequence_order as previous_sequence,
        jo.end_datetime as previous_end,
        co.operation_name as current_operation,
        co.sequence_order as current_sequence,
        $3::timestamp as proposed_start
      FROM job_operations jo
      CROSS JOIN current_operation co
      WHERE jo.sequence_order < co.sequence_order
        AND jo.end_datetime IS NOT NULL
        AND (
          LOWER(jo.operation_name) LIKE '%saw%' OR 
          LOWER(jo.operation_name) LIKE '%waterjet%' OR 
          LOWER(jo.operation_name) LIKE '%wj%'
        )
        AND $3::timestamp < (jo.end_datetime + INTERVAL '24 hours')
      ORDER BY jo.sequence_order DESC
      LIMIT 1
    `;

    const result = await this.pool.query(query, [
      proposedSlot.job_id,
      proposedSlot.job_routing_id,
      proposedSlot.start_datetime,
      proposedSlot.excludeSlotId || null
    ]);

    if (result.rows.length > 0) {
      const violation = result.rows[0];
      const previousEnd = new Date(violation.previous_end);
      const proposedStart = new Date(violation.proposed_start);
      const requiredStart = new Date(previousEnd.getTime() + 24 * 60 * 60 * 1000); // 24 hours
      const hoursShort = (requiredStart.getTime() - proposedStart.getTime()) / (1000 * 60 * 60);

      return {
        type: 'saw_waterjet_lag_violation',
        severity: 'critical',
        message: `SAW/Waterjet 24-hour lag time requirement violated`,
        details: `${violation.current_operation} must wait 24 hours after ${violation.previous_operation} ends. Required start: ${requiredStart.toISOString()}, proposed: ${proposedStart.toISOString()} (${hoursShort.toFixed(1)}h too early)`,
        metadata: {
          previous_operation: violation.previous_operation,
          previous_sequence: violation.previous_sequence,
          previous_end: violation.previous_end,
          current_operation: violation.current_operation,
          current_sequence: violation.current_sequence,
          proposed_start: violation.proposed_start,
          required_start: requiredStart.toISOString(),
          hours_too_early: hoursShort
        }
      };
    }

    return null;
  }

  /**
   * Check if machine is available during proposed time
   */
  async validateMachineAvailability(proposedSlot) {
    const query = `
      SELECT 
        ss.id as conflicting_slot_id,
        j.job_number as conflicting_job,
        jr.operation_name as conflicting_operation,
        ss.start_datetime,
        ss.end_datetime,
        GREATEST(
          EXTRACT(EPOCH FROM (LEAST(ss.end_datetime, $3) - GREATEST(ss.start_datetime, $2))) / 60,
          0
        ) as overlap_minutes
      FROM schedule_slots ss
      JOIN jobs j ON ss.job_id = j.id
      JOIN job_routings jr ON ss.job_routing_id = jr.id
      WHERE ss.machine_id = $1
        AND ss.status IN ('scheduled', 'in_progress')
        AND ($4::integer IS NULL OR ss.id != $4)
        AND ss.start_datetime < $3  -- Conflict starts before proposed end
        AND ss.end_datetime > $2    -- Conflict ends after proposed start
      LIMIT 1
    `;

    const result = await this.pool.query(query, [
      proposedSlot.machine_id,
      proposedSlot.start_datetime,
      proposedSlot.end_datetime,
      proposedSlot.excludeSlotId || null
    ]);

    if (result.rows.length > 0) {
      const conflict = result.rows[0];
      return {
        type: 'machine_conflict',
        severity: 'critical',
        message: `Machine is already occupied during proposed time`,
        details: `Machine conflict with ${conflict.conflicting_job} (${conflict.conflicting_operation})`,
        metadata: {
          conflicting_job: conflict.conflicting_job,
          conflicting_operation: conflict.conflicting_operation,
          conflict_start: conflict.start_datetime,
          conflict_end: conflict.end_datetime,
          overlap_minutes: parseFloat(conflict.overlap_minutes)
        }
      };
    }

    return null;
  }

  /**
   * Check if operator is available during proposed time
   */
  async validateOperatorAvailability(proposedSlot) {
    const query = `
      SELECT 
        ss.id as conflicting_slot_id,
        j.job_number as conflicting_job,
        jr.operation_name as conflicting_operation,
        m.name as conflicting_machine,
        ss.start_datetime,
        ss.end_datetime,
        GREATEST(
          EXTRACT(EPOCH FROM (LEAST(ss.end_datetime, $3) - GREATEST(ss.start_datetime, $2))) / 60,
          0
        ) as overlap_minutes
      FROM schedule_slots ss
      JOIN jobs j ON ss.job_id = j.id
      JOIN job_routings jr ON ss.job_routing_id = jr.id
      JOIN machines m ON ss.machine_id = m.id
      WHERE ss.employee_id = $1
        AND ss.status IN ('scheduled', 'in_progress')
        AND ($4::integer IS NULL OR ss.id != $4)
        AND ss.start_datetime < $3  -- Conflict starts before proposed end
        AND ss.end_datetime > $2    -- Conflict ends after proposed start
      LIMIT 1
    `;

    const result = await this.pool.query(query, [
      proposedSlot.employee_id,
      proposedSlot.start_datetime,
      proposedSlot.end_datetime,
      proposedSlot.excludeSlotId || null
    ]);

    if (result.rows.length > 0) {
      const conflict = result.rows[0];
      return {
        type: 'operator_conflict',
        severity: 'critical',
        message: `Operator is already assigned during proposed time`,
        details: `Operator conflict with ${conflict.conflicting_job} on ${conflict.conflicting_machine}`,
        metadata: {
          conflicting_job: conflict.conflicting_job,
          conflicting_operation: conflict.conflicting_operation,
          conflicting_machine: conflict.conflicting_machine,
          conflict_start: conflict.start_datetime,
          conflict_end: conflict.end_datetime,
          overlap_minutes: parseFloat(conflict.overlap_minutes)
        }
      };
    }

    return null;
  }

  /**
   * Validate operator is working during proposed shift hours
   */
  async validateOperatorShiftHours(proposedSlot) {
    const startDate = new Date(proposedSlot.start_datetime);
    const endDate = new Date(proposedSlot.end_datetime);
    
    // Check each day the operation spans
    const daysToCheck = [];
    const currentDate = new Date(startDate);
    currentDate.setHours(0, 0, 0, 0);
    
    while (currentDate <= endDate) {
      daysToCheck.push(new Date(currentDate));
      currentDate.setDate(currentDate.getDate() + 1);
    }

    for (const checkDate of daysToCheck) {
      const workingHours = await this.getOperatorWorkingHours(proposedSlot.employee_id, checkDate);
      
      if (!workingHours.is_working_day) {
        return {
          type: 'shift_violation',
          severity: 'high',
          message: `Operator not scheduled to work on ${checkDate.toDateString()}`,
          details: `Operation scheduled on operator's non-working day`,
          metadata: {
            violation_date: checkDate,
            operator_id: proposedSlot.employee_id
          }
        };
      }

      // Check if operation time overlaps with shift hours
      const dayStart = new Date(checkDate);
      const dayEnd = new Date(checkDate);
      dayEnd.setDate(dayEnd.getDate() + 1);

      const operationStart = new Date(Math.max(startDate.getTime(), dayStart.getTime()));
      const operationEnd = new Date(Math.min(endDate.getTime(), dayEnd.getTime()));

      if (operationStart < operationEnd) {
        const shiftStart = parseFloat(workingHours.start_hour);
        const shiftEnd = parseFloat(workingHours.end_hour);
        
        const opStartHour = operationStart.getHours() + operationStart.getMinutes() / 60;
        const opEndHour = operationEnd.getHours() + operationEnd.getMinutes() / 60;

        const isOutsideShift = workingHours.is_overnight ? 
          (opStartHour < shiftStart && opStartHour >= shiftEnd) ||
          (opEndHour < shiftStart && opEndHour >= shiftEnd) :
          opStartHour < shiftStart || opEndHour > shiftEnd;

        if (isOutsideShift) {
          return {
            type: 'shift_violation',
            severity: 'high',
            message: `Operation scheduled outside operator's shift hours`,
            details: `Operation time ${opStartHour.toFixed(1)}h-${opEndHour.toFixed(1)}h is outside shift ${shiftStart}h-${shiftEnd}h`,
            metadata: {
              violation_date: checkDate,
              operator_shift: `${shiftStart}h-${shiftEnd}h`,
              operation_time: `${opStartHour.toFixed(1)}h-${opEndHour.toFixed(1)}h`,
              is_overnight_shift: workingHours.is_overnight
            }
          };
        }
      }
    }

    return null;
  }

  /**
   * Validate machine-operation compatibility (e.g., INSPECT vs PRODUCTION)
   */
  async validateMachineCompatibility(proposedSlot) {
    const query = `
      SELECT 
        m.name as machine_name,
        jr.operation_name,
        jr.machine_id as required_machine_id,
        jr.machine_group_id as required_group_id
      FROM machines m
      JOIN job_routings jr ON jr.id = $2
      WHERE m.id = $1
    `;

    const result = await this.pool.query(query, [
      proposedSlot.machine_id,
      proposedSlot.job_routing_id
    ]);

    if (result.rows.length > 0) {
      const info = result.rows[0];
      
      // Determine machine type from machine name
      const machineType = info.machine_name.toUpperCase().includes('INSPECT') ? 'INSPECT' : 'PRODUCTION';
      const isInspectOperation = info.operation_name && info.operation_name.toUpperCase().includes('INSPECT');
      
      // Check INSPECT operations on non-INSPECT machines
      if (isInspectOperation && machineType !== 'INSPECT') {
        return {
          type: 'compatibility_violation',
          severity: 'critical',
          message: `INSPECT operation cannot be performed on production machine`,
          details: `${info.operation_name} operation requires INSPECT machine, but ${info.machine_name} is a production machine`,
          metadata: {
            operation_type: 'INSPECT',
            machine_type: machineType,
            machine_name: info.machine_name
          }
        };
      }

      // Check production operations on INSPECT machines
      if (info.operation_name && !isInspectOperation && machineType === 'INSPECT') {
        return {
          type: 'compatibility_violation',
          severity: 'critical',
          message: `Production operation cannot be performed on INSPECT machine`,
          details: `${info.operation_name} operation requires production machine, but ${info.machine_name} is INSPECT only`,
          metadata: {
            operation_type: 'PRODUCTION',
            machine_type: machineType,
            machine_name: info.machine_name
          }
        };
      }
    }

    return null;
  }

  /**
   * Check for capacity warnings (high workload periods)
   */
  async validateCapacityLimits(proposedSlot) {
    // Get operator workload for the proposed day
    const slotDate = new Date(proposedSlot.start_datetime);
    slotDate.setHours(0, 0, 0, 0);

    const query = `
      SELECT 
        COUNT(*) as scheduled_operations,
        SUM(ss.duration_minutes) as total_minutes,
        (SELECT duration_hours FROM get_employee_working_hours($1, $2::date)) as shift_hours
      FROM schedule_slots ss
      WHERE ss.employee_id = $1
        AND ss.slot_date = $2::date
        AND ss.status IN ('scheduled', 'in_progress')
        AND ($3::integer IS NULL OR ss.id != $3)
    `;

    const result = await this.pool.query(query, [
      proposedSlot.employee_id,
      slotDate,
      proposedSlot.excludeSlotId || null
    ]);

    if (result.rows.length > 0) {
      const workload = result.rows[0];
      const shiftMinutes = (workload.shift_hours || 8) * 60;
      const currentLoad = parseInt(workload.total_minutes) || 0;
      const proposedDuration = (new Date(proposedSlot.end_datetime) - new Date(proposedSlot.start_datetime)) / (1000 * 60);
      const totalLoad = currentLoad + proposedDuration;
      const utilizationPercent = (totalLoad / shiftMinutes) * 100;

      if (utilizationPercent > 100) {
        return {
          type: 'capacity_warning',
          severity: 'medium',
          message: `Operator capacity exceeded for ${slotDate.toDateString()}`,
          details: `Total workload: ${(totalLoad/60).toFixed(1)}h exceeds shift capacity: ${(shiftMinutes/60).toFixed(1)}h (${utilizationPercent.toFixed(1)}%)`,
          metadata: {
            current_minutes: currentLoad,
            proposed_minutes: proposedDuration,
            total_minutes: totalLoad,
            shift_minutes: shiftMinutes,
            utilization_percent: utilizationPercent
          }
        };
      }
    }

    return null;
  }

  /**
   * Get operator working hours for a specific date
   */
  async getOperatorWorkingHours(employeeId, targetDate) {
    const query = `SELECT * FROM get_employee_working_hours($1, $2::date)`;
    const result = await this.pool.query(query, [employeeId, targetDate]);
    
    return result.rows[0] || {
      start_hour: 6,
      end_hour: 18,
      duration_hours: 12,
      is_overnight: false,
      is_working_day: true
    };
  }

  /**
   * Generate resolution suggestions based on conflicts
   */
  generateResolutionSuggestions(conflicts, proposedSlot) {
    const suggestions = [];

    for (const conflict of conflicts) {
      switch (conflict.type) {
        case 'sequence_violation':
          suggestions.push({
            type: 'reschedule_earlier_operations',
            priority: 'high',
            description: 'Complete earlier operations before scheduling this one',
            action: 'auto_reschedule_prerequisites'
          });
          break;

        case 'machine_conflict':
          suggestions.push({
            type: 'find_alternative_time',
            priority: 'high',
            description: 'Find next available time slot on this machine',
            action: 'suggest_alternative_slots'
          });
          suggestions.push({
            type: 'find_alternative_machine',
            priority: 'medium',
            description: 'Find compatible machine with availability',
            action: 'suggest_compatible_machines'
          });
          break;

        case 'operator_conflict':
          suggestions.push({
            type: 'find_alternative_operator',
            priority: 'high',
            description: 'Assign different qualified operator',
            action: 'suggest_alternative_operators'
          });
          suggestions.push({
            type: 'reschedule_conflicting_job',
            priority: 'medium',
            description: 'Move conflicting job to different time',
            action: 'suggest_reschedule_conflict'
          });
          break;

        case 'shift_violation':
          suggestions.push({
            type: 'adjust_to_shift_hours',
            priority: 'high',
            description: 'Reschedule to operator\'s working hours',
            action: 'suggest_shift_compliant_times'
          });
          break;

        case 'compatibility_violation':
          suggestions.push({
            type: 'find_compatible_machine',
            priority: 'critical',
            description: 'Move to machine that supports this operation type',
            action: 'suggest_compatible_machines'
          });
          break;
      }
    }

    return suggestions;
  }
}

module.exports = ConflictPreventionService;