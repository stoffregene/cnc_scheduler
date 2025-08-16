const { Pool } = require('pg');
const path = require('path');
const JobBossCSVParserV2 = require('./services/jobbossCSVParserV2');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function testImportWithoutTrigger() {
  try {
    console.log('🧪 Testing import without auto-trigger...\n');
    
    const csvPath = path.join(__dirname, '..', 'AttachedAssets', 'data.csv');
    console.log(`📁 Reading CSV from: ${csvPath}`);
    
    // Parse CSV
    const parser = new JobBossCSVParserV2(pool);
    const parsedData = await parser.parseCSV(csvPath);
    
    console.log(`Parsed ${parsedData.jobs.length} jobs`);
    
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Temporarily disable the trigger
      console.log('🔕 Disabling auto-trigger...');
      await client.query('DROP TRIGGER IF EXISTS trigger_auto_add_customer ON jobs');
      
      console.log('📊 Testing job insertion without trigger...');
      
      // Try inserting just one job to test
      const manufacturingJobs = parsedData.jobs.filter(job => !job.is_pick_order);
      const testJob = manufacturingJobs[0];
      
      console.log(`Testing with job: ${testJob.job_number}`);
      
      const result = await client.query(`
        INSERT INTO jobs (
          job_number, customer_name, part_name, part_number, quantity,
          priority, estimated_hours, due_date, promised_date, order_date, start_date, status,
          material, special_instructions
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        RETURNING id, job_number
      `, [
        testJob.job_number, testJob.customer_name, testJob.part_name, testJob.part_number,
        testJob.quantity, testJob.priority, testJob.estimated_hours, testJob.due_date,
        testJob.promised_date, testJob.order_date, testJob.start_date, testJob.status,
        testJob.material, testJob.special_instructions
      ]);
      
      console.log(`✅ Job inserted successfully: ${result.rows[0].job_number} (ID: ${result.rows[0].id})`);
      
      // Now test the calculate_priority_score function manually
      console.log('🧪 Testing priority calculation manually...');
      
      try {
        const scoreResult = await client.query('SELECT calculate_priority_score($1) as score', [result.rows[0].id]);
        console.log(`✅ Priority score calculated: ${scoreResult.rows[0].score}`);
      } catch (error) {
        console.log(`❌ Priority calculation error: ${error.message}`);
        console.log(`Error where: ${error.where || 'No where info'}`);
      }
      
      // Re-enable the trigger with the corrected function
      console.log('🔔 Re-enabling trigger with corrected function...');
      
      // Make sure we have the latest function
      await client.query(`
        CREATE OR REPLACE FUNCTION auto_add_customer_tier()
        RETURNS TRIGGER AS $$
        BEGIN
          -- Check if customer exists in tiers table
          IF NOT EXISTS (
            SELECT 1 FROM customer_tiers 
            WHERE UPPER(customer_name) = UPPER(NEW.customer_name)
          ) THEN
            -- Auto-add as standard tier
            INSERT INTO customer_tiers (customer_name, tier, priority_weight)
            VALUES (NEW.customer_name, 'standard', 0)
            ON CONFLICT (customer_name) DO NOTHING;
          END IF;
          
          -- Calculate priority score for new job
          PERFORM calculate_priority_score(NEW.id);
          
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
      `);
      
      await client.query(`
        CREATE TRIGGER trigger_auto_add_customer
          AFTER INSERT ON jobs
          FOR EACH ROW
          EXECUTE FUNCTION auto_add_customer_tier();
      `);
      
      console.log('✅ Trigger re-enabled');
      
      // Test with trigger enabled
      console.log('🧪 Testing insertion with trigger enabled...');
      
      const testJob2 = manufacturingJobs[1];
      const result2 = await client.query(`
        INSERT INTO jobs (
          job_number, customer_name, part_name, part_number, quantity,
          priority, estimated_hours, due_date, promised_date, order_date, start_date, status,
          material, special_instructions
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        RETURNING id, job_number, priority_score
      `, [
        testJob2.job_number, testJob2.customer_name, testJob2.part_name, testJob2.part_number,
        testJob2.quantity, testJob2.priority, testJob2.estimated_hours, testJob2.due_date,
        testJob2.promised_date, testJob2.order_date, testJob2.start_date, testJob2.status,
        testJob2.material, testJob2.special_instructions
      ]);
      
      console.log(`✅ Job with trigger inserted: ${result2.rows[0].job_number} (Score: ${result2.rows[0].priority_score})`);
      
      await client.query('ROLLBACK'); // Don't save the test data
      
      console.log('\n🎉 All tests passed! The trigger should now work correctly.');
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
  } finally {
    await pool.end();
  }
}

// Run the test
testImportWithoutTrigger();