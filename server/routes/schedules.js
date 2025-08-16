const express = require('express');
const { body, validationResult } = require('express-validator');
const router = express.Router();

// Get all schedules
router.get('/', async (req, res) => {
  try {
    const { pool } = req.app.locals;
    const { status, start_date, end_date, machine_id, employee_id } = req.query;
    
    let query = `
      SELECT s.*, 
             j.job_number, j.part_name, j.customer_name, j.priority, j.quantity,
             m.name as machine_name, m.model as machine_model,
             e.first_name, e.last_name, e.employee_id as employee_number
      FROM schedules s
      LEFT JOIN jobs j ON s.job_id = j.id
      LEFT JOIN machines m ON s.machine_id = m.id
      LEFT JOIN employees e ON s.employee_id = e.id
    `;
    
    const conditions = [];
    const params = [];
    let paramCount = 0;
    
    if (status) {
      paramCount++;
      conditions.push(`s.status = $${paramCount}`);
      params.push(status);
    }
    
    if (start_date) {
      paramCount++;
      conditions.push(`DATE(s.start_time) >= $${paramCount}`);
      params.push(start_date);
    }
    
    if (end_date) {
      paramCount++;
      conditions.push(`DATE(s.end_time) <= $${paramCount}`);
      params.push(end_date);
    }
    
    if (machine_id) {
      paramCount++;
      conditions.push(`s.machine_id = $${paramCount}`);
      params.push(machine_id);
    }
    
    if (employee_id) {
      paramCount++;
      conditions.push(`s.employee_id = $${paramCount}`);
      params.push(employee_id);
    }
    
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    
    query += ' ORDER BY s.start_time ASC';
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching schedules:', error);
    res.status(500).json({ error: 'Failed to fetch schedules' });
  }
});

// Get dashboard data
router.get('/dashboard/summary', async (req, res) => {
  try {
    const { pool } = req.app.locals;
    const { start_date, end_date } = req.query;
    
    let dateFilter = '';
    const params = [];
    
    if (start_date && end_date) {
      dateFilter = 'WHERE DATE(s.start_time) BETWEEN $1 AND $2';
      params.push(start_date, end_date);
    }
    
    // Get schedule summary
    const summaryResult = await pool.query(`
      SELECT 
        COUNT(DISTINCT ss.job_id) as total_scheduled_jobs,
        COUNT(DISTINCT CASE WHEN ss.status = 'scheduled' THEN ss.job_id END) as scheduled_jobs_count,
        COUNT(DISTINCT CASE WHEN ss.status = 'completed' THEN ss.job_id END) as completed_jobs_count,
        COUNT(DISTINCT CASE WHEN ss.status = 'cancelled' THEN ss.job_id END) as cancelled_jobs_count,
        COUNT(*) as total_operations,
        COUNT(CASE WHEN ss.status = 'scheduled' THEN 1 END) as scheduled_operations_count,
        COUNT(CASE WHEN ss.status = 'completed' THEN 1 END) as completed_operations_count,
        COUNT(CASE WHEN ss.status = 'cancelled' THEN 1 END) as cancelled_operations_count,
        COALESCE(SUM(ss.duration_minutes)/60.0, 0) as total_hours
      FROM schedule_slots ss
      ${dateFilter ? dateFilter.replace('s.start_time', 'ss.slot_date') : ''}
    `, params);
    
    // Get machine utilization
    const machineUtilizationResult = await pool.query(`
      SELECT 
        m.name as machine_name,
        m.id as machine_id,
        COUNT(ss.id) as schedule_count,
        COALESCE(SUM(ss.duration_minutes)/60.0, 0) as total_hours
      FROM machines m
      LEFT JOIN schedule_slots ss ON m.id = ss.machine_id AND ss.status IN ('scheduled', 'pending', 'in_progress') ${dateFilter ? 'AND ' + dateFilter.replace('WHERE', '').replace('DATE(s.start_time)', 'ss.slot_date') : ''}
      WHERE m.status = 'active'
      GROUP BY m.id, m.name
      ORDER BY total_hours DESC
    `, params);
    
    // Get employee workload
    const employeeWorkloadResult = await pool.query(`
      SELECT 
        e.first_name,
        e.last_name,
        e.id as employee_id,
        COUNT(ss.id) as schedule_count,
        COALESCE(SUM(ss.duration_minutes)/60.0, 0) as total_hours
      FROM employees e
      LEFT JOIN schedule_slots ss ON e.id = ss.employee_id AND ss.status IN ('scheduled', 'pending', 'in_progress') ${dateFilter ? 'AND ' + dateFilter.replace('WHERE', '').replace('DATE(s.start_time)', 'ss.slot_date') : ''}
      WHERE e.status = 'active'
      GROUP BY e.id, e.first_name, e.last_name
      ORDER BY total_hours DESC
    `, params);
    
    res.json({
      summary: summaryResult.rows[0],
      machine_utilization: machineUtilizationResult.rows,
      employee_workload: employeeWorkloadResult.rows
    });
  } catch (error) {
    console.error('Error fetching dashboard summary:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard summary' });
  }
});

