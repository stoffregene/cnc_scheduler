const express = require('express');
const router = express.Router();

// Get outsourcing summary for dashboard
router.get('/summary', async (req, res) => {
  try {
    const { pool } = req.app.locals;
    
    // Get jobs with outsourced operations and analyze their impact
    const result = await pool.query(`
      WITH outsourced_jobs AS (
        SELECT DISTINCT
          j.id,
          j.job_number,
          j.customer_name,
          j.part_name,
          j.due_date,
          j.promised_date,
          j.priority,
          j.status,
          j.is_stock_job
        FROM jobs j
        INNER JOIN job_routings jr ON j.id = jr.job_id
        WHERE jr.is_outsourced = true
          AND j.status NOT IN ('completed', 'cancelled')
      ),
      outsourced_operations AS (
        SELECT 
          oj.id as job_id,
          oj.job_number,
          oj.customer_name,
          oj.part_name,
          oj.due_date,
          oj.promised_date,
          oj.priority,
          oj.status,
          oj.is_stock_job,
          jr.id as routing_id,
          jr.operation_name,
          jr.sequence_order,
          jr.vendor_name,
          jr.vendor_lead_days,
          jr.estimated_hours,
          -- Calculate when this operation needs to be sent out
          CASE 
            WHEN oj.promised_date IS NOT NULL AND jr.vendor_lead_days > 0 
            THEN oj.promised_date - INTERVAL '1 day' * jr.vendor_lead_days
            ELSE NULL
          END as send_out_by_date,
          -- Check if there are operations after this one
          (SELECT COUNT(*) FROM job_routings jr2 
           WHERE jr2.job_id = jr.job_id 
           AND jr2.sequence_order > jr.sequence_order) as operations_after
        FROM outsourced_jobs oj
        INNER JOIN job_routings jr ON oj.id = jr.job_id
        WHERE jr.is_outsourced = true
      ),
      previous_operations AS (
        SELECT 
          oo.*,
          -- Get the latest operation that needs to be completed before outsourcing
          COALESCE(
            (SELECT MAX(jr_prev.sequence_order) 
             FROM job_routings jr_prev 
             WHERE jr_prev.job_id = oo.job_id 
             AND jr_prev.sequence_order < oo.sequence_order
             AND jr_prev.is_outsourced = false), 
            0
          ) as previous_op_sequence,
          -- Check if previous operations are scheduled
          CASE 
            WHEN (SELECT COUNT(*) 
                  FROM job_routings jr_prev
                  LEFT JOIN schedule_slots ss ON jr_prev.id = ss.job_routing_id
                  WHERE jr_prev.job_id = oo.job_id 
                  AND jr_prev.sequence_order < oo.sequence_order
                  AND jr_prev.is_outsourced = false
                  AND ss.id IS NULL) > 0
            THEN false
            ELSE true
          END as previous_ops_scheduled
        FROM outsourced_operations oo
      )
      SELECT 
        po.*,
        -- Calculate urgency status
        CASE 
          WHEN po.send_out_by_date IS NULL THEN 'no_date'
          WHEN po.send_out_by_date < CURRENT_DATE THEN 'overdue'
          WHEN po.send_out_by_date = CURRENT_DATE THEN 'due_today'
          WHEN po.send_out_by_date <= CURRENT_DATE + INTERVAL '3 days' THEN 'urgent'
          WHEN po.send_out_by_date <= CURRENT_DATE + INTERVAL '7 days' THEN 'soon'
          ELSE 'on_schedule'
        END as urgency_status,
        -- Days until send-out deadline
        CASE 
          WHEN po.send_out_by_date IS NOT NULL 
          THEN EXTRACT(DAY FROM (po.send_out_by_date - CURRENT_DATE))
          ELSE NULL
        END as days_until_sendout
      FROM previous_operations po
      ORDER BY 
        CASE 
          WHEN po.send_out_by_date < CURRENT_DATE THEN 1
          WHEN po.send_out_by_date = CURRENT_DATE THEN 2
          WHEN po.send_out_by_date <= CURRENT_DATE + INTERVAL '3 days' THEN 3
          ELSE 4
        END,
        po.send_out_by_date ASC,
        po.priority ASC
    `);
    
    // Group by urgency for summary stats
    const summaryStats = await pool.query(`
      WITH outsourced_summary AS (
        SELECT 
          jr.vendor_name,
          jr.vendor_lead_days,
          COUNT(*) as operation_count,
          COUNT(DISTINCT j.id) as job_count,
          AVG(jr.vendor_lead_days) as avg_lead_days,
          MIN(j.promised_date) as earliest_due_date,
          MAX(j.promised_date) as latest_due_date
        FROM jobs j
        INNER JOIN job_routings jr ON j.id = jr.job_id
        WHERE jr.is_outsourced = true
          AND j.status NOT IN ('completed', 'cancelled')
        GROUP BY jr.vendor_name, jr.vendor_lead_days
      )
      SELECT 
        vendor_name,
        vendor_lead_days,
        operation_count,
        job_count,
        avg_lead_days,
        earliest_due_date,
        latest_due_date
      FROM outsourced_summary
      ORDER BY operation_count DESC
    `);
    
    res.json({
      operations: result.rows,
      summary: summaryStats.rows,
      totals: {
        total_jobs: [...new Set(result.rows.map(r => r.job_id))].length,
        total_operations: result.rows.length,
        overdue: result.rows.filter(r => r.urgency_status === 'overdue').length,
        due_today: result.rows.filter(r => r.urgency_status === 'due_today').length,
        urgent: result.rows.filter(r => r.urgency_status === 'urgent').length,
        unscheduled_prereqs: result.rows.filter(r => !r.previous_ops_scheduled).length
      }
    });
    
  } catch (error) {
    console.error('Error fetching outsourcing summary:', error);
    res.status(500).json({ error: 'Failed to fetch outsourcing summary' });
  }
});

