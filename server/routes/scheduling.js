const express = require('express');
const SchedulingService = require('../services/schedulingService');
const ConflictPreventionService = require('../services/conflictPreventionService');
const { authenticateToken, requirePermission } = require('../middleware/auth');
const router = express.Router();

// Get scheduling service instance
const getSchedulingService = (req) => {
  return new SchedulingService(req.app.locals.pool);
};

// Get all scheduled slots for a specific date range
router.get('/slots', authenticateToken, requirePermission('schedules.view'), async (req, res) => {
  try {
    const { pool } = req.app.locals;
    const { start_date, end_date, machine_id, employee_id, job_id } = req.query;
    
    let query = `
      SELECT 
        ss.*,
        j.job_number,
        j.customer_name,
        j.part_name,
        j.quantity,
        j.due_date,
        j.priority,
        jr.operation_number,
        jr.operation_name,
        jr.notes,
        m.name as machine_name,
        e.first_name || ' ' || e.last_name as employee_name
      FROM schedule_slots ss
      LEFT JOIN jobs j ON ss.job_id = j.id
      LEFT JOIN job_routings jr ON ss.job_routing_id = jr.id
      LEFT JOIN machines m ON ss.machine_id = m.id
      LEFT JOIN employees e ON ss.employee_id = e.id
      WHERE 1=1
    `;
    
    const params = [];
    let paramCount = 0;
    
    if (start_date) {
      paramCount++;
      query += ` AND ss.slot_date >= $${paramCount}`;
      params.push(start_date);
    }
    
    if (end_date) {
      paramCount++;
      query += ` AND ss.slot_date <= $${paramCount}`;
      params.push(end_date);
    }
    
    if (machine_id) {
      paramCount++;
      query += ` AND ss.machine_id = $${paramCount}`;
      params.push(machine_id);
    }
    
    if (employee_id) {
      paramCount++;
      query += ` AND ss.employee_id = $${paramCount}`;
      params.push(employee_id);
    }
    
    if (job_id) {
      paramCount++;
      query += ` AND ss.job_id = $${paramCount}`;
      params.push(job_id);
    }
    
    query += ` ORDER BY ss.start_datetime ASC`;
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching schedule slots:', error);
    res.status(500).json({ error: 'Failed to fetch schedule slots' });
  }
});

// Get machine workload view for kanban boards
router.get('/machine-workload', authenticateToken, requirePermission('schedules.view'), async (req, res) => {
  try {
    const { pool } = req.app.locals;
    const { date } = req.query;
    const targetDate = date || new Date().toISOString().split('T')[0];
    
    const query = `
      SELECT 
        m.id as machine_id,
        m.name as machine_name,
        m.model as machine_model,
        mg.name as group_name,
        COUNT(DISTINCT CONCAT(j.id, '-', jr.id)) as scheduled_jobs,
        COALESCE(SUM(ss.duration_minutes), 0) as total_minutes,
        json_agg(
          json_build_object(
            'id', ss.id,
            'job_id', j.id,
            'job_number', j.job_number,
            'customer_name', j.customer_name,
            'part_name', j.part_name,
            'quantity', j.quantity,
            'due_date', j.due_date,
            'priority', j.priority,
            'operation_number', jr.operation_number,
            'operation_name', jr.operation_name,
            'start_datetime', ss.start_datetime,
            'end_datetime', ss.end_datetime,
            'duration_minutes', ss.duration_minutes,
            'status', ss.status,
            'employee_name', e.first_name || ' ' || e.last_name,
            'priority_score', ss.priority_score,
            'sequence_order', ss.sequence_order,
            'notes', jr.notes
          ) ORDER BY ss.start_datetime
        ) FILTER (WHERE ss.id IS NOT NULL) as scheduled_jobs_detail
      FROM machines m
      LEFT JOIN machine_group_assignments mga ON m.id = mga.machine_id
      LEFT JOIN machine_groups mg ON mga.machine_group_id = mg.id
      LEFT JOIN schedule_slots ss ON m.id = ss.machine_id AND ss.slot_date = $1::date
      LEFT JOIN jobs j ON ss.job_id = j.id
      LEFT JOIN job_routings jr ON ss.job_routing_id = jr.id
      LEFT JOIN employees e ON ss.employee_id = e.id
      WHERE m.status = 'active'
      GROUP BY m.id, m.name, m.model, mg.name
      ORDER BY m.name
    `;
    
    const result = await pool.query(query, [targetDate]);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching machine workload:', error);
    res.status(500).json({ error: 'Failed to fetch machine workload' });
  }
});

