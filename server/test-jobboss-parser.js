const JobBossCSVParser = require('./services/jobbossCSVParser');
const { Pool } = require('pg');
require('dotenv').config();

async function testJobBossParser() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL
  });

  try {
    console.log('🔧 Testing JobBoss CSV Parser\n');
    
    const parser = new JobBossCSVParser(pool);
    const csvPath = 'C:\\Users\\stoff\\Scheduler\\test-jobboss-sample.csv';
    
    console.log('Parsing sample CSV file...');
    const result = await parser.parseCSV(csvPath);
    
    console.log('\n📊 Parse Results:');
    console.log('='.repeat(80));
    console.log(`Jobs Found: ${result.jobs.length}`);
    console.log(`Routing Lines: ${result.routings.length}`);
    console.log(`Assembly Groups: ${result.assemblyGroups.length}`);
    console.log(`Vendors Found: ${result.vendors.length}`);
    
    console.log('\n📋 Jobs Details:');
    console.log('='.repeat(80));
    result.jobs.forEach(job => {
      console.log(`${job.job_number} (${job.job_type})`);
      console.log(`  Customer: ${job.customer_name}`);
      console.log(`  Part: ${job.part_name}`);
      console.log(`  Qty: ${job.quantity}, Hours: ${job.estimated_hours}`);
      console.log(`  Material: ${job.link_material ? 'Required' : 'Not required'}`);
      if (job.material_req) {
        console.log(`  Material Order: ${job.material_req}`);
      }
      console.log('');
    });
    
    console.log('\n🔧 Routing Details:');
    console.log('='.repeat(80));
    result.routings.forEach(routing => {
      const outsourced = routing.is_outsourced ? ` (Outsourced to ${routing.vendor_name})` : '';
      console.log(`${routing.job_number} Op${routing.operation_number}: ${routing.operation_name}${outsourced}`);
      console.log(`  Sequence: ${routing.sequence_order}, Hours: ${routing.estimated_hours}, Status: ${routing.routing_status}`);
    });
    
    console.log('\n🏭 Assembly Groups:');
    console.log('='.repeat(80));
    result.assemblyGroups.forEach(([baseNumber, group]) => {
      console.log(`Assembly ${baseNumber}:`);
      if (group.parent) {
        console.log(`  Parent: ${group.parent.job_number} - ${group.parent.part_name}`);
      }
      console.log(`  Children: ${group.children.length}`);
      group.children.forEach(child => {
        console.log(`    ${child.job_number} (Seq: ${child.assembly_sequence}) - ${child.part_name}`);
      });
      console.log('');
    });
    
    console.log('\n🚚 Vendors:');
    console.log('='.repeat(80));
    result.vendors.forEach(([name, leadDays]) => {
      console.log(`${name}: ${leadDays} day lead time`);
    });
    
    console.log('\n🎉 JobBoss CSV parser test completed successfully!');
    
  } catch (error) {
    console.error('❌ Error testing parser:', error.message);
    console.error('Error stack:', error.stack);
  } finally {
    await pool.end();
  }
}

testJobBossParser();