// Get detailed outsourcing analysis for a specific job
router.get('/job/:jobId', async (req, res) => {
  try {
    const { pool } = req.app.locals;
    const { jobId } = req.params;
    
    const result = await pool.query(`
      SELECT 
        j.job_number,
        j.customer_name,
        j.part_name,
        j.due_date,
        j.promised_date,
        j.priority,
        jr.id as routing_id,
        jr.operation_number,
        jr.operation_name,
        jr.sequence_order,
        jr.vendor_name,
        jr.vendor_lead_days,
        jr.estimated_hours,
        jr.is_outsourced,
        -- Previous operation info
        prev_jr.operation_name as previous_operation,
        prev_jr.sequence_order as previous_sequence,
        prev_ss.end_datetime as previous_completion_time,
        -- Next operation info  
        next_jr.operation_name as next_operation,
        next_jr.sequence_order as next_sequence,
        -- Calculate critical path
        j.promised_date - INTERVAL '1 day' * jr.vendor_lead_days as send_out_by_date
      FROM jobs j
      INNER JOIN job_routings jr ON j.id = jr.job_id
      LEFT JOIN job_routings prev_jr ON (
        prev_jr.job_id = jr.job_id 
        AND prev_jr.sequence_order = jr.sequence_order - 1
      )
      LEFT JOIN schedule_slots prev_ss ON prev_jr.id = prev_ss.job_routing_id
      LEFT JOIN job_routings next_jr ON (
        next_jr.job_id = jr.job_id 
        AND next_jr.sequence_order = jr.sequence_order + 1
      )
      WHERE j.id = $1
      ORDER BY jr.sequence_order
    `, [jobId]);
    
    res.json(result.rows);
    
  } catch (error) {
    console.error('Error fetching job outsourcing details:', error);
    res.status(500).json({ error: 'Failed to fetch job outsourcing details' });
  }
});

module.exports = router;