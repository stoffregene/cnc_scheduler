const express = require('express');
const router = express.Router();
const UndoService = require('../services/undoService');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5732/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

const undoService = new UndoService(pool);

/**
 * GET /api/undo/operations
 * Get available undo operations
 */
router.get('/operations', async (req, res) => {
  try {
    const { limit, offset, type } = req.query;
    
    const operations = await undoService.getAvailableUndoOperations({
      limit: limit ? parseInt(limit) : 20,
      offset: offset ? parseInt(offset) : 0,
      operationType: type || null
    });
    
    res.json({
      success: true,
      operations: operations,
      count: operations.length
    });
  } catch (error) {
    console.error('Error fetching undo operations:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch undo operations',
      message: error.message
    });
  }
});

/**
 * GET /api/undo/operations/:id
 * Get detailed information about a specific undo operation
 */
router.get('/operations/:id', async (req, res) => {
  try {
    const undoOperationId = parseInt(req.params.id);
    
    if (isNaN(undoOperationId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid undo operation ID'
      });
    }
    
    const result = await undoService.getUndoOperationDetails(undoOperationId);
    
    if (!result.success) {
      return res.status(404).json(result);
    }
    
    res.json(result);
  } catch (error) {
    console.error('Error fetching undo operation details:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch undo operation details',
      message: error.message
    });
  }
});

/**
 * POST /api/undo/execute/:id
 * Execute an undo operation
 */
router.post('/execute/:id', async (req, res) => {
  try {
    const undoOperationId = parseInt(req.params.id);
    
    if (isNaN(undoOperationId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid undo operation ID'
      });
    }
    
    console.log(`Executing undo operation ${undoOperationId}...`);
    const result = await undoService.executeUndo(undoOperationId);
    
    if (!result.success) {
      return res.status(400).json(result);
    }
    
    console.log(`Undo operation ${undoOperationId} completed successfully:`, {
      restoredJobs: result.restoredJobs,
      restoredOperations: result.restoredOperations
    });
    
    res.json(result);
  } catch (error) {
    console.error('Error executing undo operation:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to execute undo operation',
      message: error.message
    });
  }
});

/**
 * POST /api/undo/cleanup
 * Clean up expired undo operations
 */
router.post('/cleanup', async (req, res) => {
  try {
    const result = await undoService.cleanupExpiredOperations();
    res.json(result);
  } catch (error) {
    console.error('Error cleaning up undo operations:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to clean up undo operations',
      message: error.message
    });
  }
});

/**
 * GET /api/undo/stats
 * Get undo system statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const statsQuery = `
      SELECT 
        COUNT(*) as total_operations,
        COUNT(*) FILTER (WHERE is_undone = FALSE AND expires_at > NOW()) as available_operations,
        COUNT(*) FILTER (WHERE is_undone = TRUE) as completed_undos,
        COUNT(*) FILTER (WHERE expires_at <= NOW() AND is_undone = FALSE) as expired_operations,
        COUNT(*) FILTER (WHERE operation_type = 'displacement') as displacement_operations,
        COUNT(*) FILTER (WHERE operation_type = 'manual_reschedule') as manual_reschedule_operations,
        COUNT(*) FILTER (WHERE operation_type = 'auto_schedule') as auto_schedule_operations,
        COUNT(*) FILTER (WHERE operation_type = 'bulk_schedule') as bulk_schedule_operations
      FROM undo_operations
    `;
    
    const statsResult = await pool.query(statsQuery);
    const stats = statsResult.rows[0];
    
    // Convert string counts to numbers
    Object.keys(stats).forEach(key => {
      stats[key] = parseInt(stats[key]) || 0;
    });
    
    res.json({
      success: true,
      stats: stats
    });
  } catch (error) {
    console.error('Error fetching undo stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch undo statistics',
      message: error.message
    });
  }
});

module.exports = router;