// Get machine schedule view (Kanban style)
router.get('/machine-view', async (req, res) => {
  try {
    const { pool } = req.app.locals;
    const { start_date, end_date } = req.query;
    
    let dateFilter = '';
    const params = [];
    
    if (start_date && end_date) {
      dateFilter = 'AND ss.slot_date BETWEEN $1 AND $2';
      params.push(start_date, end_date);
    }
    
    const result = await pool.query(`
      SELECT 
        m.id as machine_id,
        m.name as machine_name,
        m.model as machine_model,
        m.status as machine_status,
        array_agg(DISTINCT mg.name) FILTER (WHERE mg.name IS NOT NULL) as group_names,
        json_agg(
          json_build_object(
            'id', ss.id,
            'job_number', j.job_number,
            'part_name', j.part_name,
            'customer_name', j.customer_name,
            'priority', j.priority,
            'status', ss.status,
            'start_time', ss.start_datetime,
            'end_time', ss.end_datetime,
            'employee_name', e.first_name || ' ' || e.last_name
          ) ORDER BY ss.start_datetime
        ) FILTER (WHERE ss.id IS NOT NULL) as schedules
      FROM machines m
      LEFT JOIN machine_group_assignments mga ON m.id = mga.machine_id
      LEFT JOIN machine_groups mg ON mga.machine_group_id = mg.id
      LEFT JOIN schedule_slots ss ON m.id = ss.machine_id AND ss.status IN ('scheduled', 'pending', 'in_progress') ${dateFilter}
      LEFT JOIN jobs j ON ss.job_id = j.id
      LEFT JOIN employees e ON ss.employee_id = e.id
      WHERE m.status = 'active'
      GROUP BY m.id, m.name, m.model, m.status
      ORDER BY m.name
    `, params);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching machine view:', error);
    res.status(500).json({ error: 'Failed to fetch machine view' });
  }
});

