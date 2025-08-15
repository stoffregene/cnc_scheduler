const { Pool } = require('pg');
const ConflictPreventionService = require('./conflictPreventionService');

class SchedulingService {
  constructor(pool) {
    this.pool = pool;
    this.conflictPrevention = new ConflictPreventionService(pool);
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
    // For overnight shifts, duration_hours might be negative - use absolute value
    const maxDailyMinutes = Math.floor(Math.abs(workingHours.duration_hours) * 60);
    
    console.log(`Operation needs ${durationMinutes} minutes, operator ${employeeId} can work ${maxDailyMinutes} minutes/day (${Math.abs(workingHours.duration_hours)}h shift)`);
    
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
    
    // Convert decimal hours to proper time comparison
    // For example: 4.0 becomes 4:00, 15.5 becomes 15:30
    const startTimeDecimal = parseFloat(workingHours.start_hour);
    const endTimeDecimal = parseFloat(workingHours.end_hour);
    
    // Handle overnight shifts (e.g., 18 to 6 means 6 PM to 6 AM next day)
    const shiftCondition = workingHours.is_overnight ? 
      `((EXTRACT(hour FROM ($3::timestamp + interval '15 minutes' * s.slot)) + EXTRACT(minute FROM ($3::timestamp + interval '15 minutes' * s.slot))/60.0) >= ${startTimeDecimal} OR 
        (EXTRACT(hour FROM ($3::timestamp + interval '15 minutes' * s.slot)) + EXTRACT(minute FROM ($3::timestamp + interval '15 minutes' * s.slot))/60.0) < ${endTimeDecimal})` :
      `(EXTRACT(hour FROM ($3::timestamp + interval '15 minutes' * s.slot)) + EXTRACT(minute FROM ($3::timestamp + interval '15 minutes' * s.slot))/60.0) >= ${startTimeDecimal} 
       AND (EXTRACT(hour FROM ($3::timestamp + interval '15 minutes' * s.slot)) + EXTRACT(minute FROM ($3::timestamp + interval '15 minutes' * s.slot))/60.0) < ${endTimeDecimal}`;
    
    const query = `
      WITH RECURSIVE time_slots AS (
        -- Generate all possible time slots starting from the preferred start time
        SELECT 
          $3::timestamp + interval '15 minutes' * s.slot as slot_datetime,
          s.slot as slot_number,
          ($3::timestamp + interval '15 minutes' * s.slot)::date as slot_date
        FROM generate_series(0, 96 * 60 - 1) as s(slot) -- 60 days * 96 slots per day  
        WHERE ($3::timestamp + interval '15 minutes' * s.slot) BETWEEN $3 AND $4
        AND (
          -- Check if employee works on this day
          SELECT is_working_day FROM get_employee_working_hours($2, ($3::timestamp + interval '15 minutes' * s.slot)::date)
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
    
    const startHour = Math.floor(startTimeDecimal);
    const startMinute = Math.round((startTimeDecimal % 1) * 60);
    const endHour = Math.floor(endTimeDecimal);
    const endMinute = Math.round((endTimeDecimal % 1) * 60);
    console.log(`Looking for ${slotsNeeded} consecutive slots for employee ${employeeId} working ${startHour}:${startMinute.toString().padStart(2, '0')}-${endHour}:${endMinute.toString().padStart(2, '0')}`);
    
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
    let totalDaysSearched = 0;
    const MAX_SEARCH_DAYS = 180; // Circuit breaker: max 6 months search
    
    console.log(`Chunking ${durationMinutes} minutes for employee ${employeeId} across multiple days, starting from ${currentDate.toISOString()}`);
    
    while (remainingMinutes > 0 && totalDaysSearched < MAX_SEARCH_DAYS) {
      // Get operator's working hours for this specific date
      const workingHours = await this.getOperatorWorkingHours(employeeId, currentDate);
      
      if (!workingHours.is_working_day) {
        console.log(`Employee ${employeeId} not working on ${currentDate.toDateString()}, skipping to next day`);
        currentDate.setDate(currentDate.getDate() + 1);
        continue;
      }
      
      const maxDailyMinutes = Math.floor(Math.abs(workingHours.duration_hours) * 60);
      const chunkSize = Math.min(remainingMinutes, maxDailyMinutes);
      
      const startHour = Math.floor(parseFloat(workingHours.start_hour));
      const startMinute = Math.round((parseFloat(workingHours.start_hour) % 1) * 60);
      const endHour = Math.floor(parseFloat(workingHours.end_hour));
      const endMinute = Math.round((parseFloat(workingHours.end_hour) % 1) * 60);
      console.log(`Employee ${employeeId} works ${startHour}:${startMinute.toString().padStart(2, '0')}-${endHour}:${endMinute.toString().padStart(2, '0')} (${workingHours.duration_hours}h) on ${currentDate.toDateString()}`);
      console.log(`Looking for ${chunkSize} minute chunk (${(chunkSize/60).toFixed(1)}h)`);
      
      // Set the search start time to the maximum of employee's shift start and preferred start date
      const shiftStartDate = new Date(currentDate);
      shiftStartDate.setHours(startHour, startMinute, 0, 0);
      
      // Use the later of the two times: shift start or required minimum start time
      const effectiveStartDate = preferredStartDate > shiftStartDate ? preferredStartDate : shiftStartDate;
      
      console.log(`📅 Shift starts at: ${shiftStartDate.toISOString()}`);
      console.log(`⏰ Minimum required start: ${preferredStartDate.toISOString()}`);
      console.log(`🎯 Effective start time: ${effectiveStartDate.toISOString()}`);
      
      // Find available slot for this chunk within the operator's shift
      const availableSlots = await this.findConsecutiveSlots(
        machineId, 
        employeeId, 
        chunkSize, 
        effectiveStartDate, 
        excludeJobId
      );
      
      if (availableSlots.length === 0) {
        console.log(`No available slots found for employee ${employeeId} on ${currentDate.toDateString()}, trying next working day`);
        
        // If we've tried too many days, this employee isn't viable - skip to next candidate
        totalDaysSearched++;
        if (totalDaysSearched >= 30) { // Limit to 30 days search for any single employee
          console.warn(`Giving up on employee ${employeeId} after searching ${totalDaysSearched} days - no slots available`);
          break;
        }
        
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
      
      // For proper chunk times, calculate the actual end time based on the chunk size
      const chunkStartTime = new Date(slot.start_datetime);
      const chunkEndTime = new Date(chunkStartTime.getTime() + chunkSize * 60 * 1000);
      
      chunks.push({
        start_datetime: chunkStartTime,
        end_datetime: chunkEndTime,
        slot_date: slot.slot_date,
        start_slot: slot.start_slot,
        duration_minutes: chunkSize,
        chunk_sequence: chunks.length + 1,
        is_chunked: true,
        shift_hours: `${startHour}:${startMinute.toString().padStart(2, '0')}-${endHour}:${endMinute.toString().padStart(2, '0')}`
      });
      
      remainingMinutes -= chunkSize;
      
      console.log(`Chunk ${chunks.length} scheduled: ${chunkSize} minutes (${(chunkSize/60).toFixed(1)}h) from ${chunkStartTime.toISOString()} to ${chunkEndTime.toISOString()}. Remaining: ${remainingMinutes} minutes (${(remainingMinutes/60).toFixed(1)}h)`);
      
      // Move to next working day for this employee (ensure we start fresh the next day)
      currentDate = new Date(chunkEndTime);
      currentDate.setDate(currentDate.getDate() + 1);
      currentDate.setHours(0, 0, 0, 0); // Reset to start of next day
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
    
    // If no chunks could be created, this employee isn't viable for this operation
    if (chunks.length === 0) {
      console.warn(`No chunks created for employee ${employeeId} - unable to schedule operation`);
    }
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
   * Prioritizes: 1) Original quoted machine, 2) Machine group members, 3) Best operator ranking
   */
  async findBestMachineOperatorPair(operation, preferredStartDate) {
    // Convert preferred start date to date string
    const dateString = preferredStartDate.toISOString().split('T')[0];
    
    // Step 1: Try original quoted machine first (if specified)
    if (operation.machine_id) {
      const originalMachineQuery = `
        SELECT 
          m.id as machine_id,
          m.name as machine_name,
          m.efficiency_modifier,
          e.id as employee_id,
          e.first_name || ' ' || e.last_name as employee_name,
          oma.proficiency_level,
          oma.preference_rank,
          COUNT(ss.id) as current_workload,
          'original' as selection_reason
        FROM machines m
        JOIN operator_machine_assignments oma ON m.id = oma.machine_id
        JOIN employees e ON oma.employee_id = e.id
        LEFT JOIN schedule_slots ss ON (m.id = ss.machine_id OR e.id = ss.employee_id) 
          AND ss.slot_date = $1::date
          AND ss.status IN ('scheduled', 'in_progress')
        WHERE m.id = $2
          AND m.status = 'active'
          AND e.status = 'active'
        GROUP BY m.id, m.name, m.efficiency_modifier, e.id, e.first_name, e.last_name, oma.proficiency_level, oma.preference_rank
        ORDER BY 
          oma.preference_rank ASC,    -- 1st choice operator first
          oma.proficiency_level DESC, -- Then highest proficiency
          current_workload ASC        -- Then least busy
      `;
      
      const originalCandidates = await this.pool.query(originalMachineQuery, [dateString, operation.machine_id]);
      
      if (originalCandidates.rows.length > 0) {
        console.log(`Found ${originalCandidates.rows.length} operators for original machine ${operation.machine_id}`);
        return originalCandidates.rows;
      }
    }
    
    // Step 2: If no operators on original machine OR machine group is specified, find group alternatives
    if (operation.machine_group_id) {
      const groupMachineQuery = `
        SELECT 
          m.id as machine_id,
          m.name as machine_name,
          m.efficiency_modifier,
          e.id as employee_id,
          e.first_name || ' ' || e.last_name as employee_name,
          oma.proficiency_level,
          oma.preference_rank,
          COUNT(ss.id) as current_workload,
          -- Priority score: lower is better (higher priority)
          -- Factors: operator preference, proficiency, workload, efficiency
          (oma.preference_rank * 100) + 
          (CASE oma.proficiency_level 
            WHEN 'certified' THEN 0 
            WHEN 'expert' THEN 10 
            WHEN 'trained' THEN 20 
            ELSE 30 
          END) + 
          (COUNT(ss.id) * 5) +  -- Workload penalty
          ((2.0 - COALESCE(m.efficiency_modifier, 1.0)) * 50) as priority_score, -- Efficiency bonus
          'group_member' as selection_reason
        FROM machines m
        JOIN machine_group_assignments mga ON m.id = mga.machine_id
        JOIN operator_machine_assignments oma ON m.id = oma.machine_id
        JOIN employees e ON oma.employee_id = e.id
        LEFT JOIN schedule_slots ss ON (m.id = ss.machine_id OR e.id = ss.employee_id) 
          AND ss.slot_date = $1::date
          AND ss.status IN ('scheduled', 'in_progress')
        WHERE mga.machine_group_id = $2
          AND m.status = 'active'
          AND e.status = 'active'
          AND m.id != COALESCE($3, -1) -- Exclude original machine (already tried)
        GROUP BY m.id, m.name, m.efficiency_modifier, e.id, e.first_name, e.last_name, oma.proficiency_level, oma.preference_rank
        ORDER BY 
          priority_score ASC,         -- Best overall priority first
          m.id ASC                    -- Stable sort for ties
      `;
      
      const groupCandidates = await this.pool.query(groupMachineQuery, [dateString, operation.machine_group_id, operation.machine_id]);
      
      if (groupCandidates.rows.length > 0) {
        console.log(`Found ${groupCandidates.rows.length} operators in machine group ${operation.machine_group_id}`);
        
        // Log priority scoring details for first few candidates
        const topCandidates = groupCandidates.rows.slice(0, 3);
        console.log('Top machine-operator combinations by priority:');
        topCandidates.forEach((candidate, index) => {
          console.log(`  ${index + 1}. ${candidate.machine_name} + ${candidate.employee_name}:`);
          console.log(`     - Preference: ${candidate.preference_rank}, Proficiency: ${candidate.proficiency_level}`);
          console.log(`     - Workload: ${candidate.current_workload}, Efficiency: ${candidate.efficiency_modifier || 1.00}x`);
          console.log(`     - Priority Score: ${candidate.priority_score}`);
        });
        
        return groupCandidates.rows;
      }
    }
    
    // Step 3: Fallback to any available machine-operator combo (shouldn't normally happen)
    console.warn(`No candidates found for machine ${operation.machine_id} or group ${operation.machine_group_id}, falling back to all available`);
    
    const fallbackQuery = `
      SELECT 
        m.id as machine_id,
        m.name as machine_name,
        e.id as employee_id,
        e.first_name || ' ' || e.last_name as employee_name,
        oma.proficiency_level,
        oma.preference_rank,
        COUNT(ss.id) as current_workload,
        'fallback' as selection_reason
      FROM machines m
      JOIN operator_machine_assignments oma ON m.id = oma.machine_id
      JOIN employees e ON oma.employee_id = e.id
      LEFT JOIN schedule_slots ss ON (m.id = ss.machine_id OR e.id = ss.employee_id) 
        AND ss.slot_date = $1::date
        AND ss.status IN ('scheduled', 'in_progress')
      WHERE m.status = 'active'
        AND e.status = 'active'
      GROUP BY m.id, m.name, e.id, e.first_name, e.last_name, oma.proficiency_level, oma.preference_rank
      ORDER BY 
        oma.preference_rank ASC,
        oma.proficiency_level DESC,
        current_workload ASC,
        m.id ASC
    `;
    
    const fallbackCandidates = await this.pool.query(fallbackQuery, [dateString]);
    console.log(`Fallback candidates: ${fallbackCandidates.rows.length}`);
    return fallbackCandidates.rows;
  }

  /**
   * Schedule a single job using backward scheduling (or forward if force_start_date provided)
   */
  async scheduleJob(jobId, forceReschedule = false, forceStartDate = null, isPartial = false, startFromSequence = null) {
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
      
      // Check assembly dependencies - don't schedule if dependencies aren't met
      const dependencyCheck = await client.query(`
        SELECT * FROM can_job_be_scheduled($1)
      `, [jobId]);
      
      const canSchedule = dependencyCheck.rows[0]?.can_schedule;
      const blockingJobs = dependencyCheck.rows[0]?.blocking_job_numbers || [];
      
      if (!canSchedule) {
        console.log(`🚫 Cannot schedule job ${jobId}. Blocking jobs: ${blockingJobs.join(', ')}`);
        return { 
          success: false, 
          message: `Cannot schedule job - dependencies not met. Complete these jobs first: ${blockingJobs.join(', ')}`,
          job_id: jobId,
          blocking_jobs: blockingJobs,
          dependency_blocked: true
        };
      }
      
      console.log(`✅ Job ${jobId} dependencies satisfied, proceeding with scheduling`);
      
      // Calculate priority score
      const priorityScore = await this.calculatePriorityScore(job);
      
      // Determine scheduling dates based on whether we're doing forward or backward scheduling
      let currentStartDate;
      const today = new Date();
      today.setHours(0, 0, 0, 0); // Start of today
      
      if (forceStartDate) {
        // Forward scheduling: Start from the specified date (manual reschedule)
        currentStartDate = new Date(forceStartDate);
        console.log(`🔜 Forward scheduling: Starting from forced date ${currentStartDate.toISOString()}`);
      } else {
        // Backward scheduling: Calculate start from promised/due date (auto scheduler)  
        const promisedDate = job.promised_date || job.due_date;
        if (!promisedDate) {
          throw new Error('Job must have a promised date or due date for scheduling');
        }
        const calculatedStartDate = this.calculateBackwardSchedule(promisedDate, job.lead_time_days || 28);
        
        // If calculated start date is in the past, use today instead
        if (calculatedStartDate < today) {
          currentStartDate = today;
          console.log(`⚠️ Calculated start date ${calculatedStartDate.toISOString()} is in the past. Using today ${currentStartDate.toISOString()} instead.`);
        } else {
          currentStartDate = calculatedStartDate;
          console.log(`🔙 Backward scheduling: Starting from calculated date ${currentStartDate.toISOString()}`);
        }
      }
      
      // Clear existing schedule if rescheduling
      if (forceReschedule) {
        if (isPartial && startFromSequence) {
          // For partial reschedules, only delete operations from the specified sequence onwards
          await client.query(`
            DELETE FROM schedule_slots 
            WHERE job_id = $1 
            AND job_routing_id IN (
              SELECT id FROM job_routings 
              WHERE job_id = $1 AND sequence_order >= $2
            )
          `, [jobId, startFromSequence]);
          console.log(`🔄 Partial reschedule: Deleted operations with sequence_order >= ${startFromSequence}`);
        } else {
          // Full reschedule: delete all operations
          await client.query('DELETE FROM schedule_slots WHERE job_id = $1', [jobId]);
          console.log(`🔄 Full reschedule: Deleted all operations`);
        }
      }
      
      const scheduledOperations = [];
      
      // Schedule each operation in sequence ORDER
      // For partial reschedules, start from the specified sequence
      const startIndex = isPartial && startFromSequence ? 
        job.routings.findIndex(op => op.sequence_order >= startFromSequence) : 0;
      
      for (let i = startIndex; i < job.routings.length; i++) {
        const operation = job.routings[i];
        
        // Skip if this is a partial reschedule and we haven't reached the target sequence yet
        if (isPartial && startFromSequence && operation.sequence_order < startFromSequence) {
          continue;
        }
        
        // CRITICAL: For sequence-dependent operations, ensure previous operation is completed
        if (i > 0 || (isPartial && operation.sequence_order > 1)) {
          let previousOperation;
          
          if (isPartial && startFromSequence && operation.sequence_order > startFromSequence) {
            // For partial reschedules, look at the previous operation in the scheduled list
            previousOperation = scheduledOperations[scheduledOperations.length - 1];
          } else if (isPartial && operation.sequence_order === startFromSequence) {
            // For the first operation in a partial reschedule, get the last scheduled operation from database
            const prevOpResult = await client.query(`
              SELECT ss.end_datetime, jr.operation_name, jr.sequence_order
              FROM schedule_slots ss
              JOIN job_routings jr ON ss.job_routing_id = jr.id
              WHERE ss.job_id = $1 AND jr.sequence_order < $2
              ORDER BY jr.sequence_order DESC, ss.end_datetime DESC
              LIMIT 1
            `, [jobId, startFromSequence]);
            
            if (prevOpResult.rows.length > 0) {
              previousOperation = {
                scheduled: true,
                schedule_slots: [{ end_datetime: prevOpResult.rows[0].end_datetime }],
                operation_name: prevOpResult.rows[0].operation_name,
                sequence_order: prevOpResult.rows[0].sequence_order
              };
            }
          } else {
            // Normal case: use the previous operation in the array
            previousOperation = scheduledOperations[i - 1];
          }
          if (previousOperation && previousOperation.scheduled) {
            // Find the latest end time of all chunks from the previous operation
            const lastSlot = previousOperation.schedule_slots[previousOperation.schedule_slots.length - 1];
            const previousEndTime = new Date(lastSlot.end_datetime);
            
            // Check if previous operation was SAW or waterjet (requires 24hr lag time)
            const previousOpName = previousOperation.operation_name?.toLowerCase() || '';
            const isSawOrWaterjet = previousOpName.includes('saw') || previousOpName.includes('waterjet') || previousOpName.includes('wj');
            
            let minimumStartTime;
            if (isSawOrWaterjet) {
              // 24-hour lag time for SAW/waterjet operations
              minimumStartTime = new Date(previousEndTime.getTime() + 24 * 60 * 60 * 1000); // 24 hours
              console.log(`🔧 SAW/Waterjet operation detected: ${previousOperation.operation_name}. Adding 24-hour lag time.`);
            } else {
              // Standard 15-minute buffer for other operations
              minimumStartTime = new Date(previousEndTime.getTime() + 15 * 60 * 1000); // 15 minutes
            }
            
            // Ensure current operation starts AFTER the minimum required time
            if (currentStartDate < minimumStartTime) {
              currentStartDate = minimumStartTime;
              const lagHours = isSawOrWaterjet ? 24 : 0.25;
              console.log(`⏰ Operation ${operation.operation_number} delayed to ${currentStartDate.toISOString()} to wait ${lagHours} hours after operation ${previousOperation.operation_number}`);
            }
          }
        }
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
          
          // Check if we got valid slots back (not empty due to scheduling failures)
          if (availableSlots.length > 0) {
            const scheduleSlots = [];
            let lastEndTime = null;
            
            // For single operations, use only the first (best) slot
            // For chunked operations, use all chunks
            const slotsToSchedule = availableSlots[0]?.is_chunked ? availableSlots : [availableSlots[0]];
            
            console.log(`Scheduling ${slotsToSchedule.length} slots for operation ${operation.operation_number} (${operation.operation_name}) on machine ${candidate.machine_name}`);
            
            // VALIDATE EACH SLOT BEFORE SCHEDULING
            let validationPassed = true;
            for (const slot of slotsToSchedule) {
              const proposedSlot = {
                job_id: jobId,
                job_routing_id: operation.id,
                machine_id: candidate.machine_id,
                employee_id: candidate.employee_id,
                start_datetime: slot.start_datetime,
                end_datetime: slot.end_datetime
              };
              
              console.log(`Validating slot: ${slot.start_datetime} to ${slot.end_datetime} for operation ${operation.operation_name}`);
              
              const validation = await this.conflictPrevention.validateProposedSlot(proposedSlot);
              
              if (!validation.isValid) {
                console.log(`❌ Validation failed for operation ${operation.operation_number}:`, validation.conflicts);
                
                // Critical conflicts (like sequence violations) prevent scheduling
                const criticalConflicts = validation.conflicts.filter(c => c.severity === 'critical');
                if (criticalConflicts.length > 0) {
                  validationPassed = false;
                  break;
                }
              } else {
                console.log(`✅ Validation passed for operation ${operation.operation_number}`);
              }
            }
            
            if (!validationPassed) {
              console.log(`Skipping candidate ${candidate.machine_name} due to validation failures`);
              continue; // Try next candidate
            }
            
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
            // For sequence-dependent operations, next operation must start AFTER this one ends
            const finalEndTime = lastEndTime || new Date(availableSlots[0].end_datetime);
            currentStartDate = new Date(finalEndTime.getTime() + 15 * 60 * 1000); // Add 15 minutes buffer
            
            console.log(`Next operation will start after: ${currentStartDate.toISOString()}`);
            scheduled = true;
            break;
          }
        }
        
        if (!scheduled) {
          console.error(`❌ Could not find available slot for operation ${operation.operation_number} (${operation.operation_name}) after trying ${candidates.length} candidates`);
          throw new Error(`Could not find available slot for operation ${operation.operation_number} - no suitable machine-operator combinations available`);
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
      `, [jobId, priorityScore, currentStartDate]);
      
      await client.query('COMMIT');
      
      return {
        success: true,
        job_id: jobId,
        priority_score: priorityScore,
        start_date: currentStartDate,
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