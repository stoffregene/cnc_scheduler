class UndoService {
  constructor(pool) {
    this.pool = pool;
  }

  /**
   * Create an undo operation and capture the current schedule state
   * @param {string} operationType - Type of operation ('displacement', 'manual_reschedule', 'auto_schedule', 'bulk_schedule')
   * @param {string} description - Human readable description
   * @param {Array} affectedJobs - Array of job IDs that were affected
   * @param {Object} options - Additional options
   * @returns {Object} Result with undo operation ID
   */
  async createUndoOperation(operationType, description, affectedJobs, options = {}) {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Create the undo operation record
      const undoOpResult = await client.query(`
        INSERT INTO undo_operations (
          operation_type, operation_description, user_action, metadata, displacement_log_id
        ) VALUES ($1, $2, $3, $4, $5)
        RETURNING id, created_at, expires_at
      `, [
        operationType,
        description,
        options.userAction || null,
        JSON.stringify(options.metadata || {}),
        options.displacementLogId || null
      ]);
      
      const undoOperationId = undoOpResult.rows[0].id;
      
      // Capture current schedule state for each affected job
      for (const jobId of affectedJobs) {
        await this.captureJobScheduleState(client, undoOperationId, jobId);
      }
      
      await client.query('COMMIT');
      
      return {
        success: true,
        undoOperationId: undoOperationId,
        createdAt: undoOpResult.rows[0].created_at,
        expiresAt: undoOpResult.rows[0].expires_at,
        affectedJobsCount: affectedJobs.length
      };
      
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error creating undo operation:', error);
      return {
        success: false,
        error: error.message
      };
    } finally {
      client.release();
    }
  }

  /**
   * Capture the current schedule state for a job
   * @private
   */
  async captureJobScheduleState(client, undoOperationId, jobId) {
    // Get current schedule slots for this job
    const slotsResult = await client.query(`
      SELECT 
        ss.id as slot_id,
        ss.machine_id,
        ss.employee_id,
        ss.start_datetime,
        ss.end_datetime,
        ss.duration_minutes,
        jr.operation_number
      FROM schedule_slots ss
      JOIN job_routings jr ON ss.job_routing_id = jr.id
      WHERE jr.job_id = $1
      ORDER BY jr.sequence_order
    `, [jobId]);
    
    // Get job routings to capture operations that might not be scheduled
    const routingsResult = await client.query(`
      SELECT id, operation_number, sequence_order
      FROM job_routings 
      WHERE job_id = $1
      ORDER BY sequence_order
    `, [jobId]);
    
    // Create a map of scheduled operations
    const scheduledOps = new Map();
    slotsResult.rows.forEach(slot => {
      scheduledOps.set(slot.operation_number, slot);
    });
    
    // Capture state for all operations (scheduled and unscheduled)
    for (const routing of routingsResult.rows) {
      const slot = scheduledOps.get(routing.operation_number);
      
      await client.query(`
        INSERT INTO undo_schedule_snapshots (
          undo_operation_id, job_id, operation_number,
          original_slot_id, original_machine_id, original_employee_id,
          original_start_datetime, original_end_datetime, original_duration_minutes,
          was_scheduled
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `, [
        undoOperationId,
        jobId,
        routing.operation_number,
        slot?.slot_id || null,
        slot?.machine_id || null,
        slot?.employee_id || null,
        slot?.start_datetime || null,
        slot?.end_datetime || null,
        slot?.duration_minutes || null,
        !!slot
      ]);
    }
  }

  /**
   * Execute an undo operation
   * @param {number} undoOperationId - ID of the undo operation to execute
   * @returns {Object} Result of undo operation
   */
  async executeUndo(undoOperationId) {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Get the undo operation details
      const undoOpResult = await client.query(`
        SELECT * FROM undo_operations 
        WHERE id = $1 AND is_undone = FALSE AND expires_at > NOW()
      `, [undoOperationId]);
      
      if (undoOpResult.rows.length === 0) {
        return {
          success: false,
          error: 'Undo operation not found, already undone, or expired'
        };
      }
      
      const undoOp = undoOpResult.rows[0];
      
      // Get all schedule snapshots for this undo operation
      const snapshotsResult = await client.query(`
        SELECT * FROM undo_schedule_snapshots 
        WHERE undo_operation_id = $1
        ORDER BY job_id, operation_number
      `, [undoOperationId]);
      
      const snapshots = snapshotsResult.rows;
      let restoredJobs = 0;
      let restoredOperations = 0;
      const jobsAffected = new Set();
      
      // Group snapshots by job
      const jobSnapshots = new Map();
      snapshots.forEach(snapshot => {
        if (!jobSnapshots.has(snapshot.job_id)) {
          jobSnapshots.set(snapshot.job_id, []);
        }
        jobSnapshots.get(snapshot.job_id).push(snapshot);
      });
      
      // Restore each job's schedule state
      for (const [jobId, jobOpsSnapshots] of jobSnapshots) {
        // First, clear current schedule for this job
        await client.query(`
          DELETE FROM schedule_slots 
          WHERE job_routing_id IN (
            SELECT id FROM job_routings WHERE job_id = $1
          )
        `, [jobId]);
        
        // Restore operations that were originally scheduled
        for (const snapshot of jobOpsSnapshots) {
          if (snapshot.was_scheduled) {
            // Get the job routing ID
            const routingResult = await client.query(`
              SELECT id FROM job_routings 
              WHERE job_id = $1 AND operation_number = $2
            `, [snapshot.job_id, snapshot.operation_number]);
            
            if (routingResult.rows.length > 0) {
              const routingId = routingResult.rows[0].id;
              
              // Recreate the schedule slot
              await client.query(`
                INSERT INTO schedule_slots (
                  job_routing_id, machine_id, employee_id,
                  start_datetime, end_datetime, duration_minutes,
                  is_locked, created_at
                ) VALUES ($1, $2, $3, $4, $5, $6, FALSE, NOW())
              `, [
                routingId,
                snapshot.original_machine_id,
                snapshot.original_employee_id,
                snapshot.original_start_datetime,
                snapshot.original_end_datetime,
                snapshot.original_duration_minutes
              ]);
              
              restoredOperations++;
            }
          }
        }
        
        jobsAffected.add(jobId);
        restoredJobs++;
      }
      
      // Mark the undo operation as completed
      await client.query(`
        UPDATE undo_operations 
        SET is_undone = TRUE, undone_at = NOW()
        WHERE id = $1
      `, [undoOperationId]);
      
      await client.query('COMMIT');
      
      return {
        success: true,
        undoOperation: undoOp,
        restoredJobs: restoredJobs,
        restoredOperations: restoredOperations,
        jobsAffected: Array.from(jobsAffected),
        message: `Successfully undid ${undoOp.operation_type}: ${restoredJobs} jobs and ${restoredOperations} operations restored`
      };
      
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error executing undo operation:', error);
      return {
        success: false,
        error: error.message
      };
    } finally {
      client.release();
    }
  }

  /**
   * Get available undo operations (not yet undone and not expired)
   * @param {Object} options - Query options
   * @returns {Array} List of available undo operations
   */
  async getAvailableUndoOperations(options = {}) {
    try {
      const { limit = 20, offset = 0, operationType = null } = options;
      
      let query = `
        SELECT 
          uo.*,
          COUNT(uss.id) as affected_operations,
          COUNT(DISTINCT uss.job_id) as affected_jobs
        FROM undo_operations uo
        LEFT JOIN undo_schedule_snapshots uss ON uo.id = uss.undo_operation_id
        WHERE uo.is_undone = FALSE AND uo.expires_at > NOW()
      `;
      
      const params = [];
      let paramCount = 0;
      
      if (operationType) {
        paramCount++;
        query += ` AND uo.operation_type = $${paramCount}`;
        params.push(operationType);
      }
      
      query += `
        GROUP BY uo.id
        ORDER BY uo.created_at DESC
        LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
      `;
      
      params.push(limit, offset);
      
      const result = await this.pool.query(query, params);
      
      return result.rows.map(row => ({
        ...row,
        affected_operations: parseInt(row.affected_operations),
        affected_jobs: parseInt(row.affected_jobs),
        time_remaining: new Date(row.expires_at) - new Date(),
        can_undo: new Date(row.expires_at) > new Date()
      }));
      
    } catch (error) {
      console.error('Error getting available undo operations:', error);
      return [];
    }
  }

  /**
   * Clean up expired undo operations
   * @returns {Object} Cleanup result
   */
  async cleanupExpiredOperations() {
    try {
      const result = await this.pool.query('SELECT cleanup_expired_undo_operations()');
      const deletedCount = result.rows[0].cleanup_expired_undo_operations;
      
      return {
        success: true,
        deletedCount: deletedCount,
        message: `Cleaned up ${deletedCount} expired undo operations`
      };
    } catch (error) {
      console.error('Error cleaning up expired undo operations:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get undo operation details including snapshots
   * @param {number} undoOperationId - ID of undo operation
   * @returns {Object} Detailed undo operation info
   */
  async getUndoOperationDetails(undoOperationId) {
    try {
      const undoOpResult = await this.pool.query(`
        SELECT * FROM undo_operations WHERE id = $1
      `, [undoOperationId]);
      
      if (undoOpResult.rows.length === 0) {
        return { success: false, error: 'Undo operation not found' };
      }
      
      const snapshotsResult = await this.pool.query(`
        SELECT 
          uss.*,
          j.job_number,
          j.customer_name,
          m.name as machine_name,
          e.first_name || ' ' || e.last_name as employee_name
        FROM undo_schedule_snapshots uss
        JOIN jobs j ON uss.job_id = j.id
        LEFT JOIN machines m ON uss.original_machine_id = m.id
        LEFT JOIN employees e ON uss.original_employee_id = e.id
        WHERE uss.undo_operation_id = $1
        ORDER BY j.job_number, uss.operation_number
      `, [undoOperationId]);
      
      return {
        success: true,
        undoOperation: undoOpResult.rows[0],
        snapshots: snapshotsResult.rows
      };
      
    } catch (error) {
      console.error('Error getting undo operation details:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = UndoService;