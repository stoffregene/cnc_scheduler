const express = require('express');
const DisplacementService = require('../services/displacementService');
const { Pool } = require('pg');
const router = express.Router();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5732/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Initialize displacement service with pool from app.locals
router.use((req, res, next) => {
  if (!req.displacementService) {
    req.displacementService = new DisplacementService(req.app.locals.pool);
  }
  next();
});

// Get displacement opportunities for a job (what-if analysis)
router.get('/opportunities/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    const { 
      startDate = new Date().toISOString(),
      requiredHours = 8 
    } = req.query;

    const opportunities = await req.displacementService.findDisplacementOpportunities(
      parseInt(jobId),
      new Date(startDate),
      parseFloat(requiredHours)
    );

    res.json({
      success: true,
      jobId: parseInt(jobId),
      opportunities
    });

  } catch (error) {
    console.error('Error getting displacement opportunities:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get displacement opportunities',
      details: error.message
    });
  }
});

// Calculate displacement impact (what-if analysis)
router.get('/impact/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;

    const impact = await req.displacementService.calculateDisplacementImpact(
      parseInt(jobId)
    );

    res.json({
      success: true,
      jobId: parseInt(jobId),
      impact
    });

  } catch (error) {
    console.error('Error calculating displacement impact:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to calculate displacement impact',
      details: error.message
    });
  }
});

// Schedule job with displacement if needed
router.post('/schedule/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    const options = req.body || {};

    console.log(`🎯 API request to schedule job ${jobId} with displacement`);

    const result = await req.displacementService.scheduleWithDisplacement(
      parseInt(jobId),
      options
    );

    res.json({
      success: result.success,
      jobId: parseInt(jobId),
      ...result
    });

  } catch (error) {
    console.error('Error scheduling with displacement:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to schedule job with displacement',
      details: error.message
    });
  }
});

// Schedule job with displacement if needed (alias for optimize all button)
router.post('/schedule-with-displacement/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    const options = req.body || {};

    console.log(`🎯 API request to schedule job ${jobId} with displacement (optimize all)`);

    const result = await req.displacementService.scheduleWithDisplacement(
      parseInt(jobId),
      options
    );

    res.json({
      success: result.success,
      jobId: parseInt(jobId),
      displacementUsed: result.displacementUsed,
      message: result.message,
      ...result
    });

  } catch (error) {
    console.error('Error scheduling with displacement:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to schedule job with displacement',
      details: error.message
    });
  }
});

// Get displacement history
router.get('/history', async (req, res) => {
  try {
    const {
      jobId,
      fromDate,
      toDate,
      successOnly,
      customerId,
      limit = 50
    } = req.query;

    const filters = {};
    if (jobId) filters.jobId = parseInt(jobId);
    if (fromDate) filters.fromDate = new Date(fromDate);
    if (toDate) filters.toDate = new Date(toDate);
    if (successOnly === 'true') filters.successOnly = true;
    if (customerId) filters.customerId = customerId;
    if (limit) filters.limit = parseInt(limit);

    const history = await req.displacementService.getDisplacementHistory(filters);

    res.json({
      success: true,
      history,
      count: history.length
    });

  } catch (error) {
    console.error('Error getting displacement history:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get displacement history',
      details: error.message
    });
  }
});

// Get detailed displacement information
router.get('/details/:logId', async (req, res) => {
  try {
    const { logId } = req.params;

    const details = await req.displacementService.getDisplacementDetails(
      parseInt(logId)
    );

    res.json({
      success: true,
      logId: parseInt(logId),
      details
    });

  } catch (error) {
    console.error('Error getting displacement details:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get displacement details',
      details: error.message
    });
  }
});

// Get displacement analytics
router.get('/analytics', async (req, res) => {
  try {
    const { fromDate, toDate } = req.query;
    
    const filters = {};
    if (fromDate) filters.fromDate = new Date(fromDate);
    if (toDate) filters.toDate = new Date(toDate);

    const analytics = await req.displacementService.getDisplacementAnalytics(filters);

    res.json({
      success: true,
      analytics
    });

  } catch (error) {
    console.error('Error getting displacement analytics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get displacement analytics',
      details: error.message
    });
  }
});

// Execute displacement for specific jobs (manual displacement)
router.post('/execute', async (req, res) => {
  try {
    const { triggerJobId, displacements, options = {} } = req.body;

    if (!triggerJobId || !displacements || !Array.isArray(displacements)) {
      return res.status(400).json({
        success: false,
        error: 'triggerJobId and displacements array are required'
      });
    }

    console.log(`🎯 Manual displacement execution for job ${triggerJobId}`);

    const result = await req.displacementService.executeDisplacement(
      triggerJobId,
      displacements,
      options
    );

    res.json({
      success: result.success,
      triggerJobId,
      result
    });

  } catch (error) {
    console.error('Error executing displacement:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to execute displacement',
      details: error.message
    });
  }
});

/**
 * DELETE /api/displacement/clear-logs
 * Clear all displacement logs
 */
router.delete('/clear-logs', async (req, res) => {
  try {
    console.log('Clearing all displacement logs...');
    
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Get count before deletion
      const countResult = await client.query('SELECT COUNT(*) as count FROM displacement_logs');
      const totalCount = parseInt(countResult.rows[0].count);
      
      // Delete all displacement data (cascading will handle related tables)
      await client.query('DELETE FROM displacement_logs');
      
      await client.query('COMMIT');
      
      console.log(`✅ Cleared ${totalCount} displacement logs`);
      
      res.json({
        success: true,
        message: `Successfully cleared ${totalCount} displacement logs`,
        deletedCount: totalCount
      });
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    
  } catch (error) {
    console.error('Error clearing displacement logs:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to clear displacement logs',
      message: error.message
    });
  }
});

module.exports = router;