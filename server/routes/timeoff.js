const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '../..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:sassysalad@localhost:5432/cnc_scheduler'
});

// Get all time off entries
router.get('/', async (req, res) => {
  try {
    const { employee_id, start_date, end_date } = req.query;
    
    let query = `
      SELECT 
        eto.*,
        e.first_name || ' ' || e.last_name as employee_name,
        e.first_name,
        e.last_name
      FROM employee_time_off eto
      JOIN employees e ON eto.employee_id = e.id
      WHERE 1=1
    `;
    const params = [];
    
    if (employee_id) {
      params.push(employee_id);
      query += ` AND eto.employee_id = $${params.length}`;
    }
    
    if (start_date) {
      params.push(start_date);
      query += ` AND eto.end_date >= $${params.length}`;
    }
    
    if (end_date) {
      params.push(end_date);
      query += ` AND eto.start_date <= $${params.length}`;
    }
    
    query += ' ORDER BY eto.start_date ASC';
    
    const result = await pool.query(query, params);
    res.json(result.rows);
    
  } catch (error) {
    console.error('Error fetching time off:', error);
    res.status(500).json({ error: 'Failed to fetch time off entries' });
  }
});

// Get time off impact view
router.get('/impact', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM time_off_impact_view
      ORDER BY start_date ASC
    `);
    res.json(result.rows);
    
  } catch (error) {
    console.error('Error fetching time off impact:', error);
    res.status(500).json({ error: 'Failed to fetch time off impact' });
  }
});

// Get specific time off entry
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(`
      SELECT 
        eto.*,
        e.first_name || ' ' || e.last_name as employee_name,
        e.first_name,
        e.last_name
      FROM employee_time_off eto
      JOIN employees e ON eto.employee_id = e.id
      WHERE eto.id = $1
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Time off entry not found' });
    }
    
    res.json(result.rows[0]);
    
  } catch (error) {
    console.error('Error fetching time off entry:', error);
    res.status(500).json({ error: 'Failed to fetch time off entry' });
  }
});

// Create new time off entry
router.post('/', async (req, res) => {
  try {
    const { employee_id, start_date, end_date, reason } = req.body;
    
    // Validate required fields
    if (!employee_id || !start_date || !end_date) {
      return res.status(400).json({ 
        error: 'Missing required fields: employee_id, start_date, end_date' 
      });
    }
    
    // Validate date range
    if (new Date(end_date) < new Date(start_date)) {
      return res.status(400).json({ 
        error: 'End date must be after start date' 
      });
    }
    
    // Check for overlapping time off
    const overlapCheck = await pool.query(`
      SELECT id, start_date, end_date 
      FROM employee_time_off 
      WHERE employee_id = $1 
      AND (
        (start_date <= $2 AND end_date >= $2) OR
        (start_date <= $3 AND end_date >= $3) OR
        (start_date >= $2 AND end_date <= $3)
      )
    `, [employee_id, start_date, end_date]);
    
    if (overlapCheck.rows.length > 0) {
      return res.status(400).json({ 
        error: 'Time off overlaps with existing entry',
        existing: overlapCheck.rows[0]
      });
    }
    
    // Check if dates affect scheduled work
    const affectedJobs = await pool.query(`
      SELECT 
        j.job_number,
        j.priority_score,
        ss.start_datetime,
        jr.operation_name
      FROM schedule_slots ss
      JOIN job_routings jr ON ss.job_routing_id = jr.id
      JOIN jobs j ON jr.job_id = j.id
      WHERE ss.employee_id = $1
      AND ss.start_datetime::date BETWEEN $2 AND $3
      AND ss.status NOT IN ('completed')
      ORDER BY j.priority_score DESC
    `, [employee_id, start_date, end_date]);
    
    // Create the time off entry (this will trigger the displacement system)
    const result = await pool.query(`
      INSERT INTO employee_time_off (employee_id, start_date, end_date, reason)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [employee_id, start_date, end_date, reason || 'Time off']);
    
    // Get employee name for response
    const employeeResult = await pool.query(`
      SELECT first_name || ' ' || last_name as employee_name
      FROM employees WHERE id = $1
    `, [employee_id]);
    
    const response = {
      ...result.rows[0],
      employee_name: employeeResult.rows[0]?.employee_name,
      affected_jobs: affectedJobs.rows,
      message: affectedJobs.rows.length > 0 
        ? `Time off created. ${affectedJobs.rows.length} scheduled jobs will be affected and marked for rescheduling.`
        : 'Time off created with no impact on scheduled work.'
    };
    
    res.status(201).json(response);
    
  } catch (error) {
    console.error('Error creating time off:', error);
    res.status(500).json({ error: 'Failed to create time off entry' });
  }
});

// Update time off entry
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { start_date, end_date, reason } = req.body;
    
    // Get existing entry
    const existing = await pool.query(`
      SELECT * FROM employee_time_off WHERE id = $1
    `, [id]);
    
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Time off entry not found' });
    }
    
    // Update the entry
    const result = await pool.query(`
      UPDATE employee_time_off 
      SET 
        start_date = COALESCE($1, start_date),
        end_date = COALESCE($2, end_date),
        reason = COALESCE($3, reason),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $4
      RETURNING *
    `, [start_date, end_date, reason, id]);
    
    res.json({
      ...result.rows[0],
      message: 'Time off updated. Schedule will be automatically adjusted.'
    });
    
  } catch (error) {
    console.error('Error updating time off:', error);
    res.status(500).json({ error: 'Failed to update time off entry' });
  }
});

// Delete time off entry
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(`
      DELETE FROM employee_time_off 
      WHERE id = $1
      RETURNING *
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Time off entry not found' });
    }
    
    res.json({
      message: 'Time off entry deleted',
      deleted: result.rows[0]
    });
    
  } catch (error) {
    console.error('Error deleting time off:', error);
    res.status(500).json({ error: 'Failed to delete time off entry' });
  }
});

