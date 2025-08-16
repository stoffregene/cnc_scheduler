const express = require('express');
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const { body, validationResult } = require('express-validator');
const JobBossCSVParser = require('../services/jobbossCSVParser');
const JobBossCSVParserV2 = require('../services/jobbossCSVParserV2');
const PriorityService = require('../services/priorityService');
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
    
    // Add condition to exclude jobs where all operations are completed (awaiting shipping)
    const excludeCompleted = `
      j.id NOT IN (
        SELECT j2.id 
        FROM jobs j2
        LEFT JOIN job_routings jr2 ON j2.id = jr2.job_id
        GROUP BY j2.id
        HAVING COUNT(jr2.id) > 0 
        AND COUNT(jr2.id) = COUNT(CASE WHEN jr2.routing_status = 'C' THEN 1 END)
      )
    `;
    conditions.push(excludeCompleted);
    
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

// Get jobs awaiting shipping (all operations completed but job still active) - MUST BE BEFORE /:id route
router.get('/awaiting-shipping', async (req, res) => {
  try {
    const { pool } = req.app.locals;
    
    const result = await pool.query(`
      WITH job_operation_status AS (
        SELECT 
          j.id as job_id,
          j.job_number,
          j.customer_name,
          j.part_name,
          j.part_number,
          j.quantity,
          j.material,
          j.due_date,
          j.promised_date,
          j.priority_score,
          j.status as job_status,
          j.created_at,
          j.updated_at,
          -- Count total operations
          COUNT(jr.id) as total_operations,
          -- Count completed operations (routing_status 'C')
          COUNT(CASE WHEN jr.routing_status = 'C' THEN 1 END) as completed_operations,
          -- Get completion date of last operation
          MAX(CASE WHEN jr.routing_status = 'C' THEN ss.end_datetime END) as last_operation_completed_at,
          -- Check if all operations are completed
          (COUNT(jr.id) = COUNT(CASE WHEN jr.routing_status = 'C' THEN 1 END)) as all_operations_completed,
          -- Get all operation details for reference
          json_agg(
            json_build_object(
              'id', jr.id,
              'operation_number', jr.operation_number,
              'operation_name', jr.operation_name,
              'sequence_order', jr.sequence_order,
              'status', jr.routing_status,
              'completed_at', ss.end_datetime
            ) ORDER BY jr.sequence_order
          ) as operations
        FROM jobs j
        LEFT JOIN job_routings jr ON j.id = jr.job_id
        LEFT JOIN schedule_slots ss ON jr.id = ss.job_routing_id
        WHERE j.status IN ('active', 'scheduled', 'in_progress', 'pending')  -- Include pending jobs with completed operations
        AND j.job_number !~ '-\\d+$'  -- Exclude subassemblies (job numbers ending with dash and number)
        AND j.customer_name != 'STOCK'  -- Exclude stock jobs (internal inventory, not customer shipments)
        GROUP BY j.id, j.job_number, j.customer_name, j.part_name, j.part_number, 
                 j.quantity, j.material, j.due_date, j.promised_date, j.priority_score, 
                 j.status, j.created_at, j.updated_at
      )
      SELECT 
        *,
        -- Calculate days since completion
        CASE 
          WHEN last_operation_completed_at IS NOT NULL 
          THEN EXTRACT(DAY FROM (CURRENT_TIMESTAMP - last_operation_completed_at))
          ELSE NULL
        END as days_since_completion,
        -- Urgency based on due date
        CASE 
          WHEN promised_date IS NULL THEN 'no_date'
          WHEN promised_date < CURRENT_DATE THEN 'overdue'
          WHEN promised_date = CURRENT_DATE THEN 'due_today'
          WHEN promised_date <= CURRENT_DATE + INTERVAL '3 days' THEN 'urgent'
          WHEN promised_date <= CURRENT_DATE + INTERVAL '7 days' THEN 'soon'
          ELSE 'on_schedule'
        END as urgency_status
      FROM job_operation_status
      WHERE all_operations_completed = true
        AND total_operations > 0  -- Only jobs that actually have operations
      ORDER BY 
        CASE 
          WHEN promised_date < CURRENT_DATE THEN 1
          WHEN promised_date = CURRENT_DATE THEN 2
          WHEN promised_date <= CURRENT_DATE + INTERVAL '3 days' THEN 3
          ELSE 4
        END,
        last_operation_completed_at DESC,
        promised_date ASC
    `);
    
    // Calculate summary statistics
    const totals = {
      total_jobs: result.rows.length,
      overdue: result.rows.filter(r => r.urgency_status === 'overdue').length,
      due_today: result.rows.filter(r => r.urgency_status === 'due_today').length,
      urgent: result.rows.filter(r => r.urgency_status === 'urgent').length,
      soon: result.rows.filter(r => r.urgency_status === 'soon').length,
      on_schedule: result.rows.filter(r => r.urgency_status === 'on_schedule').length,
      no_date: result.rows.filter(r => r.urgency_status === 'no_date').length
    };
    
    res.json({
      jobs: result.rows,
      totals: totals
    });
    
  } catch (error) {
    console.error('Error fetching awaiting shipping jobs:', error);
    res.status(500).json({ error: 'Failed to fetch awaiting shipping jobs' });
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

// Delete all jobs endpoint (MUST be before /:id route)
router.delete('/delete-all', async (req, res) => {
  const { pool } = req.app.locals;
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    console.log('🗑️  Starting delete all jobs operation...');
    
    // Get count of jobs before deletion
    const countResult = await client.query('SELECT COUNT(*) as total FROM jobs');
    const totalJobs = parseInt(countResult.rows[0].total);
    
    if (totalJobs === 0) {
      await client.query('COMMIT');
      return res.json({ 
        message: 'No jobs to delete',
        deletedJobsCount: 0,
        deletedSlotsCount: 0,
        deletedConflictsCount: 0,
        deletedDependenciesCount: 0,
        deletedRoutingsCount: 0
      });
    }
    
    console.log(`   Found ${totalJobs} jobs to delete`);
    
    // 1. Delete all schedule slots
    const slotsResult = await client.query('DELETE FROM schedule_slots');
    console.log(`   Deleted ${slotsResult.rowCount} schedule slots`);
    
    // 2. Delete all scheduling conflicts
    const conflictsResult = await client.query('DELETE FROM scheduling_conflicts');
    console.log(`   Deleted ${conflictsResult.rowCount} scheduling conflicts`);
    
    // 3. Delete all job dependencies
    const depsResult = await client.query('DELETE FROM job_dependencies');
    console.log(`   Deleted ${depsResult.rowCount} job dependencies`);
    
    // 4. Delete all job routings
    const routingsResult = await client.query('DELETE FROM job_routings');
    console.log(`   Deleted ${routingsResult.rowCount} job routings`);
    
    // 5. Delete all jobs
    const jobsResult = await client.query('DELETE FROM jobs');
    console.log(`   Deleted ${jobsResult.rowCount} jobs`);
    
    await client.query('COMMIT');
    console.log(`✅ Successfully deleted all ${totalJobs} jobs and related data`);
    
    res.json({ 
      message: `Successfully deleted all ${totalJobs} jobs and related data`,
      deletedJobsCount: jobsResult.rowCount,
      deletedSlotsCount: slotsResult.rowCount,
      deletedConflictsCount: conflictsResult.rowCount,
      deletedDependenciesCount: depsResult.rowCount,
      deletedRoutingsCount: routingsResult.rowCount
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error deleting all jobs:', error);
    res.status(500).json({ error: 'Failed to delete all jobs' });
  } finally {
    client.release();
  }
});

// Delete job
router.delete('/:id', async (req, res) => {
  try {
    const { pool } = req.app.locals;
    const { id } = req.params;
    
    // Start a transaction to handle cascading deletes
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Get job info for logging
      const jobInfo = await client.query('SELECT job_number FROM jobs WHERE id = $1', [id]);
      if (jobInfo.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Job not found' });
      }
      
      const jobNumber = jobInfo.rows[0].job_number;
      console.log(`🗑️ Deleting job ${jobNumber} (ID: ${id})`);
      
      // Delete related records in order to avoid foreign key violations
      
      // 1. Delete schedule slots
      const slotsResult = await client.query('DELETE FROM schedule_slots WHERE job_id = $1', [id]);
      console.log(`   Deleted ${slotsResult.rowCount} schedule slots`);
      
      // 2. Delete scheduling conflicts
      const conflictsResult = await client.query('DELETE FROM scheduling_conflicts WHERE job_id = $1', [id]);
      console.log(`   Deleted ${conflictsResult.rowCount} scheduling conflicts`);
      
      // 3. Delete job dependencies (both as dependent and prerequisite)
      const depsResult1 = await client.query('DELETE FROM job_dependencies WHERE dependent_job_id = $1', [id]);
      const depsResult2 = await client.query('DELETE FROM job_dependencies WHERE prerequisite_job_id = $1', [id]);
      console.log(`   Deleted ${depsResult1.rowCount + depsResult2.rowCount} job dependencies`);
      
      // 4. Delete job routings
      const routingsResult = await client.query('DELETE FROM job_routings WHERE job_id = $1', [id]);
      console.log(`   Deleted ${routingsResult.rowCount} job routings`);
      
      // 5. Update child jobs to remove parent reference
      const childrenResult = await client.query(
        'UPDATE jobs SET parent_job_id = NULL WHERE parent_job_id = $1 RETURNING job_number', 
        [id]
      );
      if (childrenResult.rowCount > 0) {
        console.log(`   Updated ${childrenResult.rowCount} child jobs: ${childrenResult.rows.map(r => r.job_number).join(', ')}`);
      }
      
      // 6. Finally delete the job itself
      const result = await client.query('DELETE FROM jobs WHERE id = $1 RETURNING *', [id]);
      
      await client.query('COMMIT');
      console.log(`✅ Successfully deleted job ${jobNumber}`);
      
      res.json({ 
        message: `Job ${jobNumber} deleted successfully`,
        deletedSlotsCount: slotsResult.rowCount,
        deletedConflictsCount: conflictsResult.rowCount,
        deletedDependenciesCount: depsResult1.rowCount + depsResult2.rowCount,
        deletedRoutingsCount: routingsResult.rowCount,
        updatedChildrenCount: childrenResult.rowCount
      });
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    
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
    
    // Parse CSV using JobBoss parser V2 (with pick order support)
    const parser = new JobBossCSVParserV2(pool);
    const parsedData = await parser.parseCSV(req.file.path);
    
    console.log(`Parsed ${parsedData.jobs.length} jobs and ${parsedData.routings.length} routing lines`);
    
    // Initialize priority service
    const priorityService = new PriorityService(pool);
    
    // Start database transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      const insertedJobs = [];
      const insertedRoutings = [];
      const assemblyRelationships = [];
      const vendorData = [];
      const priorityUpdates = [];
      const pickOrders = [];
      
      // Separate pick orders from manufacturing jobs
      const manufacturingJobs = parsedData.jobs.filter(job => !job.is_pick_order);
      const pickOrderJobs = parsedData.jobs.filter(job => job.is_pick_order);
      
      console.log(`Found ${pickOrderJobs.length} pick orders (excluded from manufacturing schedule)`);
      console.log(`Processing ${manufacturingJobs.length} manufacturing jobs`);
      
      // Store pick orders for tracking
      pickOrderJobs.forEach(pickOrder => {
        pickOrders.push({
          job_number: pickOrder.job_number,
          customer_name: pickOrder.customer_name,
          part_name: pickOrder.part_name,
          pick_qty: pickOrder.pick_qty,
          make_qty: pickOrder.make_qty,
          promised_date: pickOrder.promised_date
        });
      });
      
      // Insert manufacturing jobs only
      for (const job of manufacturingJobs) {
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
        
        // Ensure customer tier exists
        await priorityService.ensureCustomerTier(job.customer_name);
        
        // Check for expedite status
        const isExpedite = priorityService.checkExpediteStatus(job.order_date, job.promised_date);
        
        const result = await client.query(`
          INSERT INTO jobs (
            job_number, customer_name, part_name, part_number, quantity,
            priority, estimated_hours, due_date, promised_date, order_date, start_date, status,
            material, special_instructions, job_boss_data, job_type, 
            is_assembly_parent, assembly_sequence, link_material,
            material_lead_days, material_due_date, material_req,
            is_stock_job, stock_number, is_expedite, has_outsourcing, outsourcing_lead_days
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27)
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
            is_stock_job = EXCLUDED.is_stock_job,
            stock_number = EXCLUDED.stock_number,
            order_date = EXCLUDED.order_date,
            is_expedite = EXCLUDED.is_expedite,
            has_outsourcing = EXCLUDED.has_outsourcing,
            outsourcing_lead_days = EXCLUDED.outsourcing_lead_days,
            updated_at = CURRENT_TIMESTAMP
          RETURNING *
        `, [
          job.job_number, job.customer_name, job.part_name, job.part_number,
          job.quantity, job.priority, job.estimated_hours, job.due_date,
          job.promised_date, job.order_date, job.start_date, job.status, job.material,
          job.special_instructions, job.job_boss_data, job.job_type,
          job.is_assembly_parent, job.assembly_sequence, job.link_material,
          job.material_lead_days, job.material_due_date, job.material_req,
          job.is_stock_job, job.stock_number, isExpedite, 
          job.has_outsourcing || false, job.outsourcing_lead_days || 0
        ]);
        
        insertedJobs.push(result.rows[0]);
      }
      
      // Create a map of job_number to job_id for routing insertion
      const jobIdMap = new Map();
      insertedJobs.forEach(job => {
        jobIdMap.set(job.job_number, job.id);
      });
      
      // Insert job routings (only for manufacturing jobs, not pick orders)
      const manufacturingJobNumbers = new Set(manufacturingJobs.map(j => j.job_number));
      const manufacturingRoutings = parsedData.routings.filter(r => 
        manufacturingJobNumbers.has(r.job_number)
      );
      
      for (const routing of manufacturingRoutings) {
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
      
      // Calculate priority scores for all imported jobs
      console.log('Calculating priority scores for imported jobs...');
      for (const job of insertedJobs) {
        const priorityScore = await priorityService.calculatePriorityScore(job.id);
        priorityUpdates.push({
          job_number: job.job_number,
          priority_score: priorityScore,
          customer_tier: job.customer_name
        });
      }
      
      await client.query('COMMIT');
      
      // Clean up uploaded file
      fs.unlinkSync(req.file.path);
      
      const summary = {
        message: `Successfully imported ${insertedJobs.length} manufacturing jobs and identified ${pickOrders.length} pick orders with ${insertedRoutings.length} routing operations`,
        totalJobs: insertedJobs.length,
        pickOrders: pickOrders.length,
        totalRoutings: insertedRoutings.length,
        assemblyGroups: parsedData.assemblyGroups.size,
        assemblyRelationships: assemblyRelationships.length,
        vendorsFound: vendorData.length,
        priorityScoresCalculated: priorityUpdates.length,
        jobs: insertedJobs,
        routings: insertedRoutings,
        priorityUpdates: priorityUpdates,
        pickOrderDetails: pickOrders
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
        jr.machine_group_id, jr.sequence_order, jr.estimated_hours, jr.notes, jr.routing_status,
        m.name as machine_name, m.model as machine_model,
        ss.id as schedule_slot_id, ss.start_datetime, ss.end_datetime, 
        ss.machine_id as scheduled_machine_id, ss.employee_id as scheduled_employee_id,
        sm.name as scheduled_machine_name, sm.model as scheduled_machine_model,
        e.first_name || ' ' || e.last_name as scheduled_employee_name,
        ss.status as schedule_status, ss.duration_minutes, ss.locked as slot_locked
      FROM job_routings jr
      LEFT JOIN machines m ON jr.machine_id = m.id
      LEFT JOIN schedule_slots ss ON jr.id = ss.job_routing_id
      LEFT JOIN machines sm ON ss.machine_id = sm.id
      LEFT JOIN employees e ON ss.employee_id = e.id
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
