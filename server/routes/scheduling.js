const express = require('express');
const SchedulingService = require('../services/schedulingService');
const router = express.Router();

// Get scheduling service instance
const getSchedulingService = (req) => {
  return new SchedulingService(req.app.locals.pool);
};

// Get all scheduled slots for a specific date range
router.get('/slots', async (req, res) => {
  try {
    const { pool } = req.app.locals;
    const { start_date, end_date, machine_id, employee_id } = req.query;
    
    let query = `
      SELECT 
        ss.*,
        j.job_number,
        j.customer_name,
        j.part_name,
        jr.operation_number,
        jr.operation_name,
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
    
    query += ` ORDER BY ss.start_datetime ASC`;
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching schedule slots:', error);
    res.status(500).json({ error: 'Failed to fetch schedule slots' });
  }
});

// Get machine workload view for kanban boards
router.get('/machine-workload', async (req, res) => {
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
            'operation_number', jr.operation_number,
            'operation_name', jr.operation_name,
            'start_datetime', ss.start_datetime,
            'end_datetime', ss.end_datetime,
            'duration_minutes', ss.duration_minutes,
            'status', ss.status,
            'employee_name', e.first_name || ' ' || e.last_name,
            'priority_score', ss.priority_score,
            'sequence_order', ss.sequence_order,
            'notes', ss.notes
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

// Schedule a specific job
router.post('/schedule-job/:id', async (req, res) => {
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
router.post('/auto-schedule', async (req, res) => {
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
router.put('/slots/:id', async (req, res) => {
  try {
    const { pool } = req.app.locals;
    const slotId = req.params.id;
    const {
      start_datetime,
      end_datetime,
      machine_id,
      employee_id,
      notes
    } = req.body;
    
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
router.delete('/slots/:id', async (req, res) => {
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

// Get scheduling conflicts
router.get('/conflicts', async (req, res) => {
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
router.get('/parameters', async (req, res) => {
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
router.put('/parameters/:name', async (req, res) => {
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

// Get available time slots for manual scheduling
router.get('/available-slots', async (req, res) => {
  try {
    const { machine_id, employee_id, duration_minutes, start_date } = req.query;
    
    if (!machine_id || !employee_id || !duration_minutes || !start_date) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }
    
    const schedulingService = getSchedulingService(req);
    const slots = await schedulingService.findAvailableSlots(
      parseInt(machine_id),
      parseInt(employee_id),
      parseInt(duration_minutes),
      new Date(start_date)
    );
    
    res.json(slots);
  } catch (error) {
    console.error('Error finding available slots:', error);
    res.status(500).json({ error: 'Failed to find available slots' });
  }
});

module.exports = router;