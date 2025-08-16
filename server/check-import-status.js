const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function checkImportStatus() {
  try {
    const client = await pool.connect();
    
    const jobCount = await client.query('SELECT COUNT(*) as count FROM jobs');
    const routingCount = await client.query('SELECT COUNT(*) as count FROM job_routings');
    
    console.log(`✅ Current database status:`);
    console.log(`   Jobs: ${jobCount.rows[0].count}`);
    console.log(`   Routings: ${routingCount.rows[0].count}`);
    
    if (jobCount.rows[0].count > 0) {
      const recentJobs = await client.query(`
        SELECT job_number, customer_name, created_at 
        FROM jobs 
        ORDER BY created_at DESC 
        LIMIT 5
      `);
      
      console.log('\nRecent jobs:');
      recentJobs.rows.forEach((job, i) => {
        console.log(`   ${i+1}. ${job.job_number} (${job.customer_name}) - ${job.created_at}`);
      });
    }
    
    client.release();
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkImportStatus();