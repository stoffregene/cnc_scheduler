const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function fixCustomerMetrics() {
  try {
    console.log('🔧 Fixing customer_metrics table overflow issue...\n');
    
    const client = await pool.connect();
    
    // First, update the column to allow larger values
    console.log('📊 Updating frequency_score column to allow larger values...');
    await client.query(`
      ALTER TABLE customer_metrics 
      ALTER COLUMN frequency_score TYPE DECIMAL(10,2)
    `);
    console.log('✅ Column updated to DECIMAL(10,2) - max value now 99,999,999.99');
    
    // Also update the function to cap the frequency score
    console.log('\n🔧 Updating trigger function to cap frequency score...');
    await client.query(`
      CREATE OR REPLACE FUNCTION update_customer_metrics()
      RETURNS TRIGGER AS $$
      BEGIN
        INSERT INTO customer_metrics (customer_name, job_count, last_job_date)
        VALUES (NEW.customer_name, 1, NEW.created_at::DATE)
        ON CONFLICT (customer_name) DO UPDATE SET
          job_count = customer_metrics.job_count + 1,
          last_job_date = NEW.created_at::DATE,
          frequency_score = LEAST(
            CASE 
              WHEN (CURRENT_DATE - customer_metrics.last_job_date) < 30 THEN customer_metrics.frequency_score + 10
              WHEN (CURRENT_DATE - customer_metrics.last_job_date) < 90 THEN customer_metrics.frequency_score + 5
              ELSE customer_metrics.frequency_score + 1
            END,
            999999.99  -- Cap at a reasonable maximum
          ),
          updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
    console.log('✅ Trigger function updated with frequency score cap');
    
    // Check current max frequency score
    const maxScore = await client.query(`
      SELECT customer_name, frequency_score 
      FROM customer_metrics 
      ORDER BY frequency_score DESC 
      LIMIT 5
    `);
    
    if (maxScore.rows.length > 0) {
      console.log('\n📊 Current top frequency scores:');
      maxScore.rows.forEach((row, index) => {
        console.log(`  ${index + 1}. ${row.customer_name}: ${row.frequency_score}`);
      });
    }
    
    // Test the trigger
    console.log('\n🧪 Testing the updated trigger...');
    
    await client.query(`
      INSERT INTO jobs (job_number, customer_name, part_name, quantity, priority, estimated_hours, status)
      VALUES ('METRICS_TEST', 'TEST CUSTOMER', 'Test Part', 1, 1, 1.0, 'pending')
      RETURNING id
    `);
    console.log('✅ Test job inserted successfully');
    
    // Clean up test
    await client.query(`DELETE FROM jobs WHERE job_number = 'METRICS_TEST'`);
    
    client.release();
    
    console.log('\n🎉 Customer metrics overflow issue fixed!');
    console.log('The CSV import should now work without numeric overflow errors.');
    
  } catch (error) {
    console.error('❌ Fix failed:', error.message);
    console.error(error.stack);
  } finally {
    await pool.end();
  }
}

// Run the fix
fixCustomerMetrics();