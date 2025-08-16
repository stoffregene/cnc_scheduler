const { Pool } = require('pg');
const path = require('path');
const JobBossCSVParserV2 = require('./services/jobbossCSVParserV2');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function testCSVParserV2() {
  try {
    console.log('🧪 Testing JobBoss CSV Parser V2...\n');
    
    const csvPath = path.join(__dirname, '..', 'AttachedAssets', 'data.csv');
    console.log(`📁 Reading CSV from: ${csvPath}`);
    
    // Test the new parser
    const parser = new JobBossCSVParserV2(pool);
    const parsedData = await parser.parseCSV(csvPath);
    
    console.log('\n📊 Parsing Results:');
    console.log(`   Jobs parsed: ${parsedData.jobs.length}`);
    console.log(`   Routings parsed: ${parsedData.routings.length}`);
    console.log(`   Assembly groups: ${parsedData.assemblyGroups.length}`);
    console.log(`   Vendors found: ${parsedData.vendors.length}`);
    
    // Analyze job types
    const jobTypes = {};
    const customers = new Set();
    const outsourcedOps = [];
    const pickOrders = [];
    const manufacturingJobs = [];
    
    parsedData.jobs.forEach(job => {
      jobTypes[job.job_type] = (jobTypes[job.job_type] || 0) + 1;
      customers.add(job.customer_name);
      
      if (job.is_pick_order) {
        pickOrders.push(job);
      } else {
        manufacturingJobs.push(job);
      }
    });
    
    parsedData.routings.forEach(routing => {
      if (routing.is_outsourced) {
        outsourcedOps.push({
          job: routing.job_number,
          vendor: routing.vendor_name,
          leadDays: routing.vendor_lead_days
        });
      }
    });
    
    console.log('\n🏗️ Job Classification:');
    console.log(`   Manufacturing jobs: ${manufacturingJobs.length}`);
    console.log(`   Pick orders (no manufacturing): ${pickOrders.length}`);
    console.log('\n📋 Job Type Distribution:');
    Object.entries(jobTypes).forEach(([type, count]) => {
      console.log(`   ${type}: ${count} jobs`);
    });
    
    console.log('\n👥 Customers Found:');
    Array.from(customers).sort().forEach(customer => {
      console.log(`   - ${customer}`);
    });
    
    console.log('\n🏭 Outsourced Operations:');
    if (outsourcedOps.length === 0) {
      console.log('   No outsourced operations detected');
    } else {
      outsourcedOps.forEach((op, index) => {
        console.log(`   ${index + 1}. Job ${op.job} → ${op.vendor} (${op.leadDays} days)`);
      });
    }
    
    // Show sample jobs
    console.log('\n📋 Sample Jobs:');
    parsedData.jobs.slice(0, 5).forEach((job, index) => {
      const routingCount = parsedData.routings.filter(r => r.job_number === job.job_number).length;
      console.log(`   ${index + 1}. ${job.job_number} (${job.customer_name})`);
      console.log(`      Part: ${job.part_name}`);
      console.log(`      Qty: ${job.quantity} | Hours: ${job.estimated_hours}`);
      console.log(`      Due: ${job.due_date} | Type: ${job.job_type}`);
      console.log(`      Routings: ${routingCount} operations`);
      console.log(`      Outsourcing: ${job.has_outsourcing ? `Yes (${job.outsourcing_lead_days} days)` : 'No'}`);
      console.log('');
    });
    
    // Show sample routings
    console.log('\n⚙️ Sample Routings:');
    const sampleJob = parsedData.jobs[0];
    const jobRoutings = parsedData.routings.filter(r => r.job_number === sampleJob.job_number);
    
    console.log(`   For job: ${sampleJob.job_number}`);
    jobRoutings.forEach((routing, index) => {
      console.log(`   ${index + 1}. Op ${routing.operation_number}: ${routing.operation_name}`);
      console.log(`      Sequence: ${routing.sequence_order} | Hours: ${routing.estimated_hours}`);
      console.log(`      Outsourced: ${routing.is_outsourced ? 'Yes' : 'No'}`);
      console.log(`      Status: ${routing.routing_status}`);
    });
    
    // Assembly analysis
    if (parsedData.assemblyGroups.length > 0) {
      console.log('\n🔧 Assembly Relationships:');
      parsedData.assemblyGroups.forEach(([baseJobNumber, group]) => {
        console.log(`   Parent: ${baseJobNumber} → ${group.children.length} children`);
        group.children.forEach(child => {
          console.log(`     - ${child.job_number} (Seq: ${child.assembly_sequence})`);
        });
      });
    }
    
    // Vendor analysis
    if (parsedData.vendors.length > 0) {
      console.log('\n🏪 Vendor Lead Times:');
      parsedData.vendors.forEach(([vendor, leadDays]) => {
        console.log(`   ${vendor}: ${leadDays} days`);
      });
    }
    
    // Show sample pick orders
    if (pickOrders.length > 0) {
      console.log('\n📦 Sample Pick Orders (excluded from manufacturing):');
      pickOrders.slice(0, 3).forEach((order, index) => {
        console.log(`   ${index + 1}. ${order.job_number} (${order.customer_name})`);
        console.log(`      Part: ${order.part_name}`);
        console.log(`      Pick Qty = Make Qty: ${order.pick_qty}`);
        console.log(`      Due: ${order.due_date}`);
        console.log('');
      });
      
      if (pickOrders.length > 3) {
        console.log(`   ... and ${pickOrders.length - 3} more pick orders`);
      }
    } else {
      console.log('\n📦 No pick orders found in this dataset');
    }
    
    console.log('\n✅ CSV Parser V2 test completed successfully!');
    console.log('\n📝 Key Differences from V1:');
    console.log('   - New columns: Affects_Schedule, Part_Number, Operation Status, Make Qty, Pick Qty');
    console.log('   - Pick order classification (pick_qty = make_qty)');
    console.log('   - Improved outsourcing detection via vendor field instead of operation status');
    console.log('   - Better operation sequencing based on workcenter type');
    console.log('   - Enhanced material tracking with affects_schedule flag');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
  } finally {
    await pool.end();
  }
}

testCSVParserV2();