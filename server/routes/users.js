const express = require('express');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
const { authenticateToken, requirePermission } = require('../middleware/auth');

const router = express.Router();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Get all users (admin only)
router.get('/', authenticateToken, requirePermission('users.view'), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, username, email, first_name, last_name, role, is_active, last_login, created_at, updated_at
      FROM users 
      ORDER BY created_at DESC
    `);

    res.json({
      users: result.rows,
      total: result.rows.length
    });

  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get single user (admin only)
router.get('/:id', authenticateToken, requirePermission('users.view'), async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(`
      SELECT id, username, email, first_name, last_name, role, is_active, last_login, created_at, updated_at
      FROM users 
      WHERE id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user: result.rows[0] });

  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create new user (admin only)
router.post('/', authenticateToken, requirePermission('users.create'), async (req, res) => {
  try {
    const { username, email, password, firstName, lastName, role = 'user' } = req.body;

    // Validation
    if (!username || !email || !password || !firstName || !lastName) {
      return res.status(400).json({ 
        error: 'Username, email, password, first name, and last name are required' 
      });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long' });
    }

    if (!['admin', 'user', 'viewer'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role. Must be admin, user, or viewer' });
    }

    // Check if username or email already exists
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE username = $1 OR email = $2',
      [username, email]
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({ error: 'Username or email already exists' });
    }

    // Hash password
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Create user
    const result = await pool.query(`
      INSERT INTO users (username, email, password_hash, first_name, last_name, role)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, username, email, first_name, last_name, role, is_active, created_at
    `, [username, email, passwordHash, firstName, lastName, role]);

    res.status(201).json({
      message: 'User created successfully',
      user: result.rows[0]
    });

  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update user (admin only)
router.put('/:id', authenticateToken, requirePermission('users.edit'), async (req, res) => {
  try {
    const { id } = req.params;
    const { username, email, firstName, lastName, role, isActive } = req.body;

    // Validation
    if (!username || !email || !firstName || !lastName) {
      return res.status(400).json({ 
        error: 'Username, email, first name, and last name are required' 
      });
    }

    if (role && !['admin', 'user', 'viewer'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role. Must be admin, user, or viewer' });
    }

    // Check if user exists
    const existingUser = await pool.query('SELECT id FROM users WHERE id = $1', [id]);
    if (existingUser.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if username or email already exists (excluding current user)
    const duplicateCheck = await pool.query(
      'SELECT id FROM users WHERE (username = $1 OR email = $2) AND id != $3',
      [username, email, id]
    );

    if (duplicateCheck.rows.length > 0) {
      return res.status(409).json({ error: 'Username or email already exists' });
    }

    // Update user
    const result = await pool.query(`
      UPDATE users 
      SET username = $1, email = $2, first_name = $3, last_name = $4, role = $5, 
          is_active = $6, updated_at = CURRENT_TIMESTAMP
      WHERE id = $7
      RETURNING id, username, email, first_name, last_name, role, is_active, created_at, updated_at
    `, [username, email, firstName, lastName, role || 'user', isActive !== undefined ? isActive : true, id]);

    res.json({
      message: 'User updated successfully',
      user: result.rows[0]
    });

  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete user (admin only)
router.delete('/:id', authenticateToken, requirePermission('users.delete'), async (req, res) => {
  try {
    const { id } = req.params;

    // Don't allow deleting yourself
    if (parseInt(id) === req.user.id) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    // Check if user exists
    const existingUser = await pool.query('SELECT id, username FROM users WHERE id = $1', [id]);
    if (existingUser.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Delete user
    await pool.query('DELETE FROM users WHERE id = $1', [id]);

    res.json({
      message: 'User deleted successfully',
      deletedUser: existingUser.rows[0]
    });

  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Reset user password (admin only)
router.post('/:id/reset-password', authenticateToken, requirePermission('users.reset_password'), async (req, res) => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters long' });
    }

    // Check if user exists
    const existingUser = await pool.query('SELECT id, username FROM users WHERE id = $1', [id]);
    if (existingUser.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Hash new password
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(newPassword, saltRounds);

    // Update password
    await pool.query(
      'UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [passwordHash, id]
    );

    res.json({
      message: 'Password reset successfully',
      username: existingUser.rows[0].username
    });

  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;