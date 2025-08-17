require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function fixJob57710Sequence() {
  try {
    console.log('=== FIXING JOB 57710 SEQUENCE ORDER ===');
    
    // Find job 57710
    const jobResult = await pool.query(`
      SELECT id, job_number FROM jobs WHERE job_number = '57710'
    `);
    
    if (jobResult.rows.length === 0) {
      console.log('Job 57710 not found');
      return;
    }
    
    const job = jobResult.rows[0];
    console.log(`Found job: ${job.job_number} (ID: ${job.id})`);
    
    // Get current routings
    const routingsResult = await pool.query(`
      SELECT id, operation_number, operation_name, sequence_order
      FROM job_routings
      WHERE job_id = $1
      ORDER BY operation_number
    `, [job.id]);
    
    console.log('\nCurrent sequence order values:');
    routingsResult.rows.forEach(row => {
      console.log(`  Op ${row.operation_number}: ${row.operation_name} | sequence_order: ${row.sequence_order}`);
    });
    
    // Fix the sequence order to match operation numbers
    console.log('\nFixes needed:');
    console.log('  Op 0 should have sequence_order = 0 (currently 1)');
    console.log('  Op 1 should have sequence_order = 1 (currently 2)');
    console.log('  Op 2 should have sequence_order = 2 (currently 3)');
    console.log('  Op 3 should have sequence_order = 3 (currently 4)');
    console.log('  Op 4 should have sequence_order = 4 (currently 1) <- DUPLICATE!');
    
    // Update each operation to have sequence_order = operation_number
    console.log('\nApplying fixes...');
    
    for (const routing of routingsResult.rows) {
      const newSequenceOrder = parseInt(routing.operation_number);
      if (routing.sequence_order !== newSequenceOrder) {
        await pool.query(`
          UPDATE job_routings 
          SET sequence_order = $1 
          WHERE id = $2
        `, [newSequenceOrder, routing.id]);
        
        console.log(`  ✅ Updated Op ${routing.operation_number}: sequence_order ${routing.sequence_order} → ${newSequenceOrder}`);
      } else {
        console.log(`  ➖ Op ${routing.operation_number}: sequence_order already correct (${routing.sequence_order})`);
      }
    }
    
    // Verify the fix
    console.log('\n=== VERIFICATION ===');
    const verifyResult = await pool.query(`
      SELECT operation_number, operation_name, sequence_order
      FROM job_routings
      WHERE job_id = $1
      ORDER BY sequence_order, operation_number
    `, [job.id]);
    
    console.log('New sequence order (after fix):');
    verifyResult.rows.forEach((row, index) => {
      console.log(`  ${index + 1}. Op ${row.operation_number}: ${row.operation_name} | sequence_order: ${row.sequence_order}`);
    });
    
    console.log('\n✅ Job 57710 sequence order has been fixed!');
    console.log('The operations should now display in correct order: 0, 1, 2, 3, 4');
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

fixJob57710Sequence();