// Create a new schedule slot
router.post('/slots', authenticateToken, requirePermission('schedules.create'), async (req, res) => {
  try {
    const { pool } = req.app.locals;
    const {
      job_id,
      job_routing_id,
      machine_id,
      employee_id,
      start_datetime,
      end_datetime,
      duration_minutes,
      slot_date,
      time_slot,
      status,
      scheduling_method,
      priority_score,
      sequence_order,
      notes
    } = req.body;
    
    const result = await pool.query(`
      INSERT INTO schedule_slots (
        job_id, job_routing_id, machine_id, employee_id,
        start_datetime, end_datetime, duration_minutes,
        slot_date, time_slot, status, scheduling_method,
        priority_score, sequence_order, notes, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING *
    `, [
      job_id, job_routing_id, machine_id, employee_id,
      start_datetime, end_datetime, duration_minutes,
      slot_date, time_slot, status, scheduling_method,
      priority_score, sequence_order, notes
    ]);
    
    if (result.rows.length === 0) {
      return res.status(500).json({ error: 'Failed to create schedule slot' });
    }
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating schedule slot:', error);
    res.status(500).json({ error: 'Failed to create schedule slot' });
  }
});

// Schedule a specific job
router.post('/schedule-job/:id', authenticateToken, requirePermission('schedules.auto_schedule'), async (req, res) => {
  try {
    const jobId = req.params.id;
    const { force_reschedule } = req.body;
    
    const schedulingService = getSchedulingService(req);
    const result = await schedulingService.scheduleJob(jobId, force_reschedule);
    
    res.json(result);
  } catch (error) {
    console.error('Error scheduling job:', error);
    res.status(500).json({ error: error.message });
  }
});

// Auto-schedule all pending jobs
router.post('/auto-schedule', authenticateToken, requirePermission('schedules.auto_schedule'), async (req, res) => {
  try {
    const schedulingService = getSchedulingService(req);
    const results = await schedulingService.autoScheduleAllJobs();
    
    const summary = {
      total_jobs: results.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      details: results
    };
    
    res.json(summary);
  } catch (error) {
    console.error('Error auto-scheduling jobs:', error);
    res.status(500).json({ error: 'Failed to auto-schedule jobs' });
  }
});

