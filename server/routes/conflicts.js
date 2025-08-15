const express = require('express');
const { body, query, validationResult } = require('express-validator');
const ConflictDetectionService = require('../services/conflictDetectionService');
const router = express.Router();

// Get all detected conflicts with filtering options
router.get('/', [
  query('startDate').optional().isISO8601().withMessage('Start date must be valid ISO date'),
  query('endDate').optional().isISO8601().withMessage('End date must be valid ISO date'),
  query('severity').optional().isIn(['critical', 'high', 'medium', 'low']).withMessage('Invalid severity level'),
  query('status').optional().isIn(['detected', 'acknowledged', 'resolving', 'resolved', 'ignored']).withMessage('Invalid status'),
  query('conflictType').optional().isString().withMessage('Conflict type must be string'),
  query('limit').optional().isInt({ min: 1, max: 1000 }).withMessage('Limit must be between 1 and 1000')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { pool } = req.app.locals;
    const { 
      startDate, 
      endDate, 
      severity, 
      status, 
      conflictType,
      limit = 100 
    } = req.query;

    let whereConditions = [];
    let queryParams = [];
    let paramCount = 0;

    if (startDate) {
      paramCount++;
      whereConditions.push(`dc.created_at >= $${paramCount}`);
      queryParams.push(startDate);
    }

    if (endDate) {
      paramCount++;
      whereConditions.push(`dc.created_at <= $${paramCount}`);
      queryParams.push(endDate);
    }

    if (severity) {
      paramCount++;
      whereConditions.push(`dc.severity = $${paramCount}`);
      queryParams.push(severity);
    }

    if (status) {
      paramCount++;
      whereConditions.push(`dc.status = $${paramCount}`);
      queryParams.push(status);
    }

    if (conflictType) {
      paramCount++;
      whereConditions.push(`dc.conflict_type = $${paramCount}`);
      queryParams.push(conflictType);
    }

    const whereClause = whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : '';

    const query = `
      SELECT 
        dc.*,
        cdr.detection_date,
        
        -- Get job details
        (SELECT array_agg(
          json_build_object(
            'id', j.id,
            'job_number', j.job_number,
            'customer_name', j.customer_name,
            'part_name', j.part_name
          )
        ) FROM jobs j WHERE j.id = ANY(dc.affected_job_ids)) as affected_jobs,
        
        -- Get employee details
        (SELECT array_agg(
          json_build_object(
            'id', e.id,
            'name', e.first_name || ' ' || e.last_name,
            'department', e.department
          )
        ) FROM employees e WHERE e.id = ANY(dc.affected_employee_ids)) as affected_employees,
        
        -- Get machine details
        (SELECT array_agg(
          json_build_object(
            'id', m.id,
            'name', m.name,
            'model', m.model
          )
        ) FROM machines m WHERE m.id = ANY(dc.affected_machine_ids)) as affected_machines,
        
        -- Get resolver details
        CASE 
          WHEN dc.resolved_by IS NOT NULL THEN
            json_build_object(
              'id', resolver.id,
              'name', resolver.first_name || ' ' || resolver.last_name
            )
          ELSE NULL
        END as resolved_by_user
        
      FROM detected_conflicts dc
      JOIN conflict_detection_runs cdr ON dc.detection_run_id = cdr.id
      LEFT JOIN employees resolver ON dc.resolved_by = resolver.id
      ${whereClause}
      ORDER BY 
        CASE dc.severity 
          WHEN 'critical' THEN 1 
          WHEN 'high' THEN 2 
          WHEN 'medium' THEN 3 
          ELSE 4 
        END,
        dc.created_at DESC
      LIMIT $${paramCount + 1}
    `;

    queryParams.push(limit);

    const result = await pool.query(query, queryParams);
    res.json(result.rows);

  } catch (error) {
    console.error('Error fetching conflicts:', error);
    res.status(500).json({ error: 'Failed to fetch conflicts' });
  }
});