// Get system alerts related to time off
router.get('/alerts/current', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        id,
        alert_type,
        severity,
        message,
        details,
        created_at,
        acknowledged
      FROM system_alerts 
      WHERE alert_type IN (
        'high_priority_displacement',
        'firm_zone_time_off_conflict',
        'locked_job_operator_unavailable',
        'in_progress_job_pushed',
        'operator_substitution',
        'high_priority_no_substitute'
      )
      AND acknowledged = FALSE
      ORDER BY 
        CASE severity 
          WHEN 'critical' THEN 1
          WHEN 'high' THEN 2 
          WHEN 'medium' THEN 3
          ELSE 4
        END,
        created_at DESC
    `);
    
    res.json(result.rows);
    
  } catch (error) {
    console.error('Error fetching alerts:', error);
    res.status(500).json({ error: 'Failed to fetch alerts' });
  }
});

// Acknowledge alert
router.post('/alerts/:alertId/acknowledge', async (req, res) => {
  try {
    const { alertId } = req.params;
    const { user_id } = req.body; // Would come from authentication middleware
    
    const result = await pool.query(`
      UPDATE system_alerts 
      SET 
        acknowledged = TRUE,
        acknowledged_by = $1,
        acknowledged_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *
    `, [user_id || null, alertId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Alert not found' });
    }
    
    res.json(result.rows[0]);
    
  } catch (error) {
    console.error('Error acknowledging alert:', error);
    res.status(500).json({ error: 'Failed to acknowledge alert' });
  }
});

// Get displacement logs for time off events
router.get('/logs/displacement', async (req, res) => {
  try {
    const { limit = 50, employee_id } = req.query;
    
    let query = `
      SELECT 
        dl.*,
        e.first_name || ' ' || e.last_name as employee_name
      FROM displacement_logs dl
      LEFT JOIN employees e ON (dl.trigger_details->>'employee_id')::integer = e.id
      WHERE dl.trigger_type IN ('time_off', 'time_off_advanced')
    `;
    
    const params = [];
    
    if (employee_id) {
      params.push(employee_id);
      query += ` AND (dl.trigger_details->>'employee_id')::integer = $${params.length}`;
    }
    
    query += ` ORDER BY dl.created_at DESC LIMIT $${params.length + 1}`;
    params.push(limit);
    
    const result = await pool.query(query, params);
    res.json(result.rows);
    
  } catch (error) {
    console.error('Error fetching displacement logs:', error);
    res.status(500).json({ error: 'Failed to fetch displacement logs' });
  }
});

module.exports = router;