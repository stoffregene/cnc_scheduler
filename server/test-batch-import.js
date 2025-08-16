const { Pool } = require('pg');
const path = require('path');
const JobBossCSVParserV2 = require('./services/jobbossCSVParserV2');
const PriorityService = require('./services/priorityService');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function testBatchImport() {
  try {
    console.log('🧪 Testing batch import to find problematic job...\n');
    
    const csvPath = path.join(__dirname, '..', 'AttachedAssets', 'data.csv');
    
    // Parse CSV
    const parser = new JobBossCSVParserV2(pool);
    const parsedData = await parser.parseCSV(csvPath);
    
    const priorityService = new PriorityService(pool);
    const manufacturingJobs = parsedData.jobs.filter(job => !job.is_pick_order);
    
    console.log(`Found ${manufacturingJobs.length} manufacturing jobs`);
    
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Clear existing data first
      console.log('🗑️ Clearing existing data...');
      await client.query('DELETE FROM schedule_slots');
      await client.query('DELETE FROM job_routings');
      await client.query('DELETE FROM jobs');
      
      let successCount = 0;
      let failedJob = null;
      
      // Try importing jobs one by one to find the problematic one
      for (let i = 0; i < Math.min(manufacturingJobs.length, 20); i++) {
        const job = manufacturingJobs[i];
        
        try {
          console.log(`Importing job ${i + 1}/${manufacturingJobs.length}: ${job.job_number}`);
          
          // Ensure customer tier exists
          await priorityService.ensureCustomerTier(job.customer_name);
          
          // Check for expedite status
          const isExpedite = priorityService.checkExpediteStatus(job.order_date, job.promised_date);
          
          const result = await client.query(`
            INSERT INTO jobs (
              job_number, customer_name, part_name, part_number, quantity,
              priority, estimated_hours, due_date, promised_date, order_date, start_date, status,
              material, special_instructions, job_boss_data, job_type, 
              is_assembly_parent, assembly_sequence, link_material,
              material_lead_days, material_due_date, material_req,
              is_stock_job, stock_number, is_expedite, has_outsourcing, outsourcing_lead_days
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27)
            RETURNING id
          `, [
            job.job_number, job.customer_name, job.part_name, job.part_number,
            job.quantity, job.priority, job.estimated_hours, job.due_date,
            job.promised_date, job.order_date, job.start_date, job.status, job.material,
            job.special_instructions, job.job_boss_data, job.job_type,
            job.is_assembly_parent, job.assembly_sequence, job.link_material,
            job.material_lead_days, job.material_due_date, job.material_req,
            job.is_stock_job, job.stock_number, isExpedite, 
            job.has_outsourcing || false, job.outsourcing_lead_days || 0
          ]);
          
          successCount++;
          console.log(`  ✅ Success (ID: ${result.rows[0].id})`);
          
        } catch (error) {
          failedJob = { index: i, job: job, error: error };
          console.log(`  ❌ Failed: ${error.message}`);
          break;
        }
      }
      
      await client.query('ROLLBACK'); // Don't save the test data
      
      console.log(`\\n📊 Results:`);
      console.log(`  Successfully imported: ${successCount} jobs`);
      
      if (failedJob) {
        console.log(`  Failed at job ${failedJob.index + 1}: ${failedJob.job.job_number}`);
        console.log(`  Error: ${failedJob.error.message}`);
        console.log(`  Error code: ${failedJob.error.code}`);
        
        console.log(`\\n🔍 Problematic job details:`);
        const job = failedJob.job;
        console.log(`    Job Number: ${job.job_number}`);
        console.log(`    Customer: ${job.customer_name}`);
        console.log(`    Part: ${job.part_name}`);
        console.log(`    Quantity: ${job.quantity} (${typeof job.quantity})`);
        console.log(`    Priority: ${job.priority} (${typeof job.priority})`);
        console.log(`    Estimated Hours: ${job.estimated_hours} (${typeof job.estimated_hours})`);
        console.log(`    Material Lead Days: ${job.material_lead_days} (${typeof job.material_lead_days})`);
        console.log(`    Outsourcing Lead Days: ${job.outsourcing_lead_days} (${typeof job.outsourcing_lead_days})`);
        console.log(`    Has Outsourcing: ${job.has_outsourcing} (${typeof job.has_outsourcing})`);
        console.log(`    Job Boss Data: ${JSON.stringify(job.job_boss_data).substring(0, 100)}...`);
      } else {
        console.log(`  All test jobs imported successfully!`);
      }
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    
  } catch (error) {
    console.error('❌ Batch test failed:', error.message);
    console.error(error.stack);
  } finally {
    await pool.end();
  }
}

// Run the test
testBatchImport();