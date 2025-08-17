const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function checkSequenceData() {
  try {
    console.log('Checking sequence_order data for job 57710...');
    
    // First get the job ID
    const jobResult = await pool.query(`
      SELECT id FROM jobs WHERE job_number = $1
    `, ['57710']);
    
    if (jobResult.rows.length === 0) {
      console.log('Job 57710 not found');
      return;
    }
    
    const jobId = jobResult.rows[0].id;
    console.log(`Job ID: ${jobId}`);
    
    // Get routing data
    const result = await pool.query(`
      SELECT 
        jr.id, 
        jr.operation_number, 
        jr.operation_name, 
        jr.sequence_order,
        m.machine_name
      FROM job_routings jr
      LEFT JOIN machines m ON jr.machine_id = m.id
      WHERE jr.job_id = $1
      ORDER BY jr.operation_number
    `, [jobId]);
    
    console.log('\nOperations ordered by operation_number:');
    result.rows.forEach(row => {
      console.log(`Op ${row.operation_number}: ${row.operation_name} | Machine: ${row.machine_name || 'None'} | Sequence: ${row.sequence_order}`);
    });
    
    console.log('\nOperations sorted by sequence_order:');
    const sortedBySequence = [...result.rows].sort((a, b) => (a.sequence_order || 0) - (b.sequence_order || 0));
    sortedBySequence.forEach(row => {
      console.log(`Op ${row.operation_number}: ${row.operation_name} | Machine: ${row.machine_name || 'None'} | Sequence: ${row.sequence_order}`);
    });
    
    // Check if sequence_order values are what we expect
    console.log('\nSequence order analysis:');
    result.rows.forEach(row => {
      console.log(`Op ${row.operation_number}: sequence_order = ${row.sequence_order} (type: ${typeof row.sequence_order})`);
    });
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

checkSequenceData();