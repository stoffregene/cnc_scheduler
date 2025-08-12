const { Pool } = require('pg');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function clearBadSchedule() {
  try {
    const result = await pool.query('DELETE FROM schedule_slots WHERE job_id = (SELECT id FROM jobs WHERE job_number = $1)', ['12345']);
    console.log('Deleted', result.rowCount, 'bad schedule slots');
    
    await pool.query('UPDATE jobs SET auto_scheduled = false, status = \'pending\' WHERE job_number = $1', ['12345']);
    console.log('Reset job status');
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

clearBadSchedule();