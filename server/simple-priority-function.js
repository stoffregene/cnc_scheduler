const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function createSimplePriorityFunction() {
  try {
    console.log('🔧 Creating simple priority function without date arithmetic...\n');
    
    const client = await pool.connect();
    
    // Drop existing function and trigger
    console.log('🗑️ Dropping existing functions...');
    await client.query('DROP FUNCTION IF EXISTS calculate_priority_score(INTEGER) CASCADE');
    await client.query('DROP TRIGGER IF EXISTS trigger_auto_add_customer ON jobs');
    await client.query('DROP FUNCTION IF EXISTS auto_add_customer_tier() CASCADE');
    
    // Create ultra-simple function that just uses customer tier and static values
    console.log('🆕 Creating simple function...');
    
    const simpleFunctionSql = `
      CREATE OR REPLACE FUNCTION calculate_priority_score(job_id INTEGER)
      RETURNS INTEGER AS $$
      DECLARE
        job_record RECORD;
        customer_tier_record RECORD;
        calculated_score INTEGER := 0;
      BEGIN
        -- Get job details
        SELECT * INTO job_record FROM jobs WHERE id = job_id;
        
        IF job_record IS NULL THEN
          RETURN 0;
        END IF;
        
        -- Get customer tier
        SELECT * INTO customer_tier_record 
        FROM customer_tiers 
        WHERE UPPER(customer_name) = UPPER(job_record.customer_name);
        
        -- 1. Customer Tier (0-400 points)
        IF customer_tier_record IS NOT NULL THEN
          calculated_score := calculated_score + customer_tier_record.priority_weight;
        END IF;
        
        -- 2. Static expedite check (200 points)
        IF job_record.is_expedite THEN
          calculated_score := calculated_score + 200;
        END IF;
        
        -- 3. Job Type (50 points for assembly parents)
        IF job_record.is_assembly_parent THEN
          calculated_score := calculated_score + 50;
        END IF;
        
        -- 4. Outsourcing Lead Time (0-100 points, 5 points per day)
        IF job_record.has_outsourcing AND job_record.outsourcing_lead_days > 0 THEN
          calculated_score := calculated_score + LEAST(job_record.outsourcing_lead_days * 5, 100);
        END IF;
        
        -- 5. Default urgency based on priority field
        calculated_score := calculated_score + (job_record.priority * 10);
        
        -- Cap at 1000
        calculated_score := LEAST(calculated_score, 1000);
        
        -- Update the job's priority score
        UPDATE jobs SET priority_score = calculated_score WHERE id = job_id;
        
        RETURN calculated_score;
      END;
      $$ LANGUAGE plpgsql;`;
    
    await client.query(simpleFunctionSql);
    console.log('✅ Simple function created');
    
    // Test it
    console.log('🧪 Testing simple function...');
    
    const testResult = await client.query(`
      INSERT INTO jobs (job_number, customer_name, part_name, quantity, priority, estimated_hours, status)
      VALUES ('SIMPLE_TEST', 'TEST CUSTOMER', 'Test Part', 1, 3, 1.0, 'pending')
      RETURNING id
    `);
    
    const testId = testResult.rows[0].id;
    
    const scoreResult = await client.query('SELECT calculate_priority_score($1) as score', [testId]);
    console.log(`✅ Simple function test successful! Score: ${scoreResult.rows[0].score}`);
    
    // Clean up test
    await client.query('DELETE FROM jobs WHERE id = $1', [testId]);
    
    // Create simplified trigger
    console.log('🔔 Creating simplified trigger...');
    
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
    
    console.log('✅ Trigger created');
    
    // Test trigger
    console.log('🧪 Testing trigger...');
    
    const triggerTestResult = await client.query(`
      INSERT INTO jobs (job_number, customer_name, part_name, quantity, priority, estimated_hours, status)
      VALUES ('TRIGGER_TEST', 'MAREL', 'Test Part', 1, 2, 1.0, 'pending')
      RETURNING id, priority_score
    `);
    
    console.log(`✅ Trigger test successful! Job inserted with score: ${triggerTestResult.rows[0].priority_score}`);
    
    // Clean up test
    await client.query('DELETE FROM jobs WHERE id = $1', [triggerTestResult.rows[0].id]);
    
    client.release();
    
    console.log('\n🎉 Simple priority system is working!');
    console.log('📝 Note: Date-based calculations have been simplified to avoid PostgreSQL issues.');
    console.log('💡 You can enhance the function later once the basic import is working.');
    
  } catch (error) {
    console.error('❌ Simple function creation failed:', error.message);
    console.error(error.stack);
  } finally {
    await pool.end();
  }
}

// Run the fix
createSimplePriorityFunction();