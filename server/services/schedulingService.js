const { Pool } = require('pg');

class SchedulingService {
  constructor(pool) {
    this.pool = pool;
  }

  /**
   * Calculate priority score for a job based on multiple factors
   * Priority = Base Priority + Due Date Factor + Customer Frequency + Overdue Penalty
   */
  async calculatePriorityScore(job) {
    const basePriority = (11 - (job.priority || 5)) * 100; // Invert priority (1=high becomes 1000)
    
    // Get customer metrics
    const customerResult = await this.pool.query(
      'SELECT priority_weight, frequency_score FROM customer_metrics WHERE customer_name = $1',
      [job.customer_name]
    );
    
    const customerWeight = customerResult.rows[0]?.priority_weight || 100;
    const frequencyScore = customerResult.rows[0]?.frequency_score || 0;
    
    // Due date factor (overdue gets massive boost)
    let dueDateFactor = 0;
    if (job.due_date) {
      const dueDate = new Date(job.due_date);
      const today = new Date();
      const daysUntilDue = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));
      
      if (daysUntilDue < 0) {
        // Overdue: massive priority boost
        dueDateFactor = Math.abs(daysUntilDue) * 1000;
      } else if (daysUntilDue <= 7) {
        // Due within a week: high priority
        dueDateFactor = (7 - daysUntilDue) * 100;
      } else if (daysUntilDue <= 14) {
        // Due within two weeks: medium priority
        dueDateFactor = (14 - daysUntilDue) * 50;
      } else {
        // Normal priority decay over time
        dueDateFactor = Math.max(0, 100 - daysUntilDue);
      }
    }
    
    // Calculate final priority score
    const priorityScore = basePriority + dueDateFactor + (frequencyScore * 10) + (customerWeight / 10);
    
    return Math.round(priorityScore);
  }

  /**
   * Backward scheduling: Calculate start date from promised date minus lead time
   */
  calculateBackwardSchedule(promisedDate, leadTimeDays = 28) {
    const promised = new Date(promisedDate);
    const startDate = new Date(promised);
    startDate.setDate(startDate.getDate() - leadTimeDays);
    
    // Adjust for weekends (move to previous Friday if start falls on weekend)
    const dayOfWeek = startDate.getDay();
    if (dayOfWeek === 0) { // Sunday
      startDate.setDate(startDate.getDate() - 2);
    } else if (dayOfWeek === 6) { // Saturday
      startDate.setDate(startDate.getDate() - 1);
    }
    
    return startDate;
  }

  /**
   * Find available time slots for a job operation with chunking support
   */
  async findAvailableSlots(machineId, employeeId, durationMinutes, preferredStartDate, excludeJobId = null) {
    // Get operator's working hours to determine if chunking is needed
    const workingHours = await this.getOperatorWorkingHours(employeeId, preferredStartDate);
    const maxDailyMinutes = Math.floor(workingHours.duration_hours * 60);
    
    console.log(`Operation needs ${durationMinutes} minutes, operator ${employeeId} can work ${maxDailyMinutes} minutes/day (${workingHours.duration_hours}h shift)`);
    
    // If operation fits within operator's shift, use existing logic
    if (durationMinutes <= maxDailyMinutes) {
      return this.findConsecutiveSlots(machineId, employeeId, durationMinutes, preferredStartDate, excludeJobId);
    }
    
    // For operations longer than operator's shift, chunk them
    console.log(`Operation exceeds operator's daily capacity, chunking required`);
    return this.findChunkedSlots(machineId, employeeId, durationMinutes, preferredStartDate, excludeJobId);
  }

  /**
   * Find consecutive slots within operator's shift limits
   */
  async findConsecutiveSlots(machineId, employeeId, durationMinutes, preferredStartDate, excludeJobId = null) {
    // Calculate how many 15-minute slots needed
    const slotsNeeded = Math.ceil(durationMinutes / 15);
    
    // Get operator's working hours for the preferred date
    const workingHours = await this.getOperatorWorkingHours(employeeId, preferredStartDate);
    
    // Look for available slots in the next 60 days from preferred start date
    const searchEndDate = new Date(preferredStartDate);
    searchEndDate.setDate(searchEndDate.getDate() + 60);
    
    let shiftEndHour = workingHours.end_hour;
    
    // Handle overnight shifts (e.g., 18 to 6 means 6 PM to 6 AM next day)
    const shiftCondition = workingHours.is_overnight ? 
      `(EXTRACT(hour FROM ($3::date + interval '15 minutes' * s.slot)) >= ${workingHours.start_hour} OR 
        EXTRACT(hour FROM ($3::date + interval '15 minutes' * s.slot)) < ${workingHours.end_hour})` :
      `EXTRACT(hour FROM ($3::date + interval '15 minutes' * s.slot)) BETWEEN ${workingHours.start_hour} AND ${shiftEndHour - 1}`;
    
    const query = `
      WITH RECURSIVE time_slots AS (
        -- Generate all possible time slots within operator's shift hours
        SELECT 
          $3::date + interval '15 minutes' * s.slot as slot_datetime,
          s.slot as slot_number,
          $3::date + interval '1 day' * (s.slot / 96) as slot_date
        FROM generate_series(0, 96 * 60 - 1) as s(slot) -- 60 days * 96 slots per day
        WHERE ($3::date + interval '15 minutes' * s.slot) BETWEEN $3 AND $4
        AND (
          -- Check if employee works on this day
          SELECT is_working_day FROM get_employee_working_hours($2, ($3::date + interval '1 day' * (s.slot / 96))::date)
        ) = true
        AND (${shiftCondition}) -- Operator's shift hours
      ),
      occupied_slots AS (
        -- Find occupied slots for machine and employee
        SELECT 
          slot_date,
          generate_series(
            calculate_time_slot(start_datetime),
            calculate_time_slot(end_datetime) - 1
          ) as slot_number
        FROM schedule_slots
        WHERE (machine_id = $1 OR employee_id = $2)
        AND slot_date BETWEEN $3::date AND $4::date
        AND status IN ('scheduled', 'in_progress')
        AND ($5::integer IS NULL OR job_id != $5)
      )
      SELECT 
        ts.slot_datetime,
        ts.slot_number,
        ts.slot_date
      FROM time_slots ts
      LEFT JOIN occupied_slots os ON ts.slot_date = os.slot_date AND ts.slot_number = os.slot_number
      WHERE os.slot_number IS NULL
      ORDER BY ts.slot_datetime
      LIMIT 1000;
    `;
    
    console.log(`Looking for ${slotsNeeded} consecutive slots for employee ${employeeId} working ${workingHours.start_hour}:00-${workingHours.end_hour}:00`);
    
    const result = await this.pool.query(query, [
      machineId, employeeId, preferredStartDate, searchEndDate, excludeJobId
    ]);
    
    // Find consecutive slots
    const availableSlots = result.rows;
    const consecutiveSlots = [];
    
    for (let i = 0; i <= availableSlots.length - slotsNeeded; i++) {
      let isConsecutive = true;
      
      for (let j = 1; j < slotsNeeded; j++) {
        const currentSlot = availableSlots[i + j - 1];
        const nextSlot = availableSlots[i + j];
        
        if (!nextSlot || nextSlot.slot_number !== currentSlot.slot_number + 1) {
          isConsecutive = false;
          break;
        }
      }
      
      if (isConsecutive) {
        const startSlot = availableSlots[i];
        const endSlot = availableSlots[i + slotsNeeded - 1];
        
        consecutiveSlots.push({
          start_datetime: startSlot.slot_datetime,
          end_datetime: new Date(new Date(endSlot.slot_datetime).getTime() + 15 * 60 * 1000),
          slot_date: startSlot.slot_date,
          start_slot: startSlot.slot_number,
          duration_minutes: slotsNeeded * 15
        });
      }
    }
    
    console.log(`Found ${consecutiveSlots.length} available consecutive slot options for employee ${employeeId}`);
    return consecutiveSlots;
  }

  /**
   * Get operator's working hours for a specific date
   */
  async getOperatorWorkingHours(employeeId, targetDate) {
    const query = `
      SELECT * FROM get_employee_working_hours($1, $2::date);
    `;
    
    const result = await this.pool.query(query, [employeeId, targetDate]);
    
    if (result.rows.length === 0) {
      // Fallback to default day shift if no pattern found
      return {
        start_hour: 6,
        end_hour: 18, 
        duration_hours: 12,
        is_overnight: false,
        is_working_day: true
      };
    }
    
    return result.rows[0];
  }

  /**
   * Find chunked slots across multiple days for operations longer than operator's shift
   */
  async findChunkedSlots(machineId, employeeId, durationMinutes, preferredStartDate, excludeJobId = null) {
    const chunks = [];
    let remainingMinutes = durationMinutes;
    let currentDate = new Date(preferredStartDate);
    
    console.log(`Chunking ${durationMinutes} minutes for employee ${employeeId} across multiple days, starting from ${currentDate.toISOString()}`);
    
    while (remainingMinutes > 0) {
      // Get operator's working hours for this specific date
      const workingHours = await this.getOperatorWorkingHours(employeeId, currentDate);
      
      if (!workingHours.is_working_day) {
        console.log(`Employee ${employeeId} not working on ${currentDate.toDateString()}, skipping to next day`);
        currentDate.setDate(currentDate.getDate() + 1);
        continue;
      }
      
      const maxDailyMinutes = Math.floor(workingHours.duration_hours * 60);
      const chunkSize = Math.min(remainingMinutes, maxDailyMinutes);
      
      console.log(`Employee ${employeeId} works ${workingHours.start_hour}:00-${workingHours.end_hour}:00 (${workingHours.duration_hours}h) on ${currentDate.toDateString()}`);
      console.log(`Looking for ${chunkSize} minute chunk (${(chunkSize/60).toFixed(1)}h)`);
      
      // Set the search start time to the employee's shift start
      const shiftStartDate = new Date(currentDate);
      shiftStartDate.setHours(workingHours.start_hour, 0, 0, 0);
      
      // Find available slot for this chunk within the operator's shift
      const availableSlots = await this.findConsecutiveSlots(
        machineId, 
        employeeId, 
        chunkSize, 
        shiftStartDate, 
        excludeJobId
      );
      
      if (availableSlots.length === 0) {
        console.log(`No available slots found for employee ${employeeId} on ${currentDate.toDateString()}, trying next working day`);
        // Try next day
        currentDate.setDate(currentDate.getDate() + 1);
        // Skip weekends (unless operator works weekends)
        let attempts = 0;
        while (attempts < 7) { // Prevent infinite loop
          const nextDayHours = await this.getOperatorWorkingHours(employeeId, currentDate);
          if (nextDayHours.is_working_day) break;
          currentDate.setDate(currentDate.getDate() + 1);
          attempts++;
        }
        continue;
      }
      
      const slot = availableSlots[0];
      chunks.push({
        start_datetime: slot.start_datetime,
        end_datetime: slot.end_datetime,
        slot_date: slot.slot_date,
        start_slot: slot.start_slot,
        duration_minutes: chunkSize,
        chunk_sequence: chunks.length + 1,
        is_chunked: true,
        shift_hours: `${workingHours.start_hour}:00-${workingHours.end_hour}:00`
      });
      
      remainingMinutes -= chunkSize;
      
      console.log(`Chunk ${chunks.length} scheduled: ${chunkSize} minutes (${(chunkSize/60).toFixed(1)}h). Remaining: ${remainingMinutes} minutes (${(remainingMinutes/60).toFixed(1)}h)`);
      
      // Move to next working day for this employee
      currentDate.setDate(currentDate.getDate() + 1);
      let attempts = 0;
      while (attempts < 7) { // Prevent infinite loop
        const nextDayHours = await this.getOperatorWorkingHours(employeeId, currentDate);
        if (nextDayHours.is_working_day) break;
        currentDate.setDate(currentDate.getDate() + 1);
        attempts++;
      }
      
      // Safety check to prevent infinite loop
      if (chunks.length > 15) {
        console.error('Too many chunks required, operation may be too long or operator availability too limited');
        break;
      }
    }
    
    console.log(`Total chunks created: ${chunks.length} for employee ${employeeId}`);
    return chunks;
  }

  /**
   * Check if machine can substitute for required machine/group
   */
  async canMachineSubstitute(requiredMachineId, requiredGroupId, candidateMachineId) {
    // If specific machine is required, only that machine can be used
    if (requiredMachineId && requiredMachineId !== candidateMachineId) {
      return false;
    }
    
    // If machine group is specified, check if candidate machine belongs to that group or parent groups
    if (requiredGroupId) {
      const query = `
        WITH RECURSIVE group_hierarchy AS (
          -- Start with the required group
          SELECT id, parent_group_id, tier_level
          FROM machine_groups
          WHERE id = $1
          
          UNION ALL
          
          -- Recursively find parent groups
          SELECT mg.id, mg.parent_group_id, mg.tier_level
          FROM machine_groups mg
          JOIN group_hierarchy gh ON mg.id = gh.parent_group_id
        )
        SELECT 1 FROM machine_group_assignments mga
        JOIN group_hierarchy gh ON mga.machine_group_id = gh.id
        WHERE mga.machine_id = $2
        LIMIT 1;
      `;
      
      const result = await this.pool.query(query, [requiredGroupId, candidateMachineId]);
      return result.rows.length > 0;
    }
    
    return true; // No specific requirements
  }

  /**
   * Find best machine-operator pair for a job operation
   */
  async findBestMachineOperatorPair(operation, preferredStartDate) {
    // Convert preferred start date to date string
    const dateString = preferredStartDate.toISOString().split('T')[0];
    
    const query = `
      SELECT 
        m.id as machine_id,
        m.name as machine_name,
        e.id as employee_id,
        e.first_name || ' ' || e.last_name as employee_name,
        oma.proficiency_level,
        COUNT(ss.id) as current_workload
      FROM machines m
      LEFT JOIN machine_group_assignments mga ON m.id = mga.machine_id
      JOIN operator_machine_assignments oma ON m.id = oma.machine_id
      JOIN employees e ON oma.employee_id = e.id
      LEFT JOIN schedule_slots ss ON (m.id = ss.machine_id OR e.id = ss.employee_id) 
        AND ss.slot_date = $1::date
        AND ss.status IN ('scheduled', 'in_progress')
      WHERE m.status = 'active'
        AND e.status = 'active'
      GROUP BY m.id, m.name, e.id, e.first_name, e.last_name, oma.proficiency_level
      ORDER BY 
        oma.proficiency_level DESC, -- Prefer expert operators
        current_workload ASC,       -- Prefer less busy resources
        m.id ASC                    -- Stable sort
    `;
    
    const candidates = await this.pool.query(query, [dateString]);
    
    console.log(`Found ${candidates.rows.length} initial candidates for operation requiring machine_id: ${operation.machine_id}, machine_group_id: ${operation.machine_group_id}`);
    console.log('Candidates:', JSON.stringify(candidates.rows, null, 2));
    
    // Filter candidates that can substitute for required machine/group
    const validCandidates = [];
    for (const candidate of candidates.rows) {
      const canSubstitute = await this.canMachineSubstitute(
        operation.machine_id,
        operation.machine_group_id,
        candidate.machine_id
      );
      
      console.log(`Machine ${candidate.machine_id} (${candidate.machine_name}) can substitute for required machine ${operation.machine_id}:`, canSubstitute);
      
      if (canSubstitute) {
        validCandidates.push(candidate);
      }
    }
    
    console.log(`Final valid candidates: ${validCandidates.length}`);
    return validCandidates;
  }

  /**
   * Schedule a single job using backward scheduling
   */
  async scheduleJob(jobId, forceReschedule = false) {
    console.log(`Starting to schedule job ${jobId}, forceReschedule: ${forceReschedule}`);
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Get job details with routings
      const jobQuery = `
        SELECT j.*, 
               json_agg(
                 json_build_object(
                   'id', jr.id,
                   'operation_number', jr.operation_number,
                   'operation_name', jr.operation_name,
                   'machine_id', jr.machine_id,
                   'machine_group_id', jr.machine_group_id,
                   'sequence_order', jr.sequence_order,
                   'estimated_hours', jr.estimated_hours,
                   'notes', jr.notes
                 ) ORDER BY jr.sequence_order
               ) as routings
        FROM jobs j
        LEFT JOIN job_routings jr ON j.id = jr.job_id
        WHERE j.id = $1
        GROUP BY j.id
      `;
      
      const jobResult = await client.query(jobQuery, [jobId]);
      const job = jobResult.rows[0];
      
      console.log('Job data:', JSON.stringify(job, null, 2));
      
      if (!job) {
        throw new Error('Job not found');
      }
      
      if (!job.routings || job.routings[0] === null) {
        throw new Error('Job has no routings defined');
      }
      
      // Check if already scheduled and not forcing reschedule
      if (job.auto_scheduled && !forceReschedule) {
        return { success: true, message: 'Job already scheduled', job_id: jobId };
      }
      
      // Calculate priority score
      const priorityScore = await this.calculatePriorityScore(job);
      
      // Determine scheduling dates
      const promisedDate = job.promised_date || job.due_date;
      if (!promisedDate) {
        throw new Error('Job must have a promised date or due date for scheduling');
      }
      
      const idealStartDate = this.calculateBackwardSchedule(promisedDate, job.lead_time_days || 28);
      
      // Clear existing schedule if rescheduling
      if (forceReschedule) {
        await client.query('DELETE FROM schedule_slots WHERE job_id = $1', [jobId]);
      }
      
      const scheduledOperations = [];
      let currentStartDate = idealStartDate;
      
      // Schedule each operation in sequence
      for (let i = 0; i < job.routings.length; i++) {
        const operation = job.routings[i];
        const durationMinutes = Math.ceil((operation.estimated_hours || 0) * 60);
        
        // Skip operations with 0 duration (INSPECT, OUTSOURCE, etc.)
        if (durationMinutes === 0) {
          scheduledOperations.push({
            ...operation,
            scheduled: false,
            reason: 'Zero duration operation'
          });
          continue;
        }
        
        // Find best machine-operator pair
        const candidates = await this.findBestMachineOperatorPair(operation, currentStartDate);
        
        if (candidates.length === 0) {
          throw new Error(`No suitable machine-operator pair found for operation ${operation.operation_number}`);
        }
        
        // Try to schedule with each candidate
        let scheduled = false;
        for (const candidate of candidates) {
          const availableSlots = await this.findAvailableSlots(
            candidate.machine_id,
            candidate.employee_id,
            durationMinutes,
            currentStartDate,
            jobId
          );
          
          if (availableSlots.length > 0) {
            const scheduleSlots = [];
            let lastEndTime = null;
            
            // For single operations, use only the first (best) slot
            // For chunked operations, use all chunks
            const slotsToSchedule = availableSlots[0]?.is_chunked ? availableSlots : [availableSlots[0]];
            
            console.log(`Scheduling ${slotsToSchedule.length} slots for operation ${operation.operation_number} (${operation.operation_name}) on machine ${candidate.machine_name}`);
            
            // Handle both single slots and chunked operations
            for (let slotIndex = 0; slotIndex < slotsToSchedule.length; slotIndex++) {
              const slot = slotsToSchedule[slotIndex];
              
              // Create schedule slot for each chunk
              const notes = slot.is_chunked ? 
                `${operation.notes || ''} (Chunk ${slot.chunk_sequence}/${slotsToSchedule.length})`.trim() :
                operation.notes;
              
              const scheduleResult = await client.query(`
                INSERT INTO schedule_slots (
                  job_id, job_routing_id, machine_id, employee_id,
                  start_datetime, end_datetime, duration_minutes,
                  slot_date, time_slot, status, scheduling_method,
                  priority_score, sequence_order, notes
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
                RETURNING *
              `, [
                jobId, operation.id, candidate.machine_id, candidate.employee_id,
                slot.start_datetime, slot.end_datetime, slot.duration_minutes,
                slot.slot_date, slot.start_slot, 'scheduled', 'auto',
                priorityScore, operation.sequence_order, notes
              ]);
              
              scheduleSlots.push(scheduleResult.rows[0]);
              lastEndTime = new Date(slot.end_datetime);
              
              console.log(`Created schedule slot ${scheduleResult.rows[0].id}: ${slot.duration_minutes} minutes on ${slot.slot_date}`);
            }
            
            scheduledOperations.push({
              ...operation,
              scheduled: true,
              schedule_slots: scheduleSlots, // Array of slots for chunked operations
              machine_name: candidate.machine_name,
              employee_name: candidate.employee_name,
              is_chunked: availableSlots[0]?.is_chunked || false,
              total_chunks: availableSlots.length
            });
            
            // Update current start date for next operation (use last chunk end time)
            currentStartDate = lastEndTime || new Date(availableSlots[0].end_datetime);
            scheduled = true;
            break;
          }
        }
        
        if (!scheduled) {
          throw new Error(`Could not find available slot for operation ${operation.operation_number}`);
        }
      }
      
      // Update job as scheduled
      await client.query(`
        UPDATE jobs 
        SET auto_scheduled = true, 
            priority_score = $2, 
            start_date = $3,
            status = 'scheduled',
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `, [jobId, priorityScore, idealStartDate]);
      
      await client.query('COMMIT');
      
      return {
        success: true,
        job_id: jobId,
        priority_score: priorityScore,
        start_date: idealStartDate,
        operations_scheduled: scheduledOperations.length,
        scheduled_operations: scheduledOperations
      };
      
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error scheduling job:', error);
      
      // Log scheduling conflict
      await client.query(`
        INSERT INTO scheduling_conflicts (
          conflict_type, job_id, description, resolved
        ) VALUES ($1, $2, $3, false)
      `, ['scheduling_error', jobId, error.message]);
      
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Auto-schedule all pending jobs
   */
  async autoScheduleAllJobs() {
    // Get all pending jobs ordered by priority
    const jobsQuery = `
      SELECT j.id, j.job_number, j.customer_name, j.due_date, j.promised_date, j.priority
      FROM jobs j
      WHERE j.status = 'pending' 
        AND j.id IN (SELECT DISTINCT job_id FROM job_routings WHERE job_id IS NOT NULL)
      ORDER BY j.priority ASC, j.created_at ASC, j.job_number ASC
    `;
    
    const jobsResult = await this.pool.query(jobsQuery);
    const results = [];
    
    for (const job of jobsResult.rows) {
      try {
        const result = await this.scheduleJob(job.id);
        results.push({ job_number: job.job_number, ...result });
      } catch (error) {
        results.push({
          job_number: job.job_number,
          success: false,
          error: error.message
        });
      }
    }
    
    return results;
  }
}

module.exports = SchedulingService;