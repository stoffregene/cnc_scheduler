const { Pool } = require('pg');
const SchedulingService = require('./schedulingService');
const UndoService = require('./undoService');

class DisplacementService {
  constructor(pool) {
    this.pool = pool;
    this.schedulingService = new SchedulingService(pool);
    this.undoService = new UndoService(pool);
    this.DISPLACEMENT_THRESHOLD = 0.15; // 15% priority difference required
    this.FIRM_ZONE_DAYS = 14; // Days before promise date that becomes "firm"
    this.MAX_DISPLACEMENT_ATTEMPTS = 100; // Prevent infinite loops
  }

  /**
   * Check if Job A can displace Job B based on priority and business rules
   * @param {Object} jobA - Higher priority job wanting to displace
   * @param {Object} jobB - Lower priority job being displaced
   * @returns {Object} { canDisplace: boolean, reason: string }
   */
  canDisplace(jobA, jobB) {
    // Rule 1: Priority threshold check (15% difference required)
    const priorityDifference = (jobA.priority_score - jobB.priority_score) / jobB.priority_score;
    if (priorityDifference < this.DISPLACEMENT_THRESHOLD) {
      return {
        canDisplace: false,
        reason: `Insufficient priority difference: ${(priorityDifference * 100).toFixed(1)}% (need ${this.DISPLACEMENT_THRESHOLD * 100}%)`
      };
    }

    // Rule 2: Firm zone protection - check if Job B is within firm zone
    if (this.isInFirmZone(jobB)) {
      return {
        canDisplace: false,
        reason: `Job ${jobB.job_number} is in firm zone (${this.FIRM_ZONE_DAYS} days from promise date)`
      };
    }

    // Rule 3: Lock protection - cannot displace locked jobs
    if (jobB.schedule_locked) {
      return {
        canDisplace: false,
        reason: `Job ${jobB.job_number} is locked: ${jobB.lock_reason || 'Started operation'}`
      };
    }

    return {
      canDisplace: true,
      reason: `Priority difference: ${(priorityDifference * 100).toFixed(1)}%`
    };
  }

  /**
   * Check if a job is in the firm zone (too close to promise date)
   * @param {Object} job - Job to check
   * @returns {boolean} True if in firm zone
   */
  isInFirmZone(job) {
    if (!job.promised_date) return false;
    
    const promiseDate = new Date(job.promised_date);
    const today = new Date();
    const daysUntilPromise = Math.ceil((promiseDate - today) / (1000 * 60 * 60 * 24));
    
    return daysUntilPromise <= this.FIRM_ZONE_DAYS;
  }

  /**
   * Find jobs that can be displaced by a new high-priority job
   * @param {number} newJobId - ID of the new high-priority job
   * @param {Date} requiredStartDate - When the new job needs to start
   * @param {number} requiredHours - How many hours needed
   * @returns {Array} List of displacement opportunities
   */
  async findDisplacementOpportunities(newJobId, requiredStartDate, requiredHours) {
    try {
      // Get the new job's priority information
      const newJobResult = await this.pool.query(`
        SELECT id, job_number, priority_score, promised_date, customer_name
        FROM jobs 
        WHERE id = $1
      `, [newJobId]);

      if (newJobResult.rows.length === 0) {
        throw new Error(`Job ${newJobId} not found`);
      }

      const newJob = newJobResult.rows[0];

      // Find currently scheduled jobs that could potentially be displaced
      const candidatesResult = await this.pool.query(`
        SELECT DISTINCT
          j.id, j.job_number, j.priority_score, j.promised_date, 
          j.customer_name, j.schedule_locked, j.lock_reason,
          ss.id as slot_id, ss.start_datetime, ss.end_datetime, ss.machine_id, ss.locked as slot_locked,
          m.name as machine_name,
          EXTRACT(EPOCH FROM (ss.end_datetime - ss.start_datetime))/3600 as slot_hours
        FROM jobs j
        JOIN schedule_slots ss ON j.id = ss.job_id
        JOIN machines m ON ss.machine_id = m.id
        WHERE ss.start_datetime >= $1
          AND (ss.locked IS NULL OR ss.locked = false)
          AND j.schedule_locked = false
          AND j.priority_score < $2
        ORDER BY j.priority_score ASC, ss.start_datetime ASC
      `, [requiredStartDate, newJob.priority_score]);

      const opportunities = [];
      let cumulativeHours = 0;

      for (const candidate of candidatesResult.rows) {
        const displacement = this.canDisplace(newJob, candidate);
        
        if (displacement.canDisplace) {
          opportunities.push({
            displacedJob: candidate,
            reason: displacement.reason,
            hoursFreed: candidate.slot_hours,
            slotId: candidate.slot_id,
            machine: candidate.machine_name,
            originalStartTime: candidate.start_datetime,
            originalEndTime: candidate.end_datetime
          });

          cumulativeHours += candidate.slot_hours;

          // Stop when we have enough hours
          if (cumulativeHours >= requiredHours) {
            break;
          }
        }
      }

      return {
        newJob,
        requiredHours,
        totalHoursAvailable: cumulativeHours,
        sufficient: cumulativeHours >= requiredHours,
        opportunities
      };

    } catch (error) {
      console.error('Error finding displacement opportunities:', error);
      throw error;
    }
  }

