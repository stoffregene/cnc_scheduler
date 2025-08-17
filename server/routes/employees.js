const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticateToken, requirePermission } = require('../middleware/auth');
const router = express.Router();

// Get all employees
router.get('/', authenticateToken, requirePermission('employees.view'), async (req, res) => {
  try {
    const { pool } = req.app.locals;
    const { status, department } = req.query;
    
    let query = `
      SELECT e.*, 
             COUNT(s.id) as active_schedules,
             COALESCE(SUM(EXTRACT(EPOCH FROM (s.end_time - s.start_time))/3600), 0) as total_scheduled_hours
      FROM employees e
      LEFT JOIN schedules s ON e.id = s.employee_id AND s.status IN ('scheduled', 'pending', 'in_progress')
    `;
    
    const conditions = [];
    const params = [];
    let paramCount = 0;
    
    if (status) {
      paramCount++;
      conditions.push(`e.status = $${paramCount}`);
      params.push(status);
    }
    
    if (department) {
      paramCount++;
      conditions.push(`e.department = $${paramCount}`);
      params.push(department);
    }
    
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    
    query += ' GROUP BY e.id ORDER BY e.last_name ASC, e.first_name ASC';
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching employees:', error);
    res.status(500).json({ error: 'Failed to fetch employees' });
  }
});

// Get employee by ID
router.get('/:id', authenticateToken, requirePermission('employees.view'), async (req, res) => {
  try {
    const { pool } = req.app.locals;
    const { id } = req.params;
    
    const result = await pool.query(`
      SELECT e.*, 
             json_agg(
               json_build_object(
                 'id', s.id,
                 'job_id', s.job_id,
                 'machine_id', s.machine_id,
                 'start_time', s.start_time,
                 'end_time', s.end_time,
                 'status', s.status,
                 'notes', s.notes
               )
             ) as schedules
      FROM employees e
      LEFT JOIN schedules s ON e.id = s.employee_id
      WHERE e.id = $1
      GROUP BY e.id
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching employee:', error);
    res.status(500).json({ error: 'Failed to fetch employee' });
  }
});

// Get employee work schedules
router.get('/:id/work-schedules', authenticateToken, requirePermission('employees.view_schedules'), async (req, res) => {
  try {
    const { pool } = req.app.locals;
    const { id } = req.params;
    
    const result = await pool.query(`
      SELECT day_of_week, start_time, end_time, enabled
      FROM employee_work_schedules
      WHERE employee_id = $1
      ORDER BY day_of_week
    `, [id]);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching employee work schedules:', error);
    res.status(500).json({ error: 'Failed to fetch employee work schedules' });
  }
});

// Update employee work schedules
router.put('/:id/work-schedules', authenticateToken, requirePermission('employees.edit_schedules'), async (req, res) => {
  try {
    const { pool } = req.app.locals;
    const { id } = req.params;
    const { work_schedules } = req.body;
    
    // Start a transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Delete existing work schedules for this employee
      await client.query('DELETE FROM employee_work_schedules WHERE employee_id = $1', [id]);
      
      // Insert new work schedules
      if (work_schedules && Array.isArray(work_schedules)) {
        for (const schedule of work_schedules) {
          if (schedule.enabled) {
            await client.query(`
              INSERT INTO employee_work_schedules (employee_id, day_of_week, start_time, end_time, enabled)
              VALUES ($1, $2, $3, $4, $5)
            `, [id, schedule.day_of_week, schedule.start_time, schedule.end_time, schedule.enabled]);
          }
        }
      }
      
      await client.query('COMMIT');
      res.json({ message: 'Work schedules updated successfully' });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error updating employee work schedules:', error);
    res.status(500).json({ error: 'Failed to update employee work schedules' });
  }
});

// Create new employee
router.post('/', authenticateToken, requirePermission('employees.create'), [
  body('employee_id').notEmpty().withMessage('Employee ID is required'),
  body('first_name').notEmpty().withMessage('First name is required'),
  body('last_name').notEmpty().withMessage('Last name is required'),
  body('email').optional().isEmail().withMessage('Invalid email format'),
  body('shift_type').optional().isIn(['day', 'night', 'swing']).withMessage('Invalid shift type')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const { pool } = req.app.locals;
    const {
      employee_id, first_name, last_name, email, phone, department,
      position, hire_date, shift_type, work_days, start_time, end_time
    } = req.body;
    
    const result = await pool.query(`
      INSERT INTO employees (
        employee_id, first_name, last_name, email, phone, department,
        position, hire_date, shift_type, work_days, start_time, end_time
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `, [
      employee_id, first_name, last_name, email, phone, department,
      position, hire_date, shift_type, work_days, start_time, end_time
    ]);
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating employee:', error);
    if (error.code === '23505') { // Unique violation
      res.status(400).json({ error: 'Employee ID already exists' });
    } else {
      res.status(500).json({ error: 'Failed to create employee' });
    }
  }
});

// Update employee
router.put('/:id', authenticateToken, requirePermission('employees.edit'), [
  body('email').optional().isEmail().withMessage('Invalid email format'),
  body('shift_type').optional().isIn(['day', 'night', 'swing']).withMessage('Invalid shift type')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const { pool } = req.app.locals;
    const { id } = req.params;
    const updateFields = req.body;
    
    // Build dynamic update query
    const setClause = Object.keys(updateFields)
      .map((key, index) => `${key} = $${index + 2}`)
      .join(', ');
    
    const values = [id, ...Object.values(updateFields)];
    
    const result = await pool.query(`
      UPDATE employees 
      SET ${setClause}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `, values);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating employee:', error);
    res.status(500).json({ error: 'Failed to update employee' });
  }
});

// Delete employee
router.delete('/:id', authenticateToken, requirePermission('employees.delete'), async (req, res) => {
  try {
    const { pool } = req.app.locals;
    const { id } = req.params;
    
    // Check if employee has active schedules
    const scheduleCheck = await pool.query(
      'SELECT COUNT(*) FROM schedules WHERE employee_id = $1 AND status = $2',
      [id, 'scheduled']
    );
    
    if (parseInt(scheduleCheck.rows[0].count) > 0) {
      return res.status(400).json({ 
        error: 'Cannot delete employee with active schedules' 
      });
    }
    
    const result = await pool.query('DELETE FROM employees WHERE id = $1 RETURNING *', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    
    res.json({ message: 'Employee deleted successfully' });
  } catch (error) {
    console.error('Error deleting employee:', error);
    res.status(500).json({ error: 'Failed to delete employee' });
  }
});

// Get employee availability - temporarily bypass permission for testing
router.get('/:id/availability', authenticateToken, async (req, res) => {
  try {
    const { pool } = req.app.locals;
    const { id } = req.params;
    const { start_date, end_date } = req.query;
    
    let query = `
      SELECT * FROM employee_availability 
      WHERE employee_id = $1
    `;
    
    const params = [id];
    let paramCount = 1;
    
    if (start_date) {
      paramCount++;
      query += ` AND date >= $${paramCount}`;
      params.push(start_date);
    }
    
    if (end_date) {
      paramCount++;
      query += ` AND date <= $${paramCount}`;
      params.push(end_date);
    }
    
    query += ' ORDER BY date ASC';
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching employee availability:', error);
    res.status(500).json({ error: 'Failed to fetch employee availability' });
  }
});

// Add employee availability entry
router.post('/:id/availability', authenticateToken, requirePermission('employees.edit_schedules'), [
  body('date').isISO8601().withMessage('Valid date is required'),
  body('status').isIn(['available', 'unavailable', 'vacation', 'sick', 'training']).withMessage('Invalid status')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const { pool } = req.app.locals;
    const { id } = req.params;
    const {
      date, start_time, end_time, status, reason, notes
    } = req.body;
    
    const result = await pool.query(`
      INSERT INTO employee_availability (
        employee_id, date, start_time, end_time, status, reason, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [id, date, start_time, end_time, status, reason, notes]);
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating availability entry:', error);
    res.status(500).json({ error: 'Failed to create availability entry' });
  }
});

// Update employee availability entry
router.put('/availability/:availabilityId', authenticateToken, requirePermission('employees.edit_schedules'), [
  body('status').isIn(['available', 'unavailable', 'vacation', 'sick', 'training']).withMessage('Invalid status')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const { pool } = req.app.locals;
    const { availabilityId } = req.params;
    const updateFields = req.body;
    
    // Build dynamic update query
    const setClause = Object.keys(updateFields)
      .map((key, index) => `${key} = $${index + 1}`)
      .join(', ');
    
    const values = Object.values(updateFields);
    
    const result = await pool.query(`
      UPDATE employee_availability 
      SET ${setClause}
      WHERE id = $${values.length + 1}
      RETURNING *
    `, [...values, availabilityId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Availability entry not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating availability entry:', error);
    res.status(500).json({ error: 'Failed to update availability entry' });
  }
});

// Delete employee availability entry
router.delete('/availability/:availabilityId', authenticateToken, requirePermission('employees.edit_schedules'), async (req, res) => {
  try {
    const { pool } = req.app.locals;
    const { availabilityId } = req.params;
    
    const result = await pool.query(
      'DELETE FROM employee_availability WHERE id = $1 RETURNING *',
      [availabilityId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Availability entry not found' });
    }
    
    res.json({ message: 'Availability entry deleted successfully' });
  } catch (error) {
    console.error('Error deleting availability entry:', error);
    res.status(500).json({ error: 'Failed to delete availability entry' });
  }
});

// Get available employees for a time slot
router.get('/available/:startTime/:endTime', authenticateToken, requirePermission('employees.view'), async (req, res) => {
  try {
    const { pool } = req.app.locals;
    const { startTime, endTime } = req.params;
    
    const result = await pool.query(`
      SELECT e.*
      FROM employees e
      WHERE e.status = 'active'
      AND e.id NOT IN (
        SELECT DISTINCT ea.employee_id 
        FROM employee_availability ea
        WHERE ea.status IN ('unavailable', 'vacation', 'sick')
        AND ea.date = DATE($1)
        AND (
          (ea.start_time IS NULL AND ea.end_time IS NULL) OR
          (ea.start_time <= $2 AND ea.end_time >= $2) OR
          (ea.start_time <= $3 AND ea.end_time >= $3) OR
          (ea.start_time >= $2 AND ea.end_time <= $3)
        )
      )
      AND e.id NOT IN (
        SELECT DISTINCT s.employee_id 
        FROM schedules s
        WHERE s.status = 'scheduled'
        AND (
          (s.start_time <= $1 AND s.end_time >= $1) OR
          (s.start_time <= $4 AND s.end_time >= $4) OR
          (s.start_time >= $1 AND s.end_time <= $4)
        )
      )
      ORDER BY e.last_name ASC, e.first_name ASC
    `, [startTime, startTime.split('T')[1], endTime.split('T')[1], endTime]);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching available employees:', error);
    res.status(500).json({ error: 'Failed to fetch available employees' });
  }
});

module.exports = router;
