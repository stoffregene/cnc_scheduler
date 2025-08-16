const express = require('express');
const router = express.Router();

// Get inspection queue dashboard
router.get('/queue', async (req, res) => {
  try {
    const { status, limit = 50 } = req.query;
    
    let query = `
      SELECT * FROM inspection_dashboard
    `;
    
    const params = [];
    if (status) {
      query += ` WHERE status = $1`;
      params.push(status);
    }
    
    query += ` LIMIT $${params.length + 1}`;
    params.push(parseInt(limit));
    
    const result = await req.app.locals.pool.query(query, params);
    
    res.json({
      success: true,
      queue: result.rows,
      count: result.rows.length
    });
    
  } catch (error) {
    console.error('Error fetching inspection queue:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch inspection queue',
      details: error.message
    });
  }
});

// Update inspection status
router.put('/queue/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, inspector_notes } = req.body;
    
    const validStatuses = ['awaiting', 'in_progress', 'completed', 'hold'];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
      });
    }
    
    const updates = [];
    const params = [];
    let paramCount = 1;
    
    if (status) {
      updates.push(`status = $${paramCount}`);
      params.push(status);
      paramCount++;
      
      // Set timestamps based on status
      if (status === 'in_progress') {
        updates.push(`inspection_started_at = NOW()`);
      } else if (status === 'completed') {
        updates.push(`inspection_completed_at = NOW()`);
      }
    }
    
    if (inspector_notes !== undefined) {
      updates.push(`inspector_notes = $${paramCount}`);
      params.push(inspector_notes);
      paramCount++;
    }
    
    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid updates provided'
      });
    }
    
    params.push(id);
    const query = `
      UPDATE inspection_queue 
      SET ${updates.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;
    
    const result = await req.app.locals.pool.query(query, params);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Inspection queue item not found'
      });
    }
    
    res.json({
      success: true,
      item: result.rows[0]
    });
    
  } catch (error) {
    console.error('Error updating inspection queue:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update inspection queue',
      details: error.message
    });
  }
});

// Get inspection analytics
router.get('/analytics', async (req, res) => {
  try {
    const analyticsQuery = `
      SELECT 
        COUNT(*) as total_items,
        COUNT(*) FILTER (WHERE status = 'awaiting') as awaiting_count,
        COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress_count,
        COUNT(*) FILTER (WHERE status = 'completed') as completed_count,
        COUNT(*) FILTER (WHERE status = 'hold') as hold_count,
        AVG(EXTRACT(EPOCH FROM (NOW() - entered_queue_at))/3600) as avg_hours_in_queue,
        AVG(EXTRACT(EPOCH FROM (inspection_completed_at - entered_queue_at))/3600) 
          FILTER (WHERE status = 'completed') as avg_completion_time_hours
      FROM inspection_queue
      WHERE entered_queue_at >= NOW() - INTERVAL '30 days'
    `;
    
    const analyticsResult = await req.app.locals.pool.query(analyticsQuery);
    
    // Get top customers in queue
    const customerQuery = `
      SELECT customer_name, COUNT(*) as items_count
      FROM inspection_queue
      WHERE status IN ('awaiting', 'in_progress')
      GROUP BY customer_name
      ORDER BY items_count DESC
      LIMIT 10
    `;
    
    const customerResult = await req.app.locals.pool.query(customerQuery);
    
    res.json({
      success: true,
      analytics: {
        summary: analyticsResult.rows[0],
        top_customers: customerResult.rows
      }
    });
    
  } catch (error) {
    console.error('Error fetching inspection analytics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch inspection analytics',
      details: error.message
    });
  }
});

// Clear completed items from queue (for maintenance)
router.delete('/queue/completed', async (req, res) => {
  try {
    const { older_than_days = 7 } = req.query;
    
    const result = await req.app.locals.pool.query(`
      DELETE FROM inspection_queue 
      WHERE status = 'completed' 
        AND inspection_completed_at < NOW() - INTERVAL '${parseInt(older_than_days)} days'
      RETURNING COUNT(*) as deleted_count
    `);
    
    res.json({
      success: true,
      deleted_count: result.rowCount,
      message: `Cleared ${result.rowCount} completed inspection items older than ${older_than_days} days`
    });
    
  } catch (error) {
    console.error('Error clearing completed items:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to clear completed items',
      details: error.message
    });
  }
});

module.exports = router;