// Run conflict detection
router.post('/detect', [
  body('startDate').optional().isISO8601().withMessage('Start date must be valid ISO date'),
  body('endDate').optional().isISO8601().withMessage('End date must be valid ISO date'),
  body('jobId').optional().isInt().withMessage('Job ID must be integer'),
  body('includeResolved').optional().isBoolean().withMessage('Include resolved must be boolean')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { pool } = req.app.locals;
    const startTime = Date.now();

    const conflictDetection = new ConflictDetectionService(pool);
    const detectionResult = await conflictDetection.detectAllConflicts(req.body);

    const endTime = Date.now();
    const duration = endTime - startTime;

    // Log the detection run to database
    const runId = await conflictDetection.logConflicts(
      detectionResult.conflicts, 
      { ...detectionResult, run_duration_ms: duration }
    );

    res.json({
      ...detectionResult,
      detection_run_id: runId,
      run_duration_ms: duration
    });

  } catch (error) {
    console.error('Error running conflict detection:', error);
    res.status(500).json({ error: 'Failed to run conflict detection' });
  }
});

// Get conflict detection dashboard data
router.get('/dashboard', async (req, res) => {
  try {
    const { pool } = req.app.locals;

    const query = `
      SELECT 
        *,
        CASE 
          WHEN hours_since_detection < 1 THEN 'recent'
          WHEN hours_since_detection < 24 THEN 'today'
          WHEN hours_since_detection < 168 THEN 'this_week'
          ELSE 'older'
        END as age_category
      FROM conflict_dashboard
      WHERE status != 'resolved' OR resolved_at > CURRENT_TIMESTAMP - INTERVAL '7 days'
      ORDER BY 
        CASE severity 
          WHEN 'critical' THEN 1 
          WHEN 'high' THEN 2 
          WHEN 'medium' THEN 3 
          ELSE 4 
        END,
        created_at DESC
      LIMIT 100
    `;

    const result = await pool.query(query);

    // Get summary statistics
    const summaryQuery = `
      SELECT 
        COUNT(*) as total_active_conflicts,
        COUNT(*) FILTER (WHERE severity = 'critical') as critical_count,
        COUNT(*) FILTER (WHERE severity = 'high') as high_count,
        COUNT(*) FILTER (WHERE severity = 'medium') as medium_count,
        COUNT(*) FILTER (WHERE severity = 'low') as low_count,
        COUNT(*) FILTER (WHERE status = 'detected') as unacknowledged_count,
        COUNT(*) FILTER (WHERE status = 'resolving') as in_progress_count,
        AVG(hours_since_detection) as avg_age_hours
      FROM conflict_dashboard
      WHERE status != 'resolved'
    `;

    const summaryResult = await pool.query(summaryQuery);

    res.json({
      conflicts: result.rows,
      summary: summaryResult.rows[0]
    });

  } catch (error) {
    console.error('Error fetching conflict dashboard:', error);
    res.status(500).json({ error: 'Failed to fetch conflict dashboard' });
  }
});

// Update conflict status
router.put('/:id/status', [
  body('status').isIn(['detected', 'acknowledged', 'resolving', 'resolved', 'ignored']).withMessage('Invalid status'),
  body('resolution_action').optional().isString().withMessage('Resolution action must be string'),
  body('resolution_notes').optional().isString().withMessage('Resolution notes must be string'),
  body('resolved_by').optional().isInt().withMessage('Resolved by must be integer')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { pool } = req.app.locals;
    const { id } = req.params;
    const { status, resolution_action, resolution_notes, resolved_by } = req.body;

    const resolved_at = status === 'resolved' ? 'CURRENT_TIMESTAMP' : null;

    const result = await pool.query(`
      UPDATE detected_conflicts 
      SET 
        status = $1,
        resolution_action = $2,
        resolution_notes = $3,
        resolved_by = $4,
        resolved_at = ${resolved_at ? resolved_at : 'NULL'},
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $5
      RETURNING *
    `, [status, resolution_action, resolution_notes, resolved_by, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Conflict not found' });
    }

    res.json(result.rows[0]);

  } catch (error) {
    console.error('Error updating conflict status:', error);
    res.status(500).json({ error: 'Failed to update conflict status' });
  }
});

