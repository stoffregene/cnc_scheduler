const express = require('express');
const router = express.Router();

/**
 * Auto-detect and create assembly relationships when jobs are created
 */
router.post('/detect-relationships', async (req, res) => {
  try {
    const { pool } = req.app.locals;
    const { job_numbers } = req.body; // Array of job numbers to analyze
    
    if (!job_numbers || !Array.isArray(job_numbers)) {
      return res.status(400).json({ error: 'job_numbers array is required' });
    }
    
    const client = await pool.connect();
    const relationships = [];
    const updates = [];
    
    try {
      await client.query('BEGIN');
      
      // Find potential assembly relationships
      for (const jobNumber of job_numbers) {
        const componentMatch = jobNumber.match(/^(\d+)-(\d+)$/);
        if (componentMatch) {
          const baseJobNumber = componentMatch[1];
          const assemblySequence = parseInt(componentMatch[2]);
          
          // Check if parent job exists
          const parentResult = await client.query(
            'SELECT id FROM jobs WHERE job_number = $1',
            [baseJobNumber]
          );
          
          if (parentResult.rows.length > 0) {
            const parentId = parentResult.rows[0].id;
            
            // Get child job
            const childResult = await client.query(
              'SELECT id FROM jobs WHERE job_number = $1',
              [jobNumber]
            );
            
            if (childResult.rows.length > 0) {
              const childId = childResult.rows[0].id;
              
              // Update parent job
              await client.query(`
                UPDATE jobs 
                SET job_type = 'assembly_parent',
                    is_assembly_parent = true,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $1
              `, [parentId]);
              
              // Update child job  
              await client.query(`
                UPDATE jobs 
                SET job_type = 'assembly_component',
                    parent_job_id = $1,
                    assembly_sequence = $2,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $3
              `, [parentId, assemblySequence, childId]);
              
              // Create dependency (parent depends on child completion)
              await client.query(`
                INSERT INTO job_dependencies (dependent_job_id, prerequisite_job_id, dependency_type)
                VALUES ($1, $2, 'assembly')
                ON CONFLICT (dependent_job_id, prerequisite_job_id) DO NOTHING
              `, [parentId, childId]);
              
              relationships.push({
                parent: baseJobNumber,
                child: jobNumber,
                sequence: assemblySequence
              });
              
              updates.push(`Updated ${baseJobNumber} as assembly parent`);
              updates.push(`Updated ${jobNumber} as assembly component (seq ${assemblySequence})`);
              updates.push(`Created dependency: ${jobNumber} → ${baseJobNumber}`);
            }
          }
        }
      }
      
      await client.query('COMMIT');
      
      res.json({
        message: `Processed ${job_numbers.length} jobs for assembly relationships`,
        relationships,
        updates,
        detected: relationships.length
      });
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    
  } catch (error) {
    console.error('Error detecting assembly relationships:', error);
    res.status(500).json({ error: 'Failed to detect assembly relationships' });
  }
});

/**
 * Check if a job can be scheduled (respects dependencies)
 */
router.get('/can-schedule/:jobId', async (req, res) => {
  try {
    const { pool } = req.app.locals;
    const { jobId } = req.params;
    
    // Use the existing database function
    const result = await pool.query(`
      SELECT * FROM can_job_be_scheduled($1)
    `, [jobId]);
    
    res.json(result.rows[0]);
    
  } catch (error) {
    console.error('Error checking job scheduling constraints:', error);
    res.status(500).json({ error: 'Failed to check scheduling constraints' });
  }
});

/**
 * Manually create assembly relationship between jobs
 */
router.post('/create-relationship', async (req, res) => {
  try {
    const { pool } = req.app.locals;
    const { parent_job_id, child_job_ids, relationship_type = 'assembly' } = req.body;
    
    if (!parent_job_id || !child_job_ids || !Array.isArray(child_job_ids)) {
      return res.status(400).json({ 
        error: 'parent_job_id and child_job_ids array are required' 
      });
    }
    
    const client = await pool.connect();
    const results = [];
    
    try {
      await client.query('BEGIN');
      
      // Update parent job
      await client.query(`
        UPDATE jobs 
        SET job_type = 'assembly_parent',
            is_assembly_parent = true,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `, [parent_job_id]);
      
      // Get parent job info
      const parentInfo = await client.query(
        'SELECT job_number FROM jobs WHERE id = $1',
        [parent_job_id]
      );
      
      results.push(`Updated job ${parentInfo.rows[0].job_number} as assembly parent`);
      
      // Update each child job
      for (let i = 0; i < child_job_ids.length; i++) {
        const childId = child_job_ids[i];
        
        await client.query(`
          UPDATE jobs 
          SET job_type = 'assembly_component',
              parent_job_id = $1,
              assembly_sequence = $2,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = $3
        `, [parent_job_id, i + 1, childId]);
        
        // Create dependency (parent depends on child completion)
        await client.query(`
          INSERT INTO job_dependencies (dependent_job_id, prerequisite_job_id, dependency_type)
          VALUES ($1, $2, $3)
          ON CONFLICT (dependent_job_id, prerequisite_job_id) DO NOTHING
        `, [parent_job_id, childId, relationship_type]);
        
        // Get child job info
        const childInfo = await client.query(
          'SELECT job_number FROM jobs WHERE id = $1',
          [childId]
        );
        
        results.push(`Updated job ${childInfo.rows[0].job_number} as component (sequence ${i + 1})`);
        results.push(`Created dependency: ${childInfo.rows[0].job_number} → ${parentInfo.rows[0].job_number}`);
      }
      
      await client.query('COMMIT');
      
      res.json({
        message: `Successfully created assembly relationships`,
        parent_job_id,
        child_count: child_job_ids.length,
        updates: results
      });
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    
  } catch (error) {
    console.error('Error creating assembly relationship:', error);
    res.status(500).json({ error: 'Failed to create assembly relationship' });
  }
});

/**
 * Remove assembly relationship
 */
router.delete('/relationship/:parentJobId', async (req, res) => {
  try {
    const { pool } = req.app.locals;
    const { parentJobId } = req.params;
    
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Get child jobs
      const children = await client.query(
        'SELECT id, job_number FROM jobs WHERE parent_job_id = $1',
        [parentJobId]
      );
      
      // Remove dependencies
      await client.query(
        'DELETE FROM job_dependencies WHERE dependent_job_id = $1 OR prerequisite_job_id = $1',
        [parentJobId]
      );
      
      // Reset parent job
      await client.query(`
        UPDATE jobs 
        SET job_type = 'standard',
            is_assembly_parent = false,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `, [parentJobId]);
      
      // Reset child jobs
      await client.query(`
        UPDATE jobs 
        SET job_type = 'standard',
            parent_job_id = NULL,
            assembly_sequence = NULL,
            updated_at = CURRENT_TIMESTAMP
        WHERE parent_job_id = $1
      `, [parentJobId]);
      
      await client.query('COMMIT');
      
      res.json({
        message: `Removed assembly relationships`,
        parent_job_id: parentJobId,
        children_affected: children.rows.length
      });
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    
  } catch (error) {
    console.error('Error removing assembly relationship:', error);
    res.status(500).json({ error: 'Failed to remove assembly relationship' });
  }
});

/**
 * Get all assembly relationships
 */
router.get('/relationships', async (req, res) => {
  try {
    const { pool } = req.app.locals;
    
    const result = await pool.query(`
      SELECT 
        p.id as parent_id,
        p.job_number as parent_job_number,
        p.part_name as parent_part_name,
        json_agg(
          json_build_object(
            'id', c.id,
            'job_number', c.job_number,
            'part_name', c.part_name,
            'assembly_sequence', c.assembly_sequence,
            'status', c.status
          ) ORDER BY c.assembly_sequence
        ) as children
      FROM jobs p
      INNER JOIN jobs c ON p.id = c.parent_job_id
      WHERE p.is_assembly_parent = true
      GROUP BY p.id, p.job_number, p.part_name
      ORDER BY p.job_number
    `);
    
    res.json(result.rows);
    
  } catch (error) {
    console.error('Error fetching assembly relationships:', error);
    res.status(500).json({ error: 'Failed to fetch assembly relationships' });
  }
});

module.exports = router;