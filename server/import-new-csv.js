const { Pool } = require('pg');
const path = require('path');
const JobBossCSVParserV2 = require('./services/jobbossCSVParserV2');
const PriorityService = require('./services/priorityService');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function importNewCSV() {
  try {
    console.log('📥 Starting import of new CSV format...\n');
    
    const csvPath = path.join(__dirname, '..', 'AttachedAssets', 'data.csv');
    console.log(`📁 Reading CSV from: ${csvPath}`);
    
    // Parse CSV using the new parser
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
      
      // Clear existing data to avoid conflicts
      await client.query('DELETE FROM schedule_slots');
      await client.query('DELETE FROM job_routings');
      await client.query('DELETE FROM jobs');
      
      const insertedJobs = [];
      const insertedRoutings = [];
      const pickOrders = [];
      
      console.log('📊 Inserting jobs...');
      
      // Separate pick orders from manufacturing jobs
      const manufacturingJobs = parsedData.jobs.filter(job => !job.is_pick_order);
      const pickOrderJobs = parsedData.jobs.filter(job => job.is_pick_order);
      
      console.log(`   Found ${pickOrderJobs.length} pick orders (excluded from manufacturing schedule)`);
      console.log(`   Processing ${manufacturingJobs.length} manufacturing jobs`);
      
      // Insert manufacturing jobs
      for (const job of manufacturingJobs) {
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
      }
      
      // Store pick orders separately for tracking
      for (const pickOrder of pickOrderJobs) {
        pickOrders.push({
          job_number: pickOrder.job_number,
          customer_name: pickOrder.customer_name,
          part_name: pickOrder.part_name,
          pick_qty: pickOrder.pick_qty,
          make_qty: pickOrder.make_qty,
          promised_date: pickOrder.promised_date
        });
      }
      
      console.log('⚙️ Inserting routings...');
      
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
      
      for (const routing of manufacturingRoutings) {
        const jobId = jobIdMap.get(routing.job_number);
        if (!jobId) continue;
        
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
      }
      
      console.log('🏭 Processing vendors...');
      
      // Store vendor data for lead time tracking
      for (const [vendorName, leadDays] of parsedData.vendors) {
        // Insert/update vendor record
        await client.query(`
          INSERT INTO vendors (name, lead_days, vendor_type, status)
          VALUES ($1, $2, 'outsource', 'active')
          ON CONFLICT (name) DO UPDATE SET
            lead_days = EXCLUDED.lead_days,
            updated_at = CURRENT_TIMESTAMP
        `, [vendorName, leadDays]);
      }
      
      console.log('🎯 Calculating priority scores...');
      
      // Calculate priority scores for all imported jobs
      const priorityUpdates = [];
      for (const job of insertedJobs) {
        const priorityScore = await priorityService.calculatePriorityScore(job.id);
        priorityUpdates.push({
          job_number: job.job_number,
          priority_score: priorityScore
        });
      }
      
      await client.query('COMMIT');
      
      console.log('\n✅ Import completed successfully!');
      console.log(`📊 Summary:`);
      console.log(`   - Manufacturing jobs imported: ${insertedJobs.length}`);
      console.log(`   - Pick orders identified: ${pickOrders.length}`);
      console.log(`   - Routings imported: ${insertedRoutings.length}`);
      console.log(`   - Vendors processed: ${parsedData.vendors.length}`);
      console.log(`   - Priority scores calculated: ${priorityUpdates.length}`);
      
      // Show top priority jobs
      const topJobs = await client.query(`
        SELECT job_number, customer_name, priority_score, promised_date, has_outsourcing
        FROM jobs 
        ORDER BY priority_score DESC 
        LIMIT 10
      `);
      
      console.log('\n🏆 Top Priority Jobs:');
      topJobs.rows.forEach((job, index) => {
        const outsourcing = job.has_outsourcing ? ' [OUTSOURCED]' : '';
        console.log(`   ${index + 1}. ${job.job_number} (${job.customer_name}) - Score: ${job.priority_score}${outsourcing}`);
      });
      
      // Show sample pick orders
      if (pickOrders.length > 0) {
        console.log('\n📦 Sample Pick Orders (excluded from manufacturing):');
        pickOrders.slice(0, 5).forEach((order, index) => {
          console.log(`   ${index + 1}. ${order.job_number} (${order.customer_name})`);
          console.log(`      Part: ${order.part_name}`);
          console.log(`      Pick Qty = Make Qty: ${order.pick_qty}`);
          console.log(`      Due: ${order.promised_date}`);
        });
        
        if (pickOrders.length > 5) {
          console.log(`   ... and ${pickOrders.length - 5} more pick orders`);
        }
      }
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    
  } catch (error) {
    console.error('❌ Import failed:', error.message);
    console.error(error.stack);
  } finally {
    await pool.end();
  }
}

// Check if this is being run directly
if (require.main === module) {
  importNewCSV();
}

module.exports = { importNewCSV };