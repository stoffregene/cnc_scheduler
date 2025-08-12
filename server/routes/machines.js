const express = require('express');
const { body, validationResult } = require('express-validator');
const router = express.Router();

// Get all machines
router.get('/', async (req, res) => {
  try {
    const { pool } = req.app.locals;
    const { status, group_id } = req.query;
    
    let query = `
      SELECT m.*, 
             COUNT(s.id) as active_schedules,
             COALESCE(SUM(EXTRACT(EPOCH FROM (s.end_time - s.start_time))/3600), 0) as total_scheduled_hours,
             json_agg(
               DISTINCT jsonb_build_object(
                 'id', mg.id,
                 'name', mg.name,
                 'description', mg.description
               )
             ) FILTER (WHERE mg.id IS NOT NULL) as groups
      FROM machines m
      LEFT JOIN machine_group_assignments mga ON m.id = mga.machine_id
      LEFT JOIN machine_groups mg ON mga.machine_group_id = mg.id
      LEFT JOIN schedules s ON m.id = s.machine_id AND s.status IN ('scheduled', 'pending', 'in_progress')
    `;
    
    const conditions = [];
    const params = [];
    let paramCount = 0;
    
    if (status) {
      paramCount++;
      conditions.push(`m.status = $${paramCount}`);
      params.push(status);
    }
    
    if (group_id) {
      paramCount++;
      conditions.push(`mga.machine_group_id = $${paramCount}`);
      params.push(group_id);
    }
    
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    
    query += ' GROUP BY m.id ORDER BY m.name ASC';
    
    const result = await pool.query(query, params);
    
    // Process the groups array to handle null values
    const processedRows = result.rows.map(row => ({
      ...row,
      groups: row.groups && row.groups.length > 0 && row.groups[0] !== null ? row.groups : []
    }));
    
    res.json(processedRows);
  } catch (error) {
    console.error('Error fetching machines:', error);
    res.status(500).json({ error: 'Failed to fetch machines' });
  }
});

// Get availability matrix
router.get('/availability-matrix', async (req, res) => {
  try {
    const { pool } = req.app.locals;
    const { date } = req.query;
    
    // Get all active machines with their assigned operators
    const machinesResult = await pool.query(`
      SELECT m.id, m.name, m.model, m.status,
             json_agg(
               jsonb_build_object(
                 'id', oma.id,
                 'employee_id', e.id,
                 'first_name', e.first_name,
                 'last_name', e.last_name,
                 'employee_id_code', e.employee_id,
                 'department', e.department,
                 'position', e.position,
                 'proficiency_level', oma.proficiency_level,
                 'training_date', oma.training_date
               )
             ) FILTER (WHERE e.id IS NOT NULL) as operators
      FROM machines m
      LEFT JOIN operator_machine_assignments oma ON m.id = oma.machine_id
      LEFT JOIN employees e ON oma.employee_id = e.id AND e.status = 'active'
      WHERE m.status = 'active'
      GROUP BY m.id, m.name, m.model, m.status
      ORDER BY m.name
    `);
    
    // Get employee availability for the specified date
    let availabilityQuery = `
      SELECT ea.employee_id, ea.date, ea.start_time, ea.end_time, ea.status, ea.reason
      FROM employee_availability ea
      JOIN employees e ON ea.employee_id = e.id
      WHERE e.status = 'active'
    `;
    
    const availabilityParams = [];
    if (date) {
      availabilityQuery += ' AND ea.date = $1';
      availabilityParams.push(date);
    }
    
    const availabilityResult = await pool.query(availabilityQuery, availabilityParams);
    
    // Get employee work schedules
    const schedulesResult = await pool.query(`
      SELECT ews.employee_id, ews.day_of_week, ews.start_time, ews.end_time, ews.enabled
      FROM employee_work_schedules ews
      JOIN employees e ON ews.employee_id = e.id
      WHERE e.status = 'active' AND ews.enabled = true
    `);
    
    // Process the data to create the matrix
    const matrix = machinesResult.rows.map(machine => {
      const operators = machine.operators || [];
      const operatorsWithAvailability = operators.map(operator => {
        // Find availability for this employee and date
        const availability = availabilityResult.rows.find(av => 
          av.employee_id === operator.employee_id && 
          (!date || av.date === date)
        );
        
        // Find work schedule for this employee
        const workSchedule = schedulesResult.rows.filter(ws => 
          ws.employee_id === operator.employee_id
        );
        
        return {
          ...operator,
          availability: availability ? {
            status: availability.status,
            start_time: availability.start_time,
            end_time: availability.end_time,
            reason: availability.reason
          } : null,
          work_schedule: workSchedule
        };
      });
      
      return {
        ...machine,
        operators: operatorsWithAvailability
      };
    });
    
    res.json(matrix);
  } catch (error) {
    console.error('Error fetching availability matrix:', error);
    res.status(500).json({ error: 'Failed to fetch availability matrix' });
  }
});

