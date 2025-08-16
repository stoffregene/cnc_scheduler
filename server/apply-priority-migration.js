const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function applyPriorityMigration() {
  const client = await pool.connect();
  
  try {
    console.log('🚀 Applying priority system migration...\n');
    
    // Read the migration SQL
    const migrationSQL = fs.readFileSync(
      path.join(__dirname, 'migrations', 'add-customer-tiers.sql'),
      'utf8'
    );
    
    // Execute the migration
    await client.query(migrationSQL);
    
    console.log('✅ Migration applied successfully!\n');
    
    // Verify customer tiers were created
    const tiersResult = await client.query('SELECT * FROM customer_tiers ORDER BY tier, customer_name');
    console.log('📊 Customer Tiers Created:');
    console.log('═══════════════════════════════════════');
    tiersResult.rows.forEach(tier => {
      console.log(`${tier.tier.toUpperCase().padEnd(10)} | ${tier.customer_name.padEnd(20)} | Weight: ${tier.priority_weight}`);
    });
    
    // Check some job priority scores
    const jobsResult = await client.query(`
      SELECT j.job_number, j.customer_name, j.priority_score, j.promised_date,
             j.is_expedite, j.is_assembly_parent
      FROM jobs j
      WHERE j.status != 'completed'
      ORDER BY j.priority_score DESC
      LIMIT 10
    `);
    
    console.log('\n📈 Top 10 Jobs by Priority Score:');
    console.log('═══════════════════════════════════════');
    jobsResult.rows.forEach((job, index) => {
      const flags = [];
      if (job.is_expedite) flags.push('EXPEDITE');
      if (job.is_assembly_parent) flags.push('ASSEMBLY');
      
      console.log(
        `${(index + 1).toString().padStart(2)}. Job ${job.job_number.padEnd(15)} | ` +
        `${job.customer_name.padEnd(20)} | ` +
        `Score: ${job.priority_score.toString().padStart(4)} | ` +
        `${flags.join(', ')}`
      );
    });
    
    console.log('\n✅ Priority system is ready to use!');
    console.log('📝 Next steps:');
    console.log('   1. Review customer tiers in the database');
    console.log('   2. Priority scores will auto-calculate for new jobs');
    console.log('   3. UI will show color-coded priorities');
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error(error.stack);
    await client.query('ROLLBACK');
  } finally {
    client.release();
    await pool.end();
  }
}

applyPriorityMigration();