// Get schedule by ID
router.get('/:id', async (req, res) => {
  try {
    const { pool } = req.app.locals;
    const { id } = req.params;
    
    const result = await pool.query(`
      SELECT s.*, 
             j.job_number, j.part_name, j.customer_name, j.priority, j.quantity, j.estimated_hours,
             m.name as machine_name, m.model as machine_model,
             e.first_name, e.last_name, e.employee_id as employee_number
      FROM schedules s
      LEFT JOIN jobs j ON s.job_id = j.id
      LEFT JOIN machines m ON s.machine_id = m.id
      LEFT JOIN employees e ON s.employee_id = e.id
      WHERE s.id = $1
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Schedule not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching schedule:', error);
    res.status(500).json({ error: 'Failed to fetch schedule' });
  }
});

// Create new schedule
router.post('/', [
  body('job_id').isInt().withMessage('Valid job ID is required'),
  body('machine_id').isInt().withMessage('Valid machine ID is required'),
  body('employee_id').isInt().withMessage('Valid employee ID is required'),
  body('start_time').isISO8601().withMessage('Valid start time is required'),
  body('end_time').isISO8601().withMessage('Valid end time is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const { pool } = req.app.locals;
    const {
      job_id, machine_id, employee_id, start_time, end_time, status, notes
    } = req.body;
    
    // Check for conflicts
    const conflictCheck = await pool.query(`
      SELECT COUNT(*) FROM schedules 
      WHERE machine_id = $1 
      AND status = 'scheduled'
      AND (
        (start_time <= $2 AND end_time >= $2) OR
        (start_time <= $3 AND end_time >= $3) OR
        (start_time >= $2 AND end_time <= $3)
      )
    `, [machine_id, start_time, end_time]);
    
    if (parseInt(conflictCheck.rows[0].count) > 0) {
      return res.status(400).json({ 
        error: 'Machine is already scheduled during this time period' 
      });
    }
    
    // Check employee availability
    const employeeConflictCheck = await pool.query(`
      SELECT COUNT(*) FROM schedules 
      WHERE employee_id = $1 
      AND status = 'scheduled'
      AND (
        (start_time <= $2 AND end_time >= $2) OR
        (start_time <= $3 AND end_time >= $3) OR
        (start_time >= $2 AND end_time <= $3)
      )
    `, [employee_id, start_time, end_time]);
    
    if (parseInt(employeeConflictCheck.rows[0].count) > 0) {
      return res.status(400).json({ 
        error: 'Employee is already scheduled during this time period' 
      });
    }
    
    const result = await pool.query(`
      INSERT INTO schedules (
        job_id, machine_id, employee_id, start_time, end_time, status, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [job_id, machine_id, employee_id, start_time, end_time, status || 'scheduled', notes]);
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating schedule:', error);
    res.status(500).json({ error: 'Failed to create schedule' });
  }
});

// Update schedule
router.put('/:id', [
  body('start_time').optional().isISO8601().withMessage('Valid start time is required'),
  body('end_time').optional().isISO8601().withMessage('Valid end time is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const { pool } = req.app.locals;
    const { id } = req.params;
    const updateFields = req.body;
    
    // If updating time, check for conflicts
    if (updateFields.start_time || updateFields.end_time) {
      const currentSchedule = await pool.query(
        'SELECT machine_id, employee_id FROM schedules WHERE id = $1',
        [id]
      );
      
      if (currentSchedule.rows.length === 0) {
        return res.status(404).json({ error: 'Schedule not found' });
      }
      
      const { machine_id, employee_id } = currentSchedule.rows[0];
      const startTime = updateFields.start_time || currentSchedule.rows[0].start_time;
      const endTime = updateFields.end_time || currentSchedule.rows[0].end_time;
      
      // Check machine conflicts (excluding current schedule)
      const machineConflictCheck = await pool.query(`
        SELECT COUNT(*) FROM schedules 
        WHERE machine_id = $1 
        AND id != $2
        AND status = 'scheduled'
        AND (
          (start_time <= $3 AND end_time >= $3) OR
          (start_time <= $4 AND end_time >= $4) OR
          (start_time >= $3 AND end_time <= $4)
        )
      `, [machine_id, id, startTime, endTime]);
      
      if (parseInt(machineConflictCheck.rows[0].count) > 0) {
        return res.status(400).json({ 
          error: 'Machine is already scheduled during this time period' 
        });
      }
      
      // Check employee conflicts (excluding current schedule)
      const employeeConflictCheck = await pool.query(`
        SELECT COUNT(*) FROM schedules 
        WHERE employee_id = $1 
        AND id != $2
        AND status = 'scheduled'
        AND (
          (start_time <= $3 AND end_time >= $3) OR
          (start_time <= $4 AND end_time >= $4) OR
          (start_time >= $3 AND end_time <= $4)
        )
      `, [employee_id, id, startTime, endTime]);
      
      if (parseInt(employeeConflictCheck.rows[0].count) > 0) {
        return res.status(400).json({ 
          error: 'Employee is already scheduled during this time period' 
        });
      }
    }
    
    // Build dynamic update query
    const setClause = Object.keys(updateFields)
      .map((key, index) => `${key} = $${index + 2}`)
      .join(', ');
    
    const values = [id, ...Object.values(updateFields)];
    
    const result = await pool.query(`
      UPDATE schedules 
      SET ${setClause}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `, values);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Schedule not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating schedule:', error);
    res.status(500).json({ error: 'Failed to update schedule' });
  }
});

// Delete schedule
router.delete('/:id', async (req, res) => {
  try {
    const { pool } = req.app.locals;
    const { id } = req.params;
    
    const result = await pool.query('DELETE FROM schedules WHERE id = $1 RETURNING *', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Schedule not found' });
    }
    
    res.json({ message: 'Schedule deleted successfully' });
  } catch (error) {
    console.error('Error deleting schedule:', error);
    res.status(500).json({ error: 'Failed to delete schedule' });
  }
});



// Smart scheduling - suggest optimal assignments
router.post('/suggest', async (req, res) => {
  try {
    const { pool } = req.app.locals;
    const { job_id, start_time, end_time } = req.body;
    
    if (!job_id || !start_time || !end_time) {
      return res.status(400).json({ error: 'Job ID, start time, and end time are required' });
    }
    
    // Get job details
    const jobResult = await pool.query('SELECT * FROM jobs WHERE id = $1', [job_id]);
    if (jobResult.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    const job = jobResult.rows[0];
    
    // Find available machines
    const availableMachinesResult = await pool.query(`
      SELECT m.*, mg.name as group_name
      FROM machines m
      LEFT JOIN machine_group_assignments mga ON m.id = mga.machine_id
      LEFT JOIN machine_groups mg ON mga.machine_group_id = mg.id
      WHERE m.status = 'active'
      AND m.id NOT IN (
        SELECT DISTINCT machine_id 
        FROM schedules 
        WHERE status = 'scheduled'
        AND (
          (start_time <= $1 AND end_time >= $1) OR
          (start_time <= $2 AND end_time >= $2) OR
          (start_time >= $1 AND end_time <= $2)
        )
      )
      ORDER BY m.name ASC
    `, [start_time, end_time]);
    
    // Find available employees
    const availableEmployeesResult = await pool.query(`
      SELECT e.*
      FROM employees e
      WHERE e.status = 'active'
      AND e.id NOT IN (
        SELECT DISTINCT employee_id 
        FROM schedules 
        WHERE status = 'scheduled'
        AND (
          (start_time <= $1 AND end_time >= $1) OR
          (start_time <= $2 AND end_time >= $2) OR
          (start_time >= $1 AND end_time <= $2)
        )
      )
      ORDER BY e.last_name ASC, e.first_name ASC
    `, [start_time, end_time]);
    
    res.json({
      job: job,
      available_machines: availableMachinesResult.rows,
      available_employees: availableEmployeesResult.rows,
      suggestions: availableMachinesResult.rows.map(machine => ({
        machine: machine,
        recommended_employees: availableEmployeesResult.rows.slice(0, 3) // Top 3 employees
      }))
    });
  } catch (error) {
    console.error('Error generating suggestions:', error);
    res.status(500).json({ error: 'Failed to generate suggestions' });
  }
});

module.exports = router;
