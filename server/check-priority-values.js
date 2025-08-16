const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function checkPriorityValues() {
  try {
    const result = await pool.query(`
      SELECT job_number, customer_name, priority, priority_score, is_expedite, has_outsourcing 
      FROM jobs 
      WHERE status != 'completed' 
      ORDER BY priority_score DESC 
      LIMIT 5
    `);
    
    console.log('Current job priorities:');
    console.log('Job Number    | Customer     | Old Priority | New Score | Expedite | Outsourcing');
    console.log('============================================================================');
    result.rows.forEach(job => {
      console.log(
        `${job.job_number.padEnd(12)} | ${(job.customer_name || '').padEnd(12)} | ` +
        `${(job.priority || 'null').toString().padEnd(12)} | ${(job.priority_score || 0).toString().padEnd(9)} | ` +
        `${job.is_expedite ? 'Yes' : 'No'}      | ${job.has_outsourcing ? 'Yes' : 'No'}`
      );
    });
    
    // Check if we need to run priority calculation
    const unscored = await pool.query('SELECT COUNT(*) FROM jobs WHERE priority_score = 0 AND status != \'completed\'');
    console.log(`\nJobs with zero priority score: ${unscored.rows[0].count}`);
    
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await pool.end();
  }
}

checkPriorityValues();