// Get machine by ID
router.get('/:id', async (req, res) => {
  try {
    const { pool } = req.app.locals;
    const { id } = req.params;
    
    const result = await pool.query(`
      SELECT m.*,
             json_agg(
               DISTINCT jsonb_build_object(
                 'id', mg.id,
                 'name', mg.name,
                 'description', mg.description
               )
             ) FILTER (WHERE mg.id IS NOT NULL) as groups,
             json_agg(
               json_build_object(
                 'id', s.id,
                 'job_id', s.job_id,
                 'employee_id', s.employee_id,
                 'start_time', s.start_time,
                 'end_time', s.end_time,
                 'status', s.status,
                 'notes', s.notes
               )
             ) FILTER (WHERE s.id IS NOT NULL) as schedules
      FROM machines m
      LEFT JOIN machine_group_assignments mga ON m.id = mga.machine_id
      LEFT JOIN machine_groups mg ON mga.machine_group_id = mg.id
      LEFT JOIN schedules s ON m.id = s.machine_id
      WHERE m.id = $1
      GROUP BY m.id
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Machine not found' });
    }
    
    // Process the groups array to handle null values
    const processedRow = {
      ...result.rows[0],
      groups: result.rows[0].groups && result.rows[0].groups.length > 0 && result.rows[0].groups[0] !== null ? result.rows[0].groups : [],
      schedules: result.rows[0].schedules && result.rows[0].schedules.length > 0 && result.rows[0].schedules[0] !== null ? result.rows[0].schedules : []
    };
    
    res.json(processedRow);
  } catch (error) {
    console.error('Error fetching machine:', error);
    res.status(500).json({ error: 'Failed to fetch machine' });
  }
});

// Create new machine
router.post('/', [
  body('name').notEmpty().withMessage('Machine name is required'),
  body('machine_group_ids').optional().isArray().withMessage('Machine group IDs must be an array')
], async (req, res) => {
  try {
    console.log('Machine creation request body:', req.body);
    
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('Validation errors:', errors.array());
      return res.status(400).json({ errors: errors.array() });
    }
    
    const { pool } = req.app.locals;
    const {
      name, model, manufacturer, machine_group_ids, capabilities,
      max_workpiece_size, spindle_speed_max, tool_capacity, location, notes, status
    } = req.body;
    
    // Convert empty strings to null for integer fields
    const cleanSpindleSpeedMax = spindle_speed_max === '' ? null : spindle_speed_max;
    const cleanToolCapacity = tool_capacity === '' ? null : tool_capacity;
    
    // Start a transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Create the machine
      const machineResult = await client.query(`
        INSERT INTO machines (
          name, model, manufacturer, capabilities,
          max_workpiece_size, spindle_speed_max, tool_capacity, location, notes, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *
      `, [
        name, model, manufacturer, capabilities,
        max_workpiece_size, cleanSpindleSpeedMax, cleanToolCapacity, location, notes, status || 'active'
      ]);
      
      const machine = machineResult.rows[0];
      
      // Assign machine to groups if provided
      if (machine_group_ids && Array.isArray(machine_group_ids) && machine_group_ids.length > 0) {
        const groupAssignments = machine_group_ids.map(groupId => 
          client.query(`
            INSERT INTO machine_group_assignments (machine_id, machine_group_id)
            VALUES ($1, $2)
          `, [machine.id, groupId])
        );
        await Promise.all(groupAssignments);
      }
      
      await client.query('COMMIT');
      
      // Fetch the machine with its groups
      const finalResult = await pool.query(`
        SELECT m.*, 
               json_agg(
                 DISTINCT jsonb_build_object(
                   'id', mg.id,
                   'name', mg.name,
                   'description', mg.description
                 )
               ) FILTER (WHERE mg.id IS NOT NULL) as groups
        FROM machines m
        LEFT JOIN machine_group_assignments mga ON m.id = mga.machine_id
        LEFT JOIN machine_groups mg ON mga.machine_group_id = mg.id
        WHERE m.id = $1
        GROUP BY m.id
      `, [machine.id]);
      
      res.status(201).json(finalResult.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error creating machine:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ error: 'Failed to create machine' });
  }
});

// Update machine
router.put('/:id', [
  body('machine_group_ids').optional().isArray().withMessage('Machine group IDs must be an array')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const { pool } = req.app.locals;
    const { id } = req.params;
    const { machine_group_ids, ...updateFields } = req.body;
    
    // Convert empty strings to null for integer fields
    if (updateFields.spindle_speed_max === '') updateFields.spindle_speed_max = null;
    if (updateFields.tool_capacity === '') updateFields.tool_capacity = null;
    
    // Start a transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Update machine basic info
      if (Object.keys(updateFields).length > 0) {
        const setClause = Object.keys(updateFields)
          .map((key, index) => `${key} = $${index + 2}`)
          .join(', ');
        
        const values = [id, ...Object.values(updateFields)];
        
        const result = await client.query(`
          UPDATE machines 
          SET ${setClause}, updated_at = CURRENT_TIMESTAMP
          WHERE id = $1
          RETURNING *
        `, values);
        
        if (result.rows.length === 0) {
          return res.status(404).json({ error: 'Machine not found' });
        }
      }
      
      // Update machine group assignments if provided
      if (machine_group_ids !== undefined) {
        // Remove existing assignments
        await client.query('DELETE FROM machine_group_assignments WHERE machine_id = $1', [id]);
        
        // Add new assignments
        if (Array.isArray(machine_group_ids) && machine_group_ids.length > 0) {
          const groupAssignments = machine_group_ids.map(groupId => 
            client.query(`
              INSERT INTO machine_group_assignments (machine_id, machine_group_id)
              VALUES ($1, $2)
            `, [id, groupId])
          );
          await Promise.all(groupAssignments);
        }
      }
      
      await client.query('COMMIT');
      
      // Fetch the updated machine with its groups
      const finalResult = await pool.query(`
        SELECT m.*, 
               json_agg(
                 DISTINCT jsonb_build_object(
                   'id', mg.id,
                   'name', mg.name,
                   'description', mg.description
                 )
               ) FILTER (WHERE mg.id IS NOT NULL) as groups
        FROM machines m
        LEFT JOIN machine_group_assignments mga ON m.id = mga.machine_id
        LEFT JOIN machine_groups mg ON mga.machine_group_id = mg.id
        WHERE m.id = $1
        GROUP BY m.id
      `, [id]);
      
      res.json(finalResult.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error updating machine:', error);
    res.status(500).json({ error: 'Failed to update machine' });
  }
});

// Delete machine
router.delete('/:id', async (req, res) => {
  try {
    const { pool } = req.app.locals;
    const { id } = req.params;
    
    // Check if machine has active schedules
    const scheduleCheck = await pool.query(
      'SELECT COUNT(*) FROM schedules WHERE machine_id = $1 AND status = $2',
      [id, 'scheduled']
    );
    
    if (parseInt(scheduleCheck.rows[0].count) > 0) {
      return res.status(400).json({ 
        error: 'Cannot delete machine with active schedules' 
      });
    }
    
    const result = await pool.query('DELETE FROM machines WHERE id = $1 RETURNING *', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Machine not found' });
    }
    
    res.json({ message: 'Machine deleted successfully' });
  } catch (error) {
    console.error('Error deleting machine:', error);
    res.status(500).json({ error: 'Failed to delete machine' });
  }
});

// Get machine groups
router.get('/groups/all', async (req, res) => {
  try {
    const { pool } = req.app.locals;
    
    const result = await pool.query(`
      SELECT mg.*, COUNT(DISTINCT mga.machine_id) as machine_count
      FROM machine_groups mg
      LEFT JOIN machine_group_assignments mga ON mg.id = mga.machine_group_id
      GROUP BY mg.id
      ORDER BY mg.name ASC
    `);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching machine groups:', error);
    res.status(500).json({ error: 'Failed to fetch machine groups' });
  }
});

// Create machine group
router.post('/groups', [
  body('name').notEmpty().withMessage('Group name is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const { pool } = req.app.locals;
    const { name, description } = req.body;
    
    const result = await pool.query(`
      INSERT INTO machine_groups (name, description)
      VALUES ($1, $2)
      RETURNING *
    `, [name, description]);
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating machine group:', error);
    if (error.code === '23505') { // Unique violation
      res.status(400).json({ error: 'Machine group name already exists' });
    } else {
      res.status(500).json({ error: 'Failed to create machine group' });
    }
  }
});

// Update machine group
router.put('/groups/:id', [
  body('name').notEmpty().withMessage('Group name is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const { pool } = req.app.locals;
    const { id } = req.params;
    const { name, description } = req.body;
    
    const result = await pool.query(`
      UPDATE machine_groups 
      SET name = $1, description = $2, updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
      RETURNING *
    `, [name, description, id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Machine group not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating machine group:', error);
    if (error.code === '23505') { // Unique violation
      res.status(400).json({ error: 'Machine group name already exists' });
    } else {
      res.status(500).json({ error: 'Failed to update machine group' });
    }
  }
});

// Delete machine group
router.delete('/groups/:id', async (req, res) => {
  try {
    const { pool } = req.app.locals;
    const { id } = req.params;
    
    // Check if there are any machines using this group
    const machineCheck = await pool.query(`
      SELECT COUNT(*) FROM machine_group_assignments WHERE machine_group_id = $1
    `, [id]);
    
    if (parseInt(machineCheck.rows[0].count) > 0) {
      return res.status(400).json({ 
        error: 'Cannot delete machine group. There are machines assigned to this group. Please reassign or delete the machines first.' 
      });
    }
    
    const result = await pool.query(`
      DELETE FROM machine_groups WHERE id = $1 RETURNING *
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Machine group not found' });
    }
    
    res.json({ message: 'Machine group deleted successfully' });
  } catch (error) {
    console.error('Error deleting machine group:', error);
    res.status(500).json({ error: 'Failed to delete machine group' });
  }
});

// Get available machines for substitution
router.get('/available/:jobId', async (req, res) => {
  try {
    const { pool } = req.app.locals;
    const { jobId } = req.params;
    const { startTime, endTime } = req.query;
    
    // Get job details to understand requirements
    const jobResult = await pool.query('SELECT * FROM jobs WHERE id = $1', [jobId]);
    if (jobResult.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    const job = jobResult.rows[0];
    
    // Find available machines that can handle this job
    const result = await pool.query(`
      SELECT m.*, 
             json_agg(
               DISTINCT jsonb_build_object(
                 'id', mg.id,
                 'name', mg.name,
                 'description', mg.description
               )
             ) FILTER (WHERE mg.id IS NOT NULL) as groups
      FROM machines m
      LEFT JOIN machine_group_assignments mga ON m.id = mga.machine_id
      LEFT JOIN machine_groups mg ON mga.machine_group_id = mg.id
      WHERE m.status = 'active'
      AND m.id NOT IN (
        SELECT DISTINCT machine_id 
        FROM schedules 
        WHERE status = 'scheduled'
        AND (
          (start_time <= $1 AND end_time >= $1) OR
          (start_time <= $2 AND end_time >= $2) OR
          (start_time >= $1 AND end_time <= $2)
        )
      )
      GROUP BY m.id
      ORDER BY m.name ASC
    `, [startTime, endTime]);
    
    // Process the groups array to handle null values
    const processedRows = result.rows.map(row => ({
      ...row,
      groups: row.groups && row.groups.length > 0 && row.groups[0] !== null ? row.groups : []
    }));
    
    res.json(processedRows);
  } catch (error) {
    console.error('Error fetching available machines:', error);
    res.status(500).json({ error: 'Failed to fetch available machines' });
  }
});

// Get operator-machine assignments
router.get('/operators/:machineId', async (req, res) => {
  try {
    const { pool } = req.app.locals;
    const { machineId } = req.params;
    
    const result = await pool.query(`
      SELECT oma.*, 
             e.first_name, e.last_name, e.employee_id, e.department, e.position,
             m.name as machine_name, m.model as machine_model
      FROM operator_machine_assignments oma
      JOIN employees e ON oma.employee_id = e.id
      JOIN machines m ON oma.machine_id = m.id
      WHERE oma.machine_id = $1
      ORDER BY e.first_name, e.last_name
    `, [machineId]);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching operator assignments:', error);
    res.status(500).json({ error: 'Failed to fetch operator assignments' });
  }
});

// Create operator-machine assignment
router.post('/operators', [
  body('employee_id').isInt().withMessage('Employee ID is required'),
  body('machine_id').isInt().withMessage('Machine ID is required'),
  body('proficiency_level').optional().isIn(['trained', 'expert', 'certified']).withMessage('Invalid proficiency level')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const { pool } = req.app.locals;
    const { employee_id, machine_id, proficiency_level, training_date, notes } = req.body;
    
    const result = await pool.query(`
      INSERT INTO operator_machine_assignments (
        employee_id, machine_id, proficiency_level, training_date, notes
      ) VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [employee_id, machine_id, proficiency_level || 'trained', training_date, notes]);
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating operator assignment:', error);
    if (error.code === '23505') { // Unique violation
      res.status(400).json({ error: 'Operator is already assigned to this machine' });
    } else {
      res.status(500).json({ error: 'Failed to create operator assignment' });
    }
  }
});

// Update operator-machine assignment
router.put('/operators/:id', [
  body('proficiency_level').optional().isIn(['trained', 'expert', 'certified']).withMessage('Invalid proficiency level')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const { pool } = req.app.locals;
    const { id } = req.params;
    const { proficiency_level, training_date, notes } = req.body;
    
    const result = await pool.query(`
      UPDATE operator_machine_assignments 
      SET proficiency_level = $1, training_date = $2, notes = $3, updated_at = CURRENT_TIMESTAMP
      WHERE id = $4
      RETURNING *
    `, [proficiency_level, training_date, notes, id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Operator assignment not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating operator assignment:', error);
    res.status(500).json({ error: 'Failed to update operator assignment' });
  }
});

// Delete operator-machine assignment
router.delete('/operators/:id', async (req, res) => {
  try {
    const { pool } = req.app.locals;
    const { id } = req.params;
    
    const result = await pool.query(`
      DELETE FROM operator_machine_assignments WHERE id = $1 RETURNING *
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Operator assignment not found' });
    }
    
    res.json({ message: 'Operator assignment deleted successfully' });
  } catch (error) {
    console.error('Error deleting operator assignment:', error);
    res.status(500).json({ error: 'Failed to delete operator assignment' });
  }
});

// Get qualified operators for a machine
router.get('/:id/operators', async (req, res) => {
  try {
    const { pool } = req.app.locals;
    const machineId = req.params.id;
    
    const result = await pool.query(`
      SELECT 
        e.id as employee_id,
        e.first_name || ' ' || e.last_name as employee_name,
        e.first_name,
        e.last_name,
        oma.proficiency_level,
        oma.certification_date,
        e.status as employee_status
      FROM employees e
      JOIN operator_machine_assignments oma ON e.id = oma.employee_id
      WHERE oma.machine_id = $1
      AND e.status = 'active'
      ORDER BY oma.proficiency_level DESC, e.id
    `, [machineId]);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching machine operators:', error);
    res.status(500).json({ error: 'Failed to fetch machine operators' });
  }
});

module.exports = router;
