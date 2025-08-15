const express = require('express');
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const { body, validationResult } = require('express-validator');
const JobBossCSVParser = require('../services/jobbossCSVParser');
const router = express.Router();

// Configure multer for file uploads
const upload = multer({ 
  dest: 'uploads/',
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'), false);
    }
  }
});

// Get all jobs
router.get('/', async (req, res) => {
  try {
    const { pool } = req.app.locals;
    const { status, priority, due_date } = req.query;
    
    let query = `
      SELECT j.*, 
             COUNT(s.id) as scheduled_count,
             COALESCE(SUM(EXTRACT(EPOCH FROM (s.end_time - s.start_time))/3600), 0) as total_scheduled_hours,
                           json_agg(
                json_build_object(
                  'id', jr.id,
                  'operation_number', jr.operation_number,
                  'operation_name', jr.operation_name,
                  'machine_id', jr.machine_id,
                  'machine_group_id', jr.machine_group_id,
                  'sequence_order', jr.sequence_order,
                  'estimated_hours', jr.estimated_hours,
                  'notes', jr.notes
                ) ORDER BY jr.sequence_order
              ) FILTER (WHERE jr.id IS NOT NULL) as routings
      FROM jobs j
      LEFT JOIN schedules s ON j.id = s.job_id
      LEFT JOIN job_routings jr ON j.id = jr.job_id
    `;
    
    const conditions = [];
    const params = [];
    let paramCount = 0;
    
    if (status) {
      paramCount++;
      conditions.push(`j.status = $${paramCount}`);
      params.push(status);
    }
    
    if (priority) {
      paramCount++;
      conditions.push(`j.priority = $${paramCount}`);
      params.push(priority);
    }
    
    if (due_date) {
      paramCount++;
      conditions.push(`j.due_date = $${paramCount}`);
      params.push(due_date);
    }
    
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    
    query += ' GROUP BY j.id ORDER BY j.priority ASC, j.due_date ASC';
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching jobs:', error);
    res.status(500).json({ error: 'Failed to fetch jobs' });
  }
});

