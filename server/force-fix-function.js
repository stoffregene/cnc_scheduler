const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function forceFixFunction() {
  try {
    console.log('🔧 Force-fixing the calculate_priority_score function...\n');
    
    const client = await pool.connect();
    
    // First, drop the existing function completely
    console.log('🗑️ Dropping existing function...');
    await client.query('DROP FUNCTION IF EXISTS calculate_priority_score(INTEGER) CASCADE');
    
    // Also drop the trigger that uses it
    console.log('🗑️ Dropping trigger...');
    await client.query('DROP TRIGGER IF EXISTS trigger_auto_add_customer ON jobs');
    await client.query('DROP FUNCTION IF EXISTS auto_add_customer_tier() CASCADE');
    
    // Create a completely new, simpler function that definitely works
    console.log('🆕 Creating new simplified function...');
    
    const newFunction = `
      CREATE OR REPLACE FUNCTION calculate_priority_score(job_id INTEGER)
      RETURNS INTEGER AS $$
      DECLARE
        job_record RECORD;
        customer_tier_record RECORD;
        calculated_score INTEGER := 0;
        days_until_promised INTEGER := 0;
        days_between_order_promise INTEGER := 0;
        parent_priority INTEGER := 0;
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
        
        -- 2. Already Late (250 points) - only if promised_date is valid
        IF job_record.promised_date IS NOT NULL THEN
          IF CURRENT_DATE > job_record.promised_date THEN
            calculated_score := calculated_score + 250;
          END IF;
        END IF;
        
        -- 3. Expedite Flag (200 points) - only if both dates are valid
        IF job_record.order_date IS NOT NULL AND job_record.promised_date IS NOT NULL THEN
          days_between_order_promise := EXTRACT(DAY FROM (job_record.promised_date - job_record.order_date));
          IF days_between_order_promise < 28 THEN
            calculated_score := calculated_score + 200;
            -- Also update the expedite flag
            UPDATE jobs SET is_expedite = TRUE WHERE id = job_id;
          END IF;
        ELSIF job_record.is_expedite THEN
          calculated_score := calculated_score + 200;
        END IF;
        
        -- 4. Days to Promised (0-150 points) - only if promised_date is valid
        IF job_record.promised_date IS NOT NULL THEN
          days_until_promised := EXTRACT(DAY FROM (job_record.promised_date - CURRENT_DATE));
          
          IF days_until_promised <= 7 THEN
            calculated_score := calculated_score + 150;
          ELSIF days_until_promised <= 14 THEN
            calculated_score := calculated_score + 100;
          ELSIF days_until_promised <= 21 THEN
            calculated_score := calculated_score + 50;
          END IF;
        END IF;
        
        -- 5. Job Type (50 points for assembly parents)
        IF job_record.is_assembly_parent THEN
          calculated_score := calculated_score + 50;
        END IF;
        
        -- 6. Assembly Children inherit parent priority + 50
        IF job_record.parent_job_id IS NOT NULL THEN
          SELECT jobs.priority_score INTO parent_priority 
          FROM jobs 
          WHERE jobs.id = job_record.parent_job_id;
          
          IF parent_priority IS NOT NULL AND parent_priority + 50 > calculated_score THEN
            calculated_score := parent_priority + 50;
          END IF;
        END IF;
        
        -- 7. Outsourcing Lead Time (0-100 points, 5 points per day)
        IF job_record.has_outsourcing AND job_record.outsourcing_lead_days > 0 THEN
          calculated_score := calculated_score + LEAST(job_record.outsourcing_lead_days * 5, 100);
        END IF;
        
        -- Cap at 1000
        calculated_score := LEAST(calculated_score, 1000);
        
        -- Update the job's priority score
        UPDATE jobs SET priority_score = calculated_score WHERE id = job_id;
        
        RETURN calculated_score;
      END;
      $$ LANGUAGE plpgsql;`;
    
    await client.query(newFunction);
    console.log('✅ New function created');
    
    // Test the function immediately
    console.log('🧪 Testing new function...');
    
    // Insert a test job
    const testResult = await client.query(`
      INSERT INTO jobs (job_number, customer_name, part_name, quantity, priority, estimated_hours, status, promised_date, order_date)
      VALUES ('TEST456', 'TEST', 'Test Part', 1, 1, 1.0, 'pending', '2025-12-01', '2025-08-01')
      RETURNING id
    `);
    
    const testId = testResult.rows[0].id;
    
    const scoreResult = await client.query('SELECT calculate_priority_score($1) as score', [testId]);
    console.log(`✅ Function test successful! Score: ${scoreResult.rows[0].score}`);
    
    // Delete the test job
    await client.query('DELETE FROM jobs WHERE id = $1', [testId]);
    
    // Recreate the trigger
    console.log('🔔 Recreating trigger...');
    
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
    
    console.log('✅ Trigger recreated');
    
    client.release();
    
    console.log('\n🎉 Function and trigger completely rebuilt!');
    console.log('The CSV import should now work without errors.');
    
  } catch (error) {
    console.error('❌ Fix failed:', error.message);
    console.error(error.stack);
  } finally {
    await pool.end();
  }
}

// Run the fix
forceFixFunction();