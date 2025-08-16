const express = require('express');
const router = express.Router();

// Get lock status for a job
router.get('/job/:jobId', async (req, res) => {
  try {
    const { pool } = req.app.locals;
    const { jobId } = req.params;
    
    const result = await pool.query(`
      SELECT 
        j.id,
        j.job_number,
        j.schedule_locked,
        j.lock_reason,
        COUNT(ss.id) FILTER (WHERE ss.locked = true) as locked_operations,
        COUNT(ss.id) as total_operations
      FROM jobs j
      LEFT JOIN schedule_slots ss ON j.id = ss.job_id
      WHERE j.id = $1
      GROUP BY j.id
    `, [jobId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching lock status:', error);
    res.status(500).json({ error: 'Failed to fetch lock status' });
  }
});

// Lock a job manually
router.post('/job/:jobId/lock', async (req, res) => {
  try {
    const { pool } = req.app.locals;
    const { jobId } = req.params;
    const { reason = 'Manual lock by user' } = req.body;
    
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Lock the job
      await client.query(`
        UPDATE jobs 
        SET schedule_locked = true,
            lock_reason = $1,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
      `, [reason, jobId]);
      
      // Lock all its operations
      await client.query(`
        UPDATE schedule_slots
        SET locked = true
        WHERE job_id = $1
      `, [jobId]);
      
      await client.query('COMMIT');
      
      // Get updated job info
      const result = await client.query(`
        SELECT job_number, schedule_locked, lock_reason
        FROM jobs
        WHERE id = $1
      `, [jobId]);
      
      console.log(`🔒 Job ${result.rows[0].job_number} manually locked: ${reason}`);
      
      res.json({
        success: true,
        job: result.rows[0],
        message: `Job locked successfully`
      });
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    
  } catch (error) {
    console.error('Error locking job:', error);
    res.status(500).json({ error: 'Failed to lock job' });
  }
});

// Unlock a job manually
router.post('/job/:jobId/unlock', async (req, res) => {
  try {
    const { pool } = req.app.locals;
    const { jobId } = req.params;
    
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Check if any operations are actually started
      const startedOps = await client.query(`
        SELECT COUNT(*) as count
        FROM schedule_slots
        WHERE job_id = $1 AND status IN ('started', 'in_progress', 'completed')
      `, [jobId]);
      
      if (startedOps.rows[0].count > 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ 
          error: 'Cannot unlock job with started operations. Complete or reset operations first.' 
        });
      }
      
      // Unlock the job
      await client.query(`
        UPDATE jobs 
        SET schedule_locked = false,
            lock_reason = NULL,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `, [jobId]);
      
      // Unlock all its operations (only scheduled ones, not started)
      await client.query(`
        UPDATE schedule_slots
        SET locked = false
        WHERE job_id = $1 AND status = 'scheduled'
      `, [jobId]);
      
      await client.query('COMMIT');
      
      // Get updated job info
      const result = await client.query(`
        SELECT job_number, schedule_locked, lock_reason
        FROM jobs
        WHERE id = $1
      `, [jobId]);
      
      console.log(`🔓 Job ${result.rows[0].job_number} manually unlocked`);
      
      res.json({
        success: true,
        job: result.rows[0],
        message: `Job unlocked successfully`
      });
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    
  } catch (error) {
    console.error('Error unlocking job:', error);
    res.status(500).json({ error: 'Failed to unlock job' });
  }
});

// Lock a specific operation
router.post('/operation/:slotId/lock', async (req, res) => {
  try {
    const { pool } = req.app.locals;
    const { slotId } = req.params;
    
    const result = await pool.query(`
      UPDATE schedule_slots
      SET locked = true
      WHERE id = $1
      RETURNING id, job_id, locked
    `, [slotId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Operation not found' });
    }
    
    console.log(`🔒 Operation ${slotId} manually locked`);
    
    res.json({
      success: true,
      operation: result.rows[0],
      message: 'Operation locked successfully'
    });
    
  } catch (error) {
    console.error('Error locking operation:', error);
    res.status(500).json({ error: 'Failed to lock operation' });
  }
});

// Unlock a specific operation
router.post('/operation/:slotId/unlock', async (req, res) => {
  try {
    const { pool } = req.app.locals;
    const { slotId } = req.params;
    
    // Check if operation is started
    const checkResult = await pool.query(`
      SELECT status FROM schedule_slots WHERE id = $1
    `, [slotId]);
    
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Operation not found' });
    }
    
    if (['started', 'in_progress', 'completed'].includes(checkResult.rows[0].status)) {
      return res.status(400).json({ 
        error: 'Cannot unlock started/completed operations' 
      });
    }
    
    const result = await pool.query(`
      UPDATE schedule_slots
      SET locked = false
      WHERE id = $1
      RETURNING id, job_id, locked
    `, [slotId]);
    
    console.log(`🔓 Operation ${slotId} manually unlocked`);
    
    res.json({
      success: true,
      operation: result.rows[0],
      message: 'Operation unlocked successfully'
    });
    
  } catch (error) {
    console.error('Error unlocking operation:', error);
    res.status(500).json({ error: 'Failed to unlock operation' });
  }
});

module.exports = router;