// Update schedule slot (manual override)
router.put('/slots/:id', authenticateToken, requirePermission('schedules.edit'), async (req, res) => {
  try {
    const { pool } = req.app.locals;
    const slotId = req.params.id;
    const {
      start_datetime,
      end_datetime,
      machine_id,
      employee_id,
      notes,
      bypass_validation
    } = req.body;
    
    // Get current slot details for validation
    const currentSlotQuery = await pool.query(
      'SELECT job_id, job_routing_id FROM schedule_slots WHERE id = $1',
      [slotId]
    );
    
    if (currentSlotQuery.rows.length === 0) {
      return res.status(404).json({ error: 'Schedule slot not found' });
    }
    
    const currentSlot = currentSlotQuery.rows[0];
    
    // VALIDATE PROPOSED MOVE BEFORE APPLYING (unless bypassed)
    if (!bypass_validation) {
      const conflictPrevention = new ConflictPreventionService(pool);
      const proposedSlot = {
        job_id: currentSlot.job_id,
        job_routing_id: currentSlot.job_routing_id,
        machine_id: parseInt(machine_id),
        employee_id: parseInt(employee_id),
        start_datetime: new Date(start_datetime),
        end_datetime: new Date(end_datetime),
        excludeSlotId: parseInt(slotId) // Exclude current slot from conflict checks
      };
      
      console.log(`🔍 Validating drag-and-drop move for slot ${slotId}:`, proposedSlot);
      
      const validation = await conflictPrevention.validateProposedSlot(proposedSlot);
      
      if (!validation.isValid) {
        console.log(`❌ Drag-and-drop validation failed:`, validation.conflicts);
        
        // Return validation errors to frontend for user decision
        return res.status(400).json({
          error: 'Scheduling conflicts detected',
          conflicts: validation.conflicts,
          warnings: validation.warnings,
          suggestions: validation.suggestions,
          canProceed: validation.canProceed
        });
      }
    } else {
      console.log(`⚠️ Validation bypassed for slot ${slotId} (smart rescheduling)`);
    }
    
    console.log(`✅ Drag-and-drop validation passed for slot ${slotId}`);
    
    // Calculate duration and slot information
    const start = new Date(start_datetime);
    const end = new Date(end_datetime);
    const duration_minutes = Math.round((end - start) / (1000 * 60));
    const slot_date = start.toISOString().split('T')[0];
    const time_slot = Math.floor((start.getHours() * 60 + start.getMinutes()) / 15);
    
    const result = await pool.query(`
      UPDATE schedule_slots
      SET start_datetime = $1,
          end_datetime = $2,
          duration_minutes = $3,
          slot_date = $4,
          time_slot = $5,
          machine_id = $6,
          employee_id = $7,
          notes = $8,
          scheduling_method = 'manual',
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $9
      RETURNING *
    `, [
      start_datetime, end_datetime, duration_minutes, slot_date, time_slot,
      machine_id, employee_id, notes, slotId
    ]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Schedule slot not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating schedule slot:', error);
    res.status(500).json({ error: 'Failed to update schedule slot' });
  }
});

// Delete schedule slot
router.delete('/slots/:id', authenticateToken, requirePermission('schedules.delete'), async (req, res) => {
  try {
    const { pool } = req.app.locals;
    const slotId = req.params.id;
    
    const result = await pool.query('DELETE FROM schedule_slots WHERE id = $1 RETURNING *', [slotId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Schedule slot not found' });
    }
    
    res.json({ message: 'Schedule slot deleted successfully' });
  } catch (error) {
    console.error('Error deleting schedule slot:', error);
    res.status(500).json({ error: 'Failed to delete schedule slot' });
  }
});

// Unschedule all jobs - remove all schedule slots
router.delete('/unschedule-all', authenticateToken, requirePermission('schedules.delete'), async (req, res) => {
  try {
    const { pool } = req.app.locals;
    
    console.log('🗑️ Unscheduling all jobs - removing all schedule slots');
    
    // Start transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Get count before deletion
      const countResult = await client.query('SELECT COUNT(*) as count FROM schedule_slots');
      const totalSlots = parseInt(countResult.rows[0].count);
      
      // Delete all schedule slots
      await client.query('DELETE FROM schedule_slots');
      
      // Reset auto_scheduled flag and status on all jobs that had schedules
      const jobsResult = await client.query(`
        UPDATE jobs 
        SET auto_scheduled = FALSE, 
            status = CASE 
              WHEN status = 'scheduled' THEN 'pending'
              ELSE status 
            END,
            updated_at = CURRENT_TIMESTAMP 
        WHERE auto_scheduled = TRUE OR status = 'scheduled'
        RETURNING id, job_number, status
      `);
      
      await client.query('COMMIT');
      
      console.log(`✅ Unscheduled all jobs: ${totalSlots} slots removed, ${jobsResult.rows.length} jobs reset`);
      
      res.json({
        message: `Successfully unscheduled all jobs`,
        totalSlotsRemoved: totalSlots,
        jobsReset: jobsResult.rows.length,
        resetJobs: jobsResult.rows.map(j => j.job_number)
      });
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    
  } catch (error) {
    console.error('Error unscheduling all jobs:', error);
    res.status(500).json({ error: 'Failed to unschedule all jobs' });
  }
});

// Get scheduling conflicts
router.get('/conflicts', authenticateToken, requirePermission('schedules.view'), async (req, res) => {
  try {
    const { pool } = req.app.locals;
    const { resolved } = req.query;
    
    let query = `
      SELECT 
        sc.*,
        j.job_number,
        m.name as machine_name,
        e.first_name || ' ' || e.last_name as employee_name
      FROM scheduling_conflicts sc
      LEFT JOIN jobs j ON sc.job_id = j.id
      LEFT JOIN machines m ON sc.machine_id = m.id
      LEFT JOIN employees e ON sc.employee_id = e.id
      WHERE 1=1
    `;
    
    const params = [];
    if (resolved !== undefined) {
      query += ` AND resolved = $1`;
      params.push(resolved === 'true');
    }
    
    query += ` ORDER BY sc.created_at DESC`;
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching conflicts:', error);
    res.status(500).json({ error: 'Failed to fetch scheduling conflicts' });
  }
});

// Get scheduling parameters
router.get('/parameters', authenticateToken, requirePermission('schedules.view'), async (req, res) => {
  try {
    const { pool } = req.app.locals;
    const result = await pool.query('SELECT * FROM scheduling_parameters ORDER BY parameter_name');
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching parameters:', error);
    res.status(500).json({ error: 'Failed to fetch scheduling parameters' });
  }
});

// Update scheduling parameter
router.put('/parameters/:name', authenticateToken, requirePermission('system.settings'), async (req, res) => {
  try {
    const { pool } = req.app.locals;
    const { name } = req.params;
    const { value } = req.body;
    
    const result = await pool.query(`
      UPDATE scheduling_parameters
      SET parameter_value = $1, last_updated = CURRENT_TIMESTAMP
      WHERE parameter_name = $2
      RETURNING *
    `, [value, name]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Parameter not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating parameter:', error);
    res.status(500).json({ error: 'Failed to update parameter' });
  }
});

// Unschedule and reschedule a job with correct machine assignments
router.post('/reschedule-job/:id', authenticateToken, requirePermission('schedules.reschedule'), async (req, res) => {
  try {
    const jobId = req.params.id;
    const { force_start_date, partial, startFromOperation } = req.body;
    const schedulingService = getSchedulingService(req);
    
    console.log(`Unscheduling and rescheduling job ${jobId}...`);
    if (force_start_date) {
      console.log(`Using forced start date: ${force_start_date}`);
    }
    if (partial) {
      console.log(`Partial reschedule starting from operation sequence ${startFromOperation}`);
    }
    
    // Force reschedule (this will clear existing schedule and create new one)
    const result = await schedulingService.scheduleJob(jobId, true, force_start_date, partial, startFromOperation);
    
    if (result.success) {
      res.json({
        success: true,
        message: `Job ${jobId} has been rescheduled successfully`,
        ...result
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error || 'Failed to reschedule job'
      });
    }
  } catch (error) {
    console.error('Error rescheduling job:', error);
    res.status(500).json({ 
      success: false,
      error: `Failed to reschedule job: ${error.message}` 
    });
  }
});

// Unschedule a job (clear all schedule slots)
router.delete('/unschedule-job/:id', authenticateToken, requirePermission('schedules.unschedule'), async (req, res) => {
  try {
    const { pool } = req.app.locals;
    const jobId = req.params.id;
    
    console.log(`Unscheduling job ${jobId}...`);
    
    // Delete all schedule slots for this job
    const deleteResult = await pool.query(`
      DELETE FROM schedule_slots 
      WHERE job_id = $1 
      RETURNING id
    `, [jobId]);
    
    // Update job status
    const updateResult = await pool.query(`
      UPDATE jobs 
      SET 
        auto_scheduled = false,
        status = 'pending',
        start_date = NULL,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING job_number
    `, [jobId]);
    
    if (updateResult.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    res.json({
      success: true,
      message: `Job ${updateResult.rows[0].job_number} has been unscheduled`,
      slots_removed: deleteResult.rows.length,
      job_number: updateResult.rows[0].job_number
    });
    
  } catch (error) {
    console.error('Error unscheduling job:', error);
    res.status(500).json({ error: 'Failed to unschedule job' });
  }
});

// Get available time slots for manual scheduling
router.get('/available-slots', authenticateToken, requirePermission('schedules.view'), async (req, res) => {
  try {
    const { machine_id, employee_id, duration_minutes, start_date, exclude_job_id } = req.query;
    
    if (!machine_id || !employee_id || !duration_minutes || !start_date) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }
    
    const schedulingService = getSchedulingService(req);
    const slots = await schedulingService.findAvailableSlots(
      parseInt(machine_id),
      parseInt(employee_id),
      parseInt(duration_minutes),
      new Date(start_date),
      exclude_job_id ? parseInt(exclude_job_id) : null
    );
    
    res.json(slots);
  } catch (error) {
    console.error('Error finding available slots:', error);
    res.status(500).json({ error: 'Failed to find available slots' });
  }
});

module.exports = router;