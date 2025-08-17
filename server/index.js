const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');

// Load environment variables from project root
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 5000;

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Middleware
app.use(helmet());
app.use(cors());
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Test database connection
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('Database connection failed:', err);
  } else {
    console.log('Database connected successfully');
  }
});

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/jobs', require('./routes/jobs'));
app.use('/api/machines', require('./routes/machines'));
app.use('/api/employees', require('./routes/employees'));
app.use('/api/schedules', require('./routes/schedules'));
app.use('/api/scheduling', require('./routes/scheduling'));
app.use('/api/conflicts', require('./routes/conflicts'));
app.use('/api/shift-capacity', require('./routes/shift-capacity'));
app.use('/api/outsourcing', require('./routes/outsourcing'));
app.use('/api/assembly', require('./routes/assembly-detection'));
app.use('/api/locks', require('./routes/locks'));
app.use('/api/displacement', require('./routes/displacement'));
app.use('/api/undo', require('./routes/undo'));
app.use('/api/inspection', require('./routes/inspection'));
app.use('/api/timeoff', require('./routes/timeoff'));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    message: 'CNC Scheduler API is running'
  });
});

// Debug endpoint to test mobile connectivity
app.get('/api/test-mobile', (req, res) => {
  console.log('Mobile test request from:', req.ip);
  res.json({ 
    message: 'Mobile test successful',
    userAgent: req.get('User-Agent'),
    ip: req.ip
  });
});

// Debug endpoint to test database connectivity from mobile
app.get('/api/test-database', async (req, res) => {
  console.log('Database test request from:', req.ip);
  try {
    const result = await pool.query('SELECT NOW() as current_time, version() as pg_version');
    res.json({
      message: 'Database connection successful',
      userAgent: req.get('User-Agent'),
      ip: req.ip,
      database: result.rows[0]
    });
  } catch (error) {
    console.error('Database test error:', error);
    res.status(500).json({
      error: 'Database connection failed',
      message: error.message,
      userAgent: req.get('User-Agent'),
      ip: req.ip
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    error: 'Something went wrong!',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Make pool available to routes
app.locals.pool = pool;

// Start TimeOff Listener for automatic displacement handling
const TimeOffListener = require('./services/timeOffListener');
let timeOffListener = null;

app.listen(PORT, async () => {
  console.log(`🚀 CNC Scheduler API running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
  
  // Start the time off listener
  try {
    timeOffListener = new TimeOffListener();
    await timeOffListener.start();
    console.log('✅ Time off displacement listener started');
  } catch (error) {
    console.error('❌ Failed to start time off listener:', error);
  }
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down gracefully...');
  
  if (timeOffListener) {
    await timeOffListener.stop();
  }
  
  await pool.end();
  process.exit(0);
});

module.exports = app;
