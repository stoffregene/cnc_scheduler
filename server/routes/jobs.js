const express = require('express');
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const { body, validationResult } = require('express-validator');
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
        priority || 5, estimated_hours, due_date, material, material_size,
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
            routing.estimated_hours || 0,
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
    const { routings, ...updateFields } = req.body;
    
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
              routing.estimated_hours || 0,
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

// Import jobs from CSV
router.post('/import', upload.single('csvFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No CSV file uploaded' });
    }
    
    const { pool } = req.app.locals;
    const jobs = [];
    
    // Parse CSV file
    fs.createReadStream(req.file.path)
      .pipe(csv())
      .on('data', (row) => {
        // Map CSV columns to job fields (adjust based on your JobBoss export format)
        const job = {
          job_number: row.JobNumber || row.job_number,
          customer_name: row.CustomerName || row.customer_name,
          part_name: row.PartName || row.part_name,
          part_number: row.PartNumber || row.part_number,
          quantity: parseInt(row.Quantity || row.quantity) || 0,
          priority: parseInt(row.Priority || row.priority) || 5,
          estimated_hours: parseFloat(row.EstimatedHours || row.estimated_hours) || null,
          due_date: row.DueDate || row.due_date,
          material: row.Material || row.material,
          material_size: row.MaterialSize || row.material_size,
          operations: row.Operations ? row.Operations.split(',').map(op => op.trim()) : [],
          special_instructions: row.SpecialInstructions || row.special_instructions,
          job_boss_data: row
        };
        
        if (job.job_number && job.part_name) {
          jobs.push(job);
        }
      })
      .on('end', async () => {
        try {
          // Insert jobs into database
          const insertedJobs = [];
          for (const job of jobs) {
            const result = await pool.query(`
              INSERT INTO jobs (
                job_number, customer_name, part_name, part_number, quantity,
                priority, estimated_hours, due_date, material, material_size,
                operations, special_instructions, job_boss_data
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
              ON CONFLICT (job_number) DO UPDATE SET
                customer_name = EXCLUDED.customer_name,
                part_name = EXCLUDED.part_name,
                part_number = EXCLUDED.part_number,
                quantity = EXCLUDED.quantity,
                priority = EXCLUDED.priority,
                estimated_hours = EXCLUDED.estimated_hours,
                due_date = EXCLUDED.due_date,
                material = EXCLUDED.material,
                material_size = EXCLUDED.material_size,
                operations = EXCLUDED.operations,
                special_instructions = EXCLUDED.special_instructions,
                job_boss_data = EXCLUDED.job_boss_data,
                updated_at = CURRENT_TIMESTAMP
              RETURNING *
            `, [
              job.job_number, job.customer_name, job.part_name, job.part_number,
              job.quantity, job.priority, job.estimated_hours, job.due_date,
              job.material, job.material_size, job.operations, job.special_instructions,
              job.job_boss_data
            ]);
            
            insertedJobs.push(result.rows[0]);
          }
          
          // Clean up uploaded file
          fs.unlinkSync(req.file.path);
          
          res.json({
            message: `Successfully imported ${insertedJobs.length} jobs`,
            jobs: insertedJobs
          });
        } catch (error) {
          console.error('Error inserting jobs:', error);
          res.status(500).json({ error: 'Failed to import jobs' });
        }
      });
  } catch (error) {
    console.error('Error processing CSV:', error);
    res.status(500).json({ error: 'Failed to process CSV file' });
  }
});

module.exports = router;
