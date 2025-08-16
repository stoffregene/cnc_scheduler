const { Pool } = require('pg');
const path = require('path');
const JobBossCSVParserV2 = require('./services/jobbossCSVParserV2');
const PriorityService = require('./services/priorityService');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function testSingleJobImport() {
  try {
    console.log('🧪 Testing single job import to isolate overflow issue...\n');
    
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
      
      // Test just the first job
      const testJob = manufacturingJobs[0];
      console.log(`\\nTesting job: ${testJob.job_number}`);
      console.log(`Customer: ${testJob.customer_name}`);
      
      // Print all the values we're about to insert
      console.log('\\n📋 Values to insert:');
      const insertValues = [
        testJob.job_number, testJob.customer_name, testJob.part_name, testJob.part_number,
        testJob.quantity, testJob.priority, testJob.estimated_hours, testJob.due_date,
        testJob.promised_date, testJob.order_date, testJob.start_date, testJob.status, testJob.material,
        testJob.special_instructions, testJob.job_boss_data, testJob.job_type,
        testJob.is_assembly_parent, testJob.assembly_sequence, testJob.link_material,
        testJob.material_lead_days, testJob.material_due_date, testJob.material_req,
        testJob.is_stock_job, testJob.stock_number, 
        priorityService.checkExpediteStatus(testJob.order_date, testJob.promised_date), 
        testJob.has_outsourcing || false, testJob.outsourcing_lead_days || 0
      ];
      
      insertValues.forEach((value, index) => {
        console.log(`  $${index + 1}: ${value} (${typeof value})`);
      });
      
      // Ensure customer tier exists
      await priorityService.ensureCustomerTier(testJob.customer_name);
      
      // Check for expedite status
      const isExpedite = priorityService.checkExpediteStatus(testJob.order_date, testJob.promised_date);
      
      console.log(`\\n🔍 Expedite status: ${isExpedite}`);
      
      // Try the exact same query as the import script
      console.log('\\n💾 Attempting database insert...');
      
      const result = await client.query(`
        INSERT INTO jobs (
          job_number, customer_name, part_name, part_number, quantity,
          priority, estimated_hours, due_date, promised_date, order_date, start_date, status,
          material, special_instructions, job_boss_data, job_type, 
          is_assembly_parent, assembly_sequence, link_material,
          material_lead_days, material_due_date, material_req,
          is_stock_job, stock_number, is_expedite, has_outsourcing, outsourcing_lead_days
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27)
        RETURNING *
      `, [
        testJob.job_number, testJob.customer_name, testJob.part_name, testJob.part_number,
        testJob.quantity, testJob.priority, testJob.estimated_hours, testJob.due_date,
        testJob.promised_date, testJob.order_date, testJob.start_date, testJob.status, testJob.material,
        testJob.special_instructions, testJob.job_boss_data, testJob.job_type,
        testJob.is_assembly_parent, testJob.assembly_sequence, testJob.link_material,
        testJob.material_lead_days, testJob.material_due_date, testJob.material_req,
        testJob.is_stock_job, testJob.stock_number, isExpedite, 
        testJob.has_outsourcing || false, testJob.outsourcing_lead_days || 0
      ]);
      
      console.log(`✅ Job inserted successfully!`);
      console.log(`   ID: ${result.rows[0].id}`);
      console.log(`   Priority Score: ${result.rows[0].priority_score}`);
      
      await client.query('ROLLBACK'); // Don't save the test
      
    } catch (error) {
      await client.query('ROLLBACK');
      console.log(`❌ Insert failed: ${error.message}`);
      console.log(`Error code: ${error.code}`);
      console.log(`Error detail: ${error.detail || 'No detail'}`);
      console.log(`Error hint: ${error.hint || 'No hint'}`);
      console.log(`Error position: ${error.position || 'No position'}`);
      
      // Check which specific value might be problematic
      if (error.message.includes('numeric field overflow')) {
        console.log('\\n🔍 Checking for problematic numeric values:');
        
        const numericChecks = [
          { name: 'quantity', value: testJob.quantity, max: 2147483647 },
          { name: 'priority', value: testJob.priority, max: 2147483647 },
          { name: 'estimated_hours', value: testJob.estimated_hours, max: 999999.99 },
          { name: 'material_lead_days', value: testJob.material_lead_days, max: 2147483647 },
          { name: 'outsourcing_lead_days', value: testJob.outsourcing_lead_days || 0, max: 2147483647 }
        ];
        
        numericChecks.forEach(check => {
          if (check.value > check.max) {
            console.log(`  ⚠️ ${check.name}: ${check.value} exceeds max ${check.max}`);
          } else {
            console.log(`  ✅ ${check.name}: ${check.value} (OK)`);
          }
        });
      }
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
testSingleJobImport();