  /**
   * Execute displacement by moving lower priority jobs and scheduling the higher priority one
   * @param {number} newJobId - Job to schedule
   * @param {Array} displacements - List of jobs to displace
   * @param {Object} options - Scheduling options
   * @returns {Object} Displacement result
   */
  async executeDisplacement(newJobId, displacements, options = {}) {
    const startTime = Date.now();
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');

      // Get trigger job information
      const triggerJobResult = await client.query(`
        SELECT job_number FROM jobs WHERE id = $1
      `, [newJobId]);
      
      const triggerJobNumber = triggerJobResult.rows[0]?.job_number || 'Unknown';

      // Create displacement log entry
      const logResult = await client.query(`
        INSERT INTO displacement_logs (trigger_job_id, trigger_job_number, total_displaced)
        VALUES ($1, $2, $3)
        RETURNING id
      `, [newJobId, triggerJobNumber, displacements.length]);
      
      const logId = logResult.rows[0].id;
      const displacedJobs = [];
      const rescheduledJobs = [];
      let totalHoursFreed = 0;
      const customersAffected = new Set();
      const machinesAffected = new Set();

      // Step 1: Unschedule displaced jobs and log details
      for (const displacement of displacements) {
        const jobId = displacement.displacedJob.id;
        const slotId = displacement.slotId;
        
        // Remove specific schedule slot
        await client.query(`
          DELETE FROM schedule_slots 
          WHERE id = $1 AND locked = false
        `, [slotId]);

        // Check if job has any remaining slots
        const remainingSlots = await client.query(`
          SELECT COUNT(*) as count FROM schedule_slots WHERE job_id = $1
        `, [jobId]);

        // If no more slots, mark job as pending
        if (parseInt(remainingSlots.rows[0].count) === 0) {
          await client.query(`
            UPDATE jobs 
            SET status = 'pending', auto_scheduled = false
            WHERE id = $1
          `, [jobId]);
        }

        // Log displacement details
        await client.query(`
          INSERT INTO displacement_details (
            displacement_log_id, displaced_job_id, displaced_job_number,
            original_start_time, original_end_time, machine_id, machine_name,
            displacement_reason, hours_freed
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `, [
          logId, jobId, displacement.displacedJob.job_number,
          displacement.originalStartTime, displacement.originalEndTime,
          displacement.displacedJob.machine_id, displacement.machine,
          displacement.reason, displacement.hoursFreed
        ]);

        displacedJobs.push({
          jobId: jobId,
          jobNumber: displacement.displacedJob.job_number,
          reason: displacement.reason,
          originalStartTime: displacement.originalStartTime
        });

        totalHoursFreed += displacement.hoursFreed;
        customersAffected.add(displacement.displacedJob.customer_name);
        machinesAffected.add(displacement.machine);
      }

      // Step 2: Schedule the new high-priority job
      console.log(`🎯 Scheduling displaced job ${newJobId} after freeing ${totalHoursFreed} hours`);
      
      let schedulingSuccess = false;
      try {
        const scheduleResult = await this.schedulingService.scheduleJob(newJobId);
        schedulingSuccess = scheduleResult.success;
        
        if (scheduleResult.success) {
          console.log(`✅ Successfully scheduled trigger job ${triggerJobNumber}`);
        } else {
          console.log(`⚠️ Failed to schedule trigger job: ${scheduleResult.message}`);
        }
      } catch (error) {
        console.error(`❌ Error scheduling trigger job: ${error.message}`);
      }
      
      // Step 3: Attempt to reschedule displaced jobs
      for (const displacement of displacements) {
        const jobId = displacement.displacedJob.id;
        let rescheduleStatus = 'pending';
        let newStartTime = null;
        let delayHours = 0;
        
        try {
          const rescheduleResult = await this.schedulingService.scheduleJob(jobId);
          
          if (rescheduleResult.success) {
            rescheduleStatus = 'rescheduled';
            if (rescheduleResult.scheduledOperations && rescheduleResult.scheduledOperations.length > 0) {
              newStartTime = rescheduleResult.scheduledOperations[0].start_time;
              
              // Calculate delay
              const originalTime = new Date(displacement.originalStartTime);
              const newTime = new Date(newStartTime);
              delayHours = (newTime - originalTime) / (1000 * 60 * 60);
            }
            console.log(`✅ Rescheduled ${displacement.displacedJob.job_number}`);
          } else {
            rescheduleStatus = 'failed';
            console.log(`❌ Failed to reschedule ${displacement.displacedJob.job_number}: ${rescheduleResult.message}`);
          }
        } catch (error) {
          rescheduleStatus = 'error';
          console.error(`❌ Error rescheduling ${displacement.displacedJob.job_number}: ${error.message}`);
        }

        // Update displacement details with reschedule results
        await client.query(`
          UPDATE displacement_details 
          SET reschedule_status = $1, new_start_time = $2, reschedule_delay_hours = $3
          WHERE displacement_log_id = $4 AND displaced_job_id = $5
        `, [rescheduleStatus, newStartTime, delayHours, logId, jobId]);

        rescheduledJobs.push({
          jobId: jobId,
          jobNumber: displacement.displacedJob.job_number,
          status: rescheduleStatus,
          newStartTime: newStartTime,
          delayHours: delayHours
        });
      }

      // Log impact analysis
      await client.query(`
        INSERT INTO displacement_impact (
          displacement_log_id, customers_affected, machines_affected,
          total_hours_displaced, average_delay_days, priority_threshold_used
        ) VALUES ($1, $2, $3, $4, $5, $6)
      `, [
        logId, Array.from(customersAffected), Array.from(machinesAffected),
        totalHoursFreed, this.calculateAverageDelay(displacements), this.DISPLACEMENT_THRESHOLD
      ]);

      // Update log with final results
      const executionTime = Date.now() - startTime;
      const totalRescheduled = rescheduledJobs.filter(j => j.status === 'rescheduled').length;
      
      await client.query(`
        UPDATE displacement_logs 
        SET success = $1, total_rescheduled = $2, execution_time_ms = $3,
            notes = $4
        WHERE id = $5
      `, [
        schedulingSuccess, totalRescheduled, executionTime,
        `Displaced ${displacements.length} jobs, successfully rescheduled ${totalRescheduled}`,
        logId
      ]);
      
      // Create undo operation for this displacement (only if successful)
      if (schedulingSuccess && !options.test) {
        const affectedJobIds = displacements.map(d => d.displacedJob.id);
        affectedJobIds.push(newJobId); // Include the trigger job
        
        const undoResult = await this.undoService.createUndoOperation(
          'displacement',
          `Displacement of ${displacements.length} jobs by job ${triggerJobNumber}`,
          affectedJobIds,
          {
            userAction: 'automatic_displacement',
            displacementLogId: logId,
            metadata: {
              triggerJobId: newJobId,
              triggerJobNumber: triggerJobNumber,
              displacedCount: displacements.length,
              rescheduledCount: totalRescheduled,
              totalHoursFreed: totalHoursFreed
            }
          }
        );
        
        if (undoResult.success) {
          console.log(`✅ Created undo operation ${undoResult.undoOperationId} for displacement ${logId}`);
        } else {
          console.warn(`⚠️ Failed to create undo operation for displacement ${logId}: ${undoResult.error}`);
        }
      }
      
      await client.query('COMMIT');
      
      return {
        success: true,
        logId: logId,
        triggerJobScheduled: schedulingSuccess,
        displacedJobs: displacedJobs,
        rescheduledJobs: rescheduledJobs,
        totalHoursFreed: totalHoursFreed,
        customersAffected: Array.from(customersAffected),
        machinesAffected: Array.from(machinesAffected),
        executionTimeMs: executionTime,
        message: `Successfully displaced ${displacements.length} jobs for higher priority job. Rescheduled: ${totalRescheduled}/${displacements.length}`
      };

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Displacement execution failed:', error);
      return {
        success: false,
        error: error.message
      };
    } finally {
      client.release();
    }
  }

  /**
   * Get displacement history for analysis
   * @param {Object} filters - Filters for displacement history
   * @returns {Array} Displacement history
   */
  async getDisplacementHistory(filters = {}) {
    try {
      const { 
        jobId, 
        fromDate, 
        toDate, 
        successOnly, 
        customerId,
        limit = 50 
      } = filters;

      let query = `
        SELECT 
          dl.id, dl.trigger_job_id, dl.trigger_job_number, dl.timestamp,
          dl.success, dl.total_displaced, dl.total_rescheduled, 
          dl.execution_time_ms, dl.notes,
          di.customers_affected, di.machines_affected, di.total_hours_displaced,
          di.average_delay_days, di.priority_threshold_used,
          j.customer_name as trigger_customer, j.priority_score as trigger_priority
        FROM displacement_logs dl
        LEFT JOIN displacement_impact di ON dl.id = di.displacement_log_id
        LEFT JOIN jobs j ON dl.trigger_job_id = j.id
        WHERE 1=1
      `;

      const params = [];
      let paramCount = 0;

      if (jobId) {
        paramCount++;
        query += ` AND dl.trigger_job_id = $${paramCount}`;
        params.push(jobId);
      }

      if (fromDate) {
        paramCount++;
        query += ` AND dl.timestamp >= $${paramCount}`;
        params.push(fromDate);
      }

      if (toDate) {
        paramCount++;
        query += ` AND dl.timestamp <= $${paramCount}`;
        params.push(toDate);
      }

      if (successOnly) {
        query += ` AND dl.success = true`;
      }

      if (customerId) {
        paramCount++;
        query += ` AND j.customer_name = $${paramCount}`;
        params.push(customerId);
      }

      query += ` ORDER BY dl.timestamp DESC LIMIT $${paramCount + 1}`;
      params.push(limit);

      const result = await this.pool.query(query, params);
      return result.rows;

    } catch (error) {
      console.error('Error getting displacement history:', error);
      throw error;
    }
  }

  /**
   * Get detailed displacement information for a specific log
   * @param {number} logId - Displacement log ID
   * @returns {Object} Detailed displacement information
   */
  async getDisplacementDetails(logId) {
    try {
      const detailsResult = await this.pool.query(`
        SELECT 
          dd.id, dd.displaced_job_id, dd.displaced_job_number,
          dd.original_start_time, dd.original_end_time, dd.machine_name,
          dd.displacement_reason, dd.hours_freed, dd.reschedule_status,
          dd.new_start_time, dd.new_end_time, dd.reschedule_delay_hours,
          j.customer_name as displaced_customer, j.priority_score as displaced_priority
        FROM displacement_details dd
        LEFT JOIN jobs j ON dd.displaced_job_id = j.id
        WHERE dd.displacement_log_id = $1
        ORDER BY dd.original_start_time
      `, [logId]);

      return detailsResult.rows;

    } catch (error) {
      console.error('Error getting displacement details:', error);
      throw error;
    }
  }

  /**
   * Calculate the impact of displacement (what-if analysis)
   * @param {number} newJobId - Job considering displacement
   * @returns {Object} Impact analysis
   */
  async calculateDisplacementImpact(newJobId) {
    try {
      const opportunities = await this.findDisplacementOpportunities(newJobId, new Date(), 8); // 8 hours example
      
      const impact = {
        canDisplace: opportunities.sufficient,
        jobsAffected: opportunities.opportunities.length,
        totalHoursFreed: opportunities.totalHoursAvailable,
        customers: [...new Set(opportunities.opportunities.map(o => o.displacedJob.customer_name))],
        machines: [...new Set(opportunities.opportunities.map(o => o.machine))],
        estimatedDelay: this.calculateAverageDelay(opportunities.opportunities)
      };

      return impact;

    } catch (error) {
      console.error('Error calculating displacement impact:', error);
      return { error: error.message };
    }
  }

  /**
   * Calculate average delay caused by displacement
   * @param {Array} opportunities - Displacement opportunities
   * @returns {number} Average delay in days
   */
  calculateAverageDelay(opportunities) {
    if (opportunities.length === 0) return 0;
    
    // Simple calculation - in reality this would be more sophisticated
    // based on rescheduling algorithm and machine availability
    return Math.ceil(opportunities.length * 0.5); // 0.5 days average delay per displaced job
  }

  /**
   * Attempt to schedule a job with displacement if necessary
   * @param {number} jobId - Job to schedule
   * @param {Object} options - Scheduling options
   * @returns {Object} Scheduling result with displacement information
   */
  async scheduleWithDisplacement(jobId, options = {}) {
    try {
      // First attempt normal scheduling
      console.log(`🎯 Attempting to schedule job ${jobId}...`);
      
      const normalScheduleResult = await this.schedulingService.scheduleJob(jobId);
      
      if (normalScheduleResult.success) {
        console.log(`✅ Job ${jobId} scheduled normally without displacement`);
        return {
          success: true,
          scheduledNormally: true,
          displacementUsed: false,
          result: normalScheduleResult
        };
      }

      // If normal scheduling failed, check if displacement could help
      console.log(`⚠️ Normal scheduling failed: ${normalScheduleResult.message}`);
      console.log(`🔍 Checking displacement opportunities...`);

      // Get job information to determine required resources
      const jobResult = await this.pool.query(`
        SELECT j.*, 
               COALESCE(SUM(jr.estimated_hours), 8) as total_hours
        FROM jobs j
        LEFT JOIN job_routings jr ON j.id = jr.job_id
        WHERE j.id = $1
        GROUP BY j.id
      `, [jobId]);

      if (jobResult.rows.length === 0) {
        return {
          success: false,
          error: `Job ${jobId} not found`
        };
      }

      const job = jobResult.rows[0];
      const requiredStartDate = options.startDate || new Date();
      const requiredHours = job.total_hours;

      // Find displacement opportunities
      const opportunities = await this.findDisplacementOpportunities(
        jobId, 
        requiredStartDate, 
        requiredHours
      );

      if (!opportunities.sufficient) {
        console.log(`❌ Insufficient displacement opportunities found`);
        return {
          success: false,
          displacementChecked: true,
          displacementSufficient: false,
          opportunities: opportunities,
          message: `Cannot schedule job ${job.job_number}. Insufficient displacement opportunities (need ${requiredHours}h, can free ${opportunities.totalHoursAvailable}h)`
        };
      }

      console.log(`✅ Sufficient displacement opportunities found: ${opportunities.opportunities.length} jobs, ${opportunities.totalHoursAvailable}h`);

      // Execute displacement
      const displacementResult = await this.executeDisplacement(jobId, opportunities.opportunities, options);

      return {
        success: displacementResult.success,
        scheduledNormally: false,
        displacementUsed: true,
        displacementResult: displacementResult,
        opportunities: opportunities,
        message: displacementResult.success 
          ? `Job ${job.job_number} scheduled using displacement` 
          : `Displacement failed: ${displacementResult.error}`
      };

    } catch (error) {
      console.error('Error in scheduleWithDisplacement:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get displacement statistics and analytics
   * @param {Object} filters - Time period and other filters
   * @returns {Object} Displacement analytics
   */
  async getDisplacementAnalytics(filters = {}) {
    try {
      const { fromDate, toDate } = filters;
      
      let dateFilter = '';
      const params = [];
      
      if (fromDate && toDate) {
        dateFilter = 'WHERE dl.timestamp BETWEEN $1 AND $2';
        params.push(fromDate, toDate);
      } else if (fromDate) {
        dateFilter = 'WHERE dl.timestamp >= $1';
        params.push(fromDate);
      } else if (toDate) {
        dateFilter = 'WHERE dl.timestamp <= $1';
        params.push(toDate);
      }

      const analyticsResult = await this.pool.query(`
        SELECT 
          COUNT(*) as total_displacements,
          COUNT(CASE WHEN success = true THEN 1 END) as successful_displacements,
          AVG(total_displaced) as avg_jobs_displaced,
          AVG(total_rescheduled) as avg_jobs_rescheduled,
          AVG(execution_time_ms) as avg_execution_time,
          SUM(total_displaced) as total_jobs_displaced,
          SUM(total_rescheduled) as total_jobs_rescheduled
        FROM displacement_logs dl
        ${dateFilter}
      `, params);

      const impactResult = await this.pool.query(`
        SELECT 
          AVG(total_hours_displaced) as avg_hours_displaced,
          AVG(average_delay_days) as avg_delay_days,
          AVG(priority_threshold_used) as avg_threshold_used
        FROM displacement_impact di
        JOIN displacement_logs dl ON di.displacement_log_id = dl.id
        ${dateFilter}
      `, params);

      const customerImpactResult = await this.pool.query(`
        SELECT 
          unnest(customers_affected) as customer,
          COUNT(*) as displacement_count
        FROM displacement_impact di
        JOIN displacement_logs dl ON di.displacement_log_id = dl.id
        ${dateFilter}
        GROUP BY customer
        ORDER BY displacement_count DESC
        LIMIT 10
      `, params);

      return {
        summary: analyticsResult.rows[0],
        impact: impactResult.rows[0],
        topAffectedCustomers: customerImpactResult.rows
      };

    } catch (error) {
      console.error('Error getting displacement analytics:', error);
      throw error;
    }
  }
}

module.exports = DisplacementService;