// Get job by ID
router.get('/:id', async (req, res) => {
  try {
    const { pool } = req.app.locals;
    const { id } = req.params;
    
    const result = await pool.query(`
      SELECT j.*, 
             json_agg(
               json_build_object(
                 'id', s.id,
                 'machine_id', s.machine_id,
                 'employee_id', s.employee_id,
                 'start_time', s.start_time,
                 'end_time', s.end_time,
                 'status', s.status,
                 'notes', s.notes
               )
             ) as schedules
      FROM jobs j
      LEFT JOIN schedules s ON j.id = s.job_id
      WHERE j.id = $1
      GROUP BY j.id
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching job:', error);
    res.status(500).json({ error: 'Failed to fetch job' });
  }
});

// Create new job
router.post('/', [
  body('job_number').notEmpty().withMessage('Job number is required'),
  body('part_name').notEmpty().withMessage('Part name is required'),
  body('quantity').isInt({ min: 1 }).withMessage('Quantity must be at least 1'),
  body('priority').optional().isInt({ min: 1, max: 10 }).withMessage('Priority must be between 1 and 10')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const { pool } = req.app.locals;
    const {
      job_number, customer_name, part_name, part_number, quantity,
      priority, estimated_hours, due_date, material, material_size,
      operations, special_instructions, job_boss_data, routings
    } = req.body;
    
    // Start a transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Create the job
      const jobResult = await client.query(`
        INSERT INTO jobs (
          job_number, customer_name, part_name, part_number, quantity,
          priority, estimated_hours, due_date, material, material_size,
          operations, special_instructions, job_boss_data
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING *
      `, [
        job_number, customer_name, part_name, part_number, quantity,
        priority || 5, estimated_hours || null, due_date, material, material_size,
        operations, special_instructions, job_boss_data
      ]);
      
      const job = jobResult.rows[0];
      
      // Add routings if provided
      if (routings && Array.isArray(routings) && routings.length > 0) {
        const routingPromises = routings.map((routing) => 
          client.query(`
            INSERT INTO job_routings (
              job_id, operation_number, operation_name, machine_id, machine_group_id, 
              sequence_order, estimated_hours, notes
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          `, [
            job.id, 
            routing.operation_number,
            routing.operation_name,
            routing.machine_id || null,
            routing.machine_group_id || null,
            routing.sequence_order,
            (routing.estimated_hours && routing.estimated_hours !== '') ? parseFloat(routing.estimated_hours) : 0,
            routing.notes || null
          ])
        );
        await Promise.all(routingPromises);
      }
      
      await client.query('COMMIT');
      
      // Fetch the job with its routings
      const finalResult = await pool.query(`
        SELECT j.*, 
               json_agg(
                 json_build_object(
                   'id', jr.id,
                   'operation_number', jr.operation_number,
                   'operation_name', jr.operation_name,
                   'machine_id', jr.machine_id,
                   'machine_group_id', jr.machine_group_id,
                   'sequence_order', jr.sequence_order,
                   'estimated_hours', jr.estimated_hours,
                   'notes', jr.notes
                 ) ORDER BY jr.sequence_order
               ) FILTER (WHERE jr.id IS NOT NULL) as routings
        FROM jobs j
        LEFT JOIN job_routings jr ON j.id = jr.job_id
        WHERE j.id = $1
        GROUP BY j.id
      `, [job.id]);
      
      res.status(201).json(finalResult.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error creating job:', error);
    if (error.code === '23505') { // Unique violation
      res.status(400).json({ error: 'Job number already exists' });
    } else {
      res.status(500).json({ error: 'Failed to create job' });
    }
  }
});

// Update job
router.put('/:id', [
  body('priority').optional().isInt({ min: 1, max: 10 }).withMessage('Priority must be between 1 and 10')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const { pool } = req.app.locals;
    const { id } = req.params;
    const { routings, scheduled_count, total_scheduled_hours, updated_at, created_at, id: bodyId, ...updateFields } = req.body;
    
    // Start a transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Update the job
      if (Object.keys(updateFields).length > 0) {
        const setClause = Object.keys(updateFields)
          .map((key, index) => `${key} = $${index + 2}`)
          .join(', ');
        
        const values = [id, ...Object.values(updateFields)];
        
        const result = await client.query(`
          UPDATE jobs 
          SET ${setClause}, updated_at = CURRENT_TIMESTAMP
          WHERE id = $1
          RETURNING *
        `, values);
        
        if (result.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(404).json({ error: 'Job not found' });
        }
      }
      
      // Update routings if provided
      if (routings !== undefined) {
        // Delete existing routings
        await client.query('DELETE FROM job_routings WHERE job_id = $1', [id]);
        
        // Add new routings
        if (Array.isArray(routings) && routings.length > 0) {
          const routingPromises = routings.map((routing) => 
            client.query(`
              INSERT INTO job_routings (
                job_id, operation_number, operation_name, machine_id, machine_group_id, 
                sequence_order, estimated_hours, notes
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            `, [
              id, 
              routing.operation_number,
              routing.operation_name,
              routing.machine_id || null,
              routing.machine_group_id || null,
              routing.sequence_order,
              (routing.estimated_hours && routing.estimated_hours !== '') ? parseFloat(routing.estimated_hours) : 0,
              routing.notes || null
            ])
          );
          await Promise.all(routingPromises);
        }
      }
      
      await client.query('COMMIT');
      
      // Fetch the updated job with its routings
      const finalResult = await pool.query(`
        SELECT j.*, 
               json_agg(
                 json_build_object(
                   'id', jr.id,
                   'operation_number', jr.operation_number,
                   'operation_name', jr.operation_name,
                   'machine_id', jr.machine_id,
                   'machine_group_id', jr.machine_group_id,
                   'sequence_order', jr.sequence_order,
                   'estimated_hours', jr.estimated_hours,
                   'notes', jr.notes
                 ) ORDER BY jr.sequence_order
               ) FILTER (WHERE jr.id IS NOT NULL) as routings
        FROM jobs j
        LEFT JOIN job_routings jr ON j.id = jr.job_id
        WHERE j.id = $1
        GROUP BY j.id
      `, [id]);
      
      res.json(finalResult.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error updating job:', error);
    res.status(500).json({ error: 'Failed to update job' });
  }
});

// Delete job
router.delete('/:id', async (req, res) => {
  try {
    const { pool } = req.app.locals;
    const { id } = req.params;
    
    const result = await pool.query('DELETE FROM jobs WHERE id = $1 RETURNING *', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    res.json({ message: 'Job deleted successfully' });
  } catch (error) {
    console.error('Error deleting job:', error);
    res.status(500).json({ error: 'Failed to delete job' });
  }
});

// Import jobs from JobBoss CSV format
router.post('/import', upload.single('csvFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No CSV file uploaded' });
    }
    
    const { pool } = req.app.locals;
    
    console.log('Starting JobBoss CSV import...');
    
    // Parse CSV using JobBoss parser
    const parser = new JobBossCSVParser(pool);
    const parsedData = await parser.parseCSV(req.file.path);
    
    console.log(`Parsed ${parsedData.jobs.length} jobs and ${parsedData.routings.length} routing lines`);
    
    // Start database transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      const insertedJobs = [];
      const insertedRoutings = [];
      const assemblyRelationships = [];
      const vendorData = [];
      
      // Insert jobs first
      for (const job of parsedData.jobs) {
        // Handle jobs that should be removed (CLOSED status)
        if (job.status === 'completed' && job.job_boss_data.status === 'CLOSED') {
          // Remove from schedule if exists
          await client.query(`
            DELETE FROM schedule_slots WHERE job_id = (
              SELECT id FROM jobs WHERE job_number = $1
            )
          `, [job.job_number]);
          
          // Mark as completed or delete
          await client.query(`
            UPDATE jobs SET 
              status = 'completed', 
              completion_date = CURRENT_DATE,
              updated_at = CURRENT_TIMESTAMP
            WHERE job_number = $1
          `, [job.job_number]);
          
          continue;
        }
        
        const result = await client.query(`
          INSERT INTO jobs (
            job_number, customer_name, part_name, part_number, quantity,
            priority, estimated_hours, due_date, promised_date, start_date, status,
            material, special_instructions, job_boss_data, job_type, 
            is_assembly_parent, assembly_sequence, link_material,
            material_lead_days, material_due_date, material_req
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
          ON CONFLICT (job_number) DO UPDATE SET
            customer_name = EXCLUDED.customer_name,
            part_name = EXCLUDED.part_name,
            part_number = EXCLUDED.part_number,
            quantity = EXCLUDED.quantity,
            priority = EXCLUDED.priority,
            estimated_hours = EXCLUDED.estimated_hours,
            due_date = EXCLUDED.due_date,
            promised_date = EXCLUDED.promised_date,
            start_date = EXCLUDED.start_date,
            status = EXCLUDED.status,
            material = EXCLUDED.material,
            special_instructions = EXCLUDED.special_instructions,
            job_boss_data = EXCLUDED.job_boss_data,
            job_type = EXCLUDED.job_type,
            is_assembly_parent = EXCLUDED.is_assembly_parent,
            assembly_sequence = EXCLUDED.assembly_sequence,
            link_material = EXCLUDED.link_material,
            material_lead_days = EXCLUDED.material_lead_days,
            material_due_date = EXCLUDED.material_due_date,
            material_req = EXCLUDED.material_req,
            updated_at = CURRENT_TIMESTAMP
          RETURNING *
        `, [
          job.job_number, job.customer_name, job.part_name, job.part_number,
          job.quantity, job.priority, job.estimated_hours, job.due_date,
          job.promised_date, job.start_date, job.status, job.material,
          job.special_instructions, job.job_boss_data, job.job_type,
          job.is_assembly_parent, job.assembly_sequence, job.link_material,
          job.material_lead_days, job.material_due_date, job.material_req
        ]);
        
        insertedJobs.push(result.rows[0]);
      }
      
      // Create a map of job_number to job_id for routing insertion
      const jobIdMap = new Map();
      insertedJobs.forEach(job => {
        jobIdMap.set(job.job_number, job.id);
      });
      
      // Insert job routings
      for (const routing of parsedData.routings) {
        const jobId = jobIdMap.get(routing.job_number);
        if (!jobId) continue;
        
        const result = await client.query(`
          INSERT INTO job_routings (
            job_id, operation_number, operation_name, machine_id, machine_group_id,
            sequence_order, estimated_hours, notes, is_outsourced, 
            vendor_name, vendor_lead_days, routing_status
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          ON CONFLICT (job_id, operation_number) DO UPDATE SET
            operation_name = EXCLUDED.operation_name,
            machine_id = EXCLUDED.machine_id,
            machine_group_id = EXCLUDED.machine_group_id,
            sequence_order = EXCLUDED.sequence_order,
            estimated_hours = EXCLUDED.estimated_hours,
            notes = EXCLUDED.notes,
            is_outsourced = EXCLUDED.is_outsourced,
            vendor_name = EXCLUDED.vendor_name,
            vendor_lead_days = EXCLUDED.vendor_lead_days,
            routing_status = EXCLUDED.routing_status,
            updated_at = CURRENT_TIMESTAMP
          RETURNING *
        `, [
          jobId, routing.operation_number, routing.operation_name,
          routing.machine_id, routing.machine_group_id, routing.sequence_order,
          routing.estimated_hours, routing.notes, routing.is_outsourced,
          routing.vendor_name, routing.vendor_lead_days, routing.routing_status
        ]);
        
        insertedRoutings.push(result.rows[0]);
      }
      
      // Handle assembly relationships
      for (const [baseJobNumber, assemblyGroup] of parsedData.assemblyGroups) {
        const parentJob = insertedJobs.find(j => j.job_number === baseJobNumber);
        if (parentJob && assemblyGroup.children.length > 0) {
          
          // Update parent job reference for children
          for (const childJobData of assemblyGroup.children) {
            const childJob = insertedJobs.find(j => j.job_number === childJobData.job_number);
            if (childJob) {
              await client.query(`
                UPDATE jobs SET parent_job_id = $1 WHERE id = $2
              `, [parentJob.id, childJob.id]);
              
              // Create dependency
              await client.query(`
                INSERT INTO job_dependencies (dependent_job_id, prerequisite_job_id, dependency_type)
                VALUES ($1, $2, 'assembly')
                ON CONFLICT (dependent_job_id, prerequisite_job_id) DO NOTHING
              `, [parentJob.id, childJob.id]);
              
              assemblyRelationships.push({
                parent: parentJob.job_number,
                child: childJob.job_number
              });
            }
          }
        }
      }
      
      // Store vendor data for lead time tracking
      for (const [vendorName, leadDays] of parsedData.vendors) {
        vendorData.push({ name: vendorName, lead_days: leadDays });
        
        // Insert/update vendor record
        await client.query(`
          INSERT INTO vendors (name, lead_days, vendor_type, status)
          VALUES ($1, $2, 'outsource', 'active')
          ON CONFLICT (name) DO UPDATE SET
            lead_days = EXCLUDED.lead_days,
            updated_at = CURRENT_TIMESTAMP
        `, [vendorName, leadDays]);
      }
      
      await client.query('COMMIT');
      
      // Clean up uploaded file
      fs.unlinkSync(req.file.path);
      
      const summary = {
        message: `Successfully imported ${insertedJobs.length} jobs with ${insertedRoutings.length} routing operations`,
        totalJobs: insertedJobs.length,
        totalRoutings: insertedRoutings.length,
        assemblyGroups: parsedData.assemblyGroups.size,
        assemblyRelationships: assemblyRelationships.length,
        vendorsFound: vendorData.length,
        jobs: insertedJobs,
        routings: insertedRoutings
      };
      
      if (assemblyRelationships.length > 0) {
        summary.assemblyDetails = assemblyRelationships;
      }
      
      if (vendorData.length > 0) {
        summary.vendorDetails = vendorData;
      }
      
      console.log('JobBoss CSV import completed successfully');
      res.json(summary);
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    
  } catch (error) {
    console.error('Error processing JobBoss CSV:', error);
    res.status(500).json({ 
      error: 'Failed to import JobBoss CSV', 
      details: error.message 
    });
  }
});

// Get assembly jobs view
router.get('/assemblies', async (req, res) => {
  try {
    const { pool } = req.app.locals;
    
    const result = await pool.query(`
      SELECT * FROM assembly_jobs_view
      ORDER BY assembly_job_number
    `);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching assembly jobs:', error);
    res.status(500).json({ error: 'Failed to fetch assembly jobs' });
  }
});

// Get job dependencies and scheduling constraints
router.get('/:id/dependencies', async (req, res) => {
  try {
    const { pool } = req.app.locals;
    const { id } = req.params;
    
    // Get dependency check
    const canScheduleResult = await pool.query(`
      SELECT * FROM can_job_be_scheduled($1)
    `, [id]);
    
    // Get dependency tree
    const dependencyTreeResult = await pool.query(`
      SELECT * FROM get_job_dependency_tree($1)
    `, [id]);
    
    // Get job details
    const jobResult = await pool.query(`
      SELECT job_number, job_type, is_assembly_parent, parent_job_id, assembly_sequence, status
      FROM jobs WHERE id = $1
    `, [id]);
    
    const response = {
      job: jobResult.rows[0],
      can_schedule: canScheduleResult.rows[0]?.can_schedule || true,
      blocking_jobs: canScheduleResult.rows[0]?.blocking_job_numbers || [],
      dependency_tree: dependencyTreeResult.rows
    };
    
    res.json(response);
  } catch (error) {
    console.error('Error fetching job dependencies:', error);
    res.status(500).json({ error: 'Failed to fetch job dependencies' });
  }
});

// Get job routings for sequence validation
router.get('/:id/routings', async (req, res) => {
  try {
    const { pool } = req.app.locals;
    const { id } = req.params;
    
    const result = await pool.query(`
      SELECT 
        jr.id, jr.operation_number, jr.operation_name, jr.machine_id,
        jr.machine_group_id, jr.sequence_order, jr.estimated_hours, jr.notes
      FROM job_routings jr
      WHERE jr.job_id = $1
      ORDER BY jr.sequence_order, jr.operation_number
    `, [id]);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching job routings:', error);
    res.status(500).json({ error: 'Failed to fetch job routings' });
  }
});

// Update a specific job routing (for machine swapping)
router.put('/:jobId/routings/:routingId', async (req, res) => {
  try {
    const { pool } = req.app.locals;
    const { jobId, routingId } = req.params;
    const { machine_id, machine_group_id } = req.body;

    // Validate that the routing belongs to the job
    const routingCheck = await pool.query(
      'SELECT id FROM job_routings WHERE id = $1 AND job_id = $2',
      [routingId, jobId]
    );

    if (routingCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Routing not found for this job' });
    }

    // Update the routing
    const result = await pool.query(`
      UPDATE job_routings 
      SET machine_id = $1,
          machine_group_id = $2,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $3 AND job_id = $4
      RETURNING *
    `, [machine_id, machine_group_id, routingId, jobId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Failed to update routing' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating job routing:', error);
    res.status(500).json({ error: 'Failed to update job routing' });
  }
});

module.exports = router;