// Get specific conflict with detailed information
router.get('/:id', async (req, res) => {
  try {
    const { pool } = req.app.locals;
    const { id } = req.params;

    const query = `
      SELECT 
        dc.*,
        cdr.detection_date,
        cdr.total_conflicts_found as run_total_conflicts,
        
        -- Get detailed job information
        (SELECT array_agg(
          json_build_object(
            'id', j.id,
            'job_number', j.job_number,
            'customer_name', j.customer_name,
            'part_name', j.part_name,
            'part_number', j.part_number,
            'due_date', j.due_date,
            'priority', j.priority,
            'status', j.status
          )
        ) FROM jobs j WHERE j.id = ANY(dc.affected_job_ids)) as affected_jobs,
        
        -- Get detailed employee information
        (SELECT array_agg(
          json_build_object(
            'id', e.id,
            'name', e.first_name || ' ' || e.last_name,
            'employee_id', e.employee_id,
            'department', e.department,
            'position', e.position
          )
        ) FROM employees e WHERE e.id = ANY(dc.affected_employee_ids)) as affected_employees,
        
        -- Get detailed machine information
        (SELECT array_agg(
          json_build_object(
            'id', m.id,
            'name', m.name,
            'model', m.model,
            'manufacturer', m.manufacturer,
            'status', m.status
          )
        ) FROM machines m WHERE m.id = ANY(dc.affected_machine_ids)) as affected_machines,
        
        -- Get resolution attempts
        (SELECT array_agg(
          json_build_object(
            'id', cr.id,
            'resolution_type', cr.resolution_type,
            'success', cr.success,
            'error_message', cr.error_message,
            'jobs_affected', cr.jobs_affected,
            'operators_affected', cr.operators_affected,
            'machines_affected', cr.machines_affected,
            'created_at', cr.created_at
          ) ORDER BY cr.created_at DESC
        ) FROM conflict_resolutions cr WHERE cr.conflict_id = dc.id) as resolution_attempts
        
      FROM detected_conflicts dc
      JOIN conflict_detection_runs cdr ON dc.detection_run_id = cdr.id
      WHERE dc.id = $1
    `;

    const result = await pool.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Conflict not found' });
    }

    res.json(result.rows[0]);

  } catch (error) {
    console.error('Error fetching conflict details:', error);
    res.status(500).json({ error: 'Failed to fetch conflict details' });
  }
});

// Get conflict statistics
router.get('/stats/overview', async (req, res) => {
  try {
    const { pool } = req.app.locals;
    const { 
      startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), 
      endDate = new Date().toISOString() 
    } = req.query;

    const query = `
      WITH conflict_stats AS (
        SELECT 
          DATE(dc.created_at) as conflict_date,
          dc.conflict_type,
          dc.severity,
          dc.status,
          COUNT(*) as count
        FROM detected_conflicts dc
        WHERE dc.created_at BETWEEN $1 AND $2
        GROUP BY DATE(dc.created_at), dc.conflict_type, dc.severity, dc.status
      ),
      daily_totals AS (
        SELECT 
          conflict_date,
          SUM(count) as total_conflicts,
          SUM(CASE WHEN severity = 'critical' THEN count ELSE 0 END) as critical_conflicts,
          SUM(CASE WHEN status = 'resolved' THEN count ELSE 0 END) as resolved_conflicts
        FROM conflict_stats
        GROUP BY conflict_date
      ),
      type_breakdown AS (
        SELECT 
          conflict_type,
          SUM(count) as total_count,
          AVG(count) as avg_daily_count
        FROM conflict_stats
        GROUP BY conflict_type
      )
      SELECT 
        json_build_object(
          'daily_trends', (SELECT array_agg(row_to_json(dt)) FROM daily_totals dt ORDER BY dt.conflict_date),
          'type_breakdown', (SELECT array_agg(row_to_json(tb)) FROM type_breakdown tb ORDER BY tb.total_count DESC),
          'overall_summary', (
            SELECT json_build_object(
              'total_conflicts', SUM(count),
              'avg_daily_conflicts', AVG(count),
              'resolution_rate', 
                CASE 
                  WHEN SUM(count) > 0 THEN 
                    ROUND(SUM(CASE WHEN status = 'resolved' THEN count ELSE 0 END)::DECIMAL / SUM(count) * 100, 2)
                  ELSE 0 
                END
            )
            FROM conflict_stats
          )
        ) as stats
    `;

    const result = await pool.query(query, [startDate, endDate]);
    res.json(result.rows[0].stats);

  } catch (error) {
    console.error('Error fetching conflict statistics:', error);
    res.status(500).json({ error: 'Failed to fetch conflict statistics' });
  }
});

module.exports = router;