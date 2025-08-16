const { Pool } = require('pg');
const path = require('path');
const JobBossCSVParserV2 = require('./services/jobbossCSVParserV2');
const PriorityService = require('./services/priorityService');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function testFullImport() {
  try {
    console.log('🧪 Testing FULL CSV import to find all issues...\n');
    
    const csvPath = path.join(__dirname, '..', 'AttachedAssets', 'data.csv');
    console.log(`📁 Reading CSV from: ${csvPath}`);
    
    // Parse CSV using V2 parser
    const parser = new JobBossCSVParserV2(pool);
    const parsedData = await parser.parseCSV(csvPath);
    
    console.log(`Parsed ${parsedData.jobs.length} jobs and ${parsedData.routings.length} routing lines`);
    
    // Initialize priority service
    const priorityService = new PriorityService(pool);
    
    // Start database transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      console.log('🗑️ Clearing existing data...');
      await client.query('DELETE FROM schedule_slots');
      await client.query('DELETE FROM job_routings');
      await client.query('DELETE FROM jobs');
      
      const insertedJobs = [];
      const insertedRoutings = [];
      const pickOrders = [];
      
      // Separate pick orders from manufacturing jobs
      const manufacturingJobs = parsedData.jobs.filter(job => !job.is_pick_order);
      const pickOrderJobs = parsedData.jobs.filter(job => job.is_pick_order);
      
      console.log(`Found ${pickOrderJobs.length} pick orders (excluded from manufacturing schedule)`);
      console.log(`Processing ${manufacturingJobs.length} manufacturing jobs`);
      
      // Store pick orders for tracking
      pickOrderJobs.forEach(pickOrder => {
        pickOrders.push({
          job_number: pickOrder.job_number,
          customer_name: pickOrder.customer_name,
          part_name: pickOrder.part_name,
          pick_qty: pickOrder.pick_qty,
          make_qty: pickOrder.make_qty,
          promised_date: pickOrder.promised_date
        });
      });
      
      console.log('\n📊 Inserting jobs...');
      let jobErrors = [];
      
      // Insert manufacturing jobs
      for (let i = 0; i < manufacturingJobs.length; i++) {
        const job = manufacturingJobs[i];
        
        try {
          // Ensure customer tier exists
          await priorityService.ensureCustomerTier(job.customer_name);
          
          // Check for expedite status
          const isExpedite = priorityService.checkExpediteStatus(job.order_date, job.promised_date);
          
          // Check field lengths before insert
          const fieldChecks = [
            { name: 'job_number', value: job.job_number, maxLen: 50 },
            { name: 'customer_name', value: job.customer_name, maxLen: 100 },
            { name: 'part_name', value: job.part_name, maxLen: 100 },
            { name: 'part_number', value: job.part_number, maxLen: 50 },
            { name: 'material', value: job.material, maxLen: 50 },
            { name: 'status', value: job.status, maxLen: 20 },
            { name: 'job_type', value: job.job_type, maxLen: 20 },
            { name: 'material_req', value: job.material_req, maxLen: 100 },
            { name: 'stock_number', value: job.stock_number, maxLen: 50 }
          ];
          
          let hasLengthIssue = false;
          fieldChecks.forEach(check => {
            if (check.value && check.value.length > check.maxLen) {
              console.log(`  ⚠️ Job ${job.job_number}: ${check.name} too long (${check.value.length} > ${check.maxLen}): "${check.value}"`);
              hasLengthIssue = true;
            }
          });
          
          if (hasLengthIssue) {
            jobErrors.push({ job: job.job_number, error: 'Field length exceeded' });
            continue;
          }
          
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
            job.job_number, job.customer_name, job.part_name, job.part_number,
            job.quantity, job.priority, job.estimated_hours, job.due_date,
            job.promised_date, job.order_date, job.start_date, job.status, job.material,
            job.special_instructions, job.job_boss_data, job.job_type,
            job.is_assembly_parent, job.assembly_sequence, job.link_material,
            job.material_lead_days, job.material_due_date, job.material_req,
            job.is_stock_job, job.stock_number, isExpedite, 
            job.has_outsourcing || false, job.outsourcing_lead_days || 0
          ]);
          
          insertedJobs.push(result.rows[0]);
          if (i % 50 === 0) {
            console.log(`  Progress: ${i}/${manufacturingJobs.length} jobs inserted`);
          }
          
        } catch (error) {
          console.log(`  ❌ Failed to insert job ${job.job_number}: ${error.message}`);
          if (error.message.includes('character varying')) {
            console.log(`     Error detail: ${error.detail || 'No detail'}`);
          }
          jobErrors.push({ job: job.job_number, error: error.message });
        }
      }
      
      console.log(`\n✅ Inserted ${insertedJobs.length} jobs`);
      if (jobErrors.length > 0) {
        console.log(`❌ Failed to insert ${jobErrors.length} jobs:`);
        jobErrors.slice(0, 5).forEach(err => {
          console.log(`   - ${err.job}: ${err.error}`);
        });
      }
      
      console.log('\n⚙️ Inserting routings...');
      
      // Create a map of job_number to job_id for routing insertion
      const jobIdMap = new Map();
      insertedJobs.forEach(job => {
        jobIdMap.set(job.job_number, job.id);
      });
      
      // Insert job routings (only for manufacturing jobs, not pick orders)
      const manufacturingJobNumbers = new Set(manufacturingJobs.map(j => j.job_number));
      const manufacturingRoutings = parsedData.routings.filter(r => 
        manufacturingJobNumbers.has(r.job_number)
      );
      
      let routingErrors = [];
      
      for (let i = 0; i < manufacturingRoutings.length; i++) {
        const routing = manufacturingRoutings[i];
        const jobId = jobIdMap.get(routing.job_number);
        if (!jobId) continue;
        
        try {
          // Check for varchar(10) issue
          if (routing.operation_number && routing.operation_number.length > 10) {
            console.log(`  ⚠️ Operation number too long for job ${routing.job_number}: "${routing.operation_number}" (${routing.operation_number.length} chars)`);
            routingErrors.push({ job: routing.job_number, op: routing.operation_number, error: 'Operation number too long' });
            continue;
          }
          
          const result = await client.query(`
            INSERT INTO job_routings (
              job_id, operation_number, operation_name, machine_id, machine_group_id,
              sequence_order, estimated_hours, notes, is_outsourced, 
              vendor_name, vendor_lead_days, routing_status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            RETURNING *
          `, [
            jobId, routing.operation_number, routing.operation_name,
            routing.machine_id, routing.machine_group_id, routing.sequence_order,
            routing.estimated_hours, routing.notes, routing.is_outsourced,
            routing.vendor_name, routing.vendor_lead_days, routing.routing_status
          ]);
          
          insertedRoutings.push(result.rows[0]);
          
        } catch (error) {
          if (error.message.includes('duplicate key')) {
            // Skip duplicates silently as they're expected with the raw data
          } else {
            console.log(`  ❌ Failed to insert routing for job ${routing.job_number}, op ${routing.operation_number}: ${error.message}`);
            routingErrors.push({ job: routing.job_number, op: routing.operation_number, error: error.message });
          }
        }
      }
      
      console.log(`\n✅ Inserted ${insertedRoutings.length} routings`);
      if (routingErrors.length > 0) {
        console.log(`❌ Failed to insert ${routingErrors.length} routings`);
      }
      
      await client.query('ROLLBACK'); // Don't save test data
      
      console.log('\n📊 Import Test Summary:');
      console.log(`  Total jobs: ${parsedData.jobs.length}`);
      console.log(`  Pick orders: ${pickOrders.length}`);
      console.log(`  Manufacturing jobs: ${manufacturingJobs.length}`);
      console.log(`  Successfully inserted jobs: ${insertedJobs.length}`);
      console.log(`  Successfully inserted routings: ${insertedRoutings.length}`);
      console.log(`  Job errors: ${jobErrors.length}`);
      console.log(`  Routing errors: ${routingErrors.length}`);
      
      if (jobErrors.length === 0 && routingErrors.length === 0) {
        console.log('\n🎉 All data can be imported successfully!');
      } else {
        console.log('\n⚠️ Some issues need to be fixed before import');
      }
      
    } catch (error) {
      await client.query('ROLLBACK');
      console.log(`\n❌ Critical error: ${error.message}`);
      console.log(`Error code: ${error.code}`);
      console.log(`Error detail: ${error.detail || 'No detail'}`);
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
testFullImport();