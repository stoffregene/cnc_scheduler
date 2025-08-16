const { Pool } = require('pg');

class DisplacementService {
  constructor(pool) {
    this.pool = pool;
    this.DISPLACEMENT_THRESHOLD = 0.15; // 15% priority difference required
    this.FIRM_ZONE_DAYS = 14; // Days before promise date that becomes "firm"
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
          ss.start_datetime, ss.end_datetime, ss.machine_id, ss.locked as slot_locked,
          m.name as machine_name,
          EXTRACT(EPOCH FROM (ss.end_datetime - ss.start_datetime))/3600 as slot_hours
        FROM jobs j
        JOIN schedule_slots ss ON j.id = ss.job_id
        JOIN machines m ON ss.machine_id = m.id
        WHERE ss.start_datetime >= $1
          AND ss.status IN ('scheduled', 'pending')
          AND ss.locked = false
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
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');

      const displacementLog = {
        id: Date.now(), // Simple ID for now
        timestamp: new Date(),
        triggerJobId: newJobId,
        displacedJobs: [],
        rescheduledJobs: [],
        success: false
      };

      // Step 1: Unschedule displaced jobs
      for (const displacement of displacements) {
        const jobId = displacement.displacedJob.id;
        
        // Remove from schedule
        await client.query(`
          DELETE FROM schedule_slots 
          WHERE job_id = $1 AND locked = false
        `, [jobId]);

        // Mark job as pending
        await client.query(`
          UPDATE jobs 
          SET status = 'pending'
          WHERE id = $1
        `, [jobId]);

        displacementLog.displacedJobs.push({
          jobId: jobId,
          jobNumber: displacement.displacedJob.job_number,
          reason: displacement.reason,
          originalStartTime: displacement.originalStartTime
        });
      }

      // Step 2: Schedule the new high-priority job
      // (This would integrate with the existing scheduling service)
      
      // Step 3: Attempt to reschedule displaced jobs
      for (const displacement of displacements) {
        // For now, just mark them as needing rescheduling
        // In a full implementation, this would call the scheduling service
        displacementLog.rescheduledJobs.push({
          jobId: displacement.displacedJob.id,
          status: 'pending_reschedule'
        });
      }

      displacementLog.success = true;
      await this.logDisplacement(client, displacementLog);
      
      await client.query('COMMIT');
      
      return {
        success: true,
        displacementLog,
        message: `Successfully displaced ${displacements.length} jobs for higher priority job`
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
   * Log displacement decision for audit trail
   * @param {Object} client - Database client
   * @param {Object} displacementLog - Log entry to save
   */
  async logDisplacement(client, displacementLog) {
    // For now, just console log. In production, this would go to a displacement_log table
    console.log('📋 Displacement Log:', JSON.stringify(displacementLog, null, 2));
  }

  /**
   * Get displacement history for analysis
   * @param {Object} filters - Filters for displacement history
   * @returns {Array} Displacement history
   */
  async getDisplacementHistory(filters = {}) {
    // Placeholder for displacement history retrieval
    // Would query displacement_log table when implemented
    return [];
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
}

module.exports = DisplacementService;