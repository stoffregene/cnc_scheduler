const { Pool } = require('pg');
const path = require('path');
const JobBossCSVParserV2 = require('./services/jobbossCSVParserV2');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function testRoutingIssue() {
  try {
    console.log('🔍 Finding the routing varchar(10) issue...\n');
    
    const csvPath = path.join(__dirname, '..', 'AttachedAssets', 'data.csv');
    
    // Parse CSV using V2 parser
    const parser = new JobBossCSVParserV2(pool);
    const parsedData = await parser.parseCSV(csvPath);
    
    // Check the job_routings table structure first
    const client = await pool.connect();
    
    console.log('📊 Checking job_routings table structure...');
    const columnInfo = await client.query(`
      SELECT column_name, data_type, character_maximum_length
      FROM information_schema.columns 
      WHERE table_name = 'job_routings' 
      AND data_type LIKE 'character%'
      ORDER BY ordinal_position;
    `);
    
    console.log('VARCHAR columns in job_routings:');
    columnInfo.rows.forEach(row => {
      console.log(`  ${row.column_name}: ${row.data_type}(${row.character_maximum_length || 'unlimited'})`);
    });
    
    // Check for operation numbers that are too long
    console.log('\n🔍 Checking routing operation numbers...');
    const longOpNumbers = parsedData.routings.filter(r => 
      r.operation_number && r.operation_number.length > 10
    );
    
    if (longOpNumbers.length > 0) {
      console.log(`⚠️ Found ${longOpNumbers.length} routings with operation_number > 10 chars:`);
      longOpNumbers.slice(0, 10).forEach(r => {
        console.log(`  Job ${r.job_number}, Op: "${r.operation_number}" (${r.operation_number.length} chars)`);
      });
    } else {
      console.log('✅ All operation numbers are 10 chars or less');
    }
    
    // Check for other fields that might be too long
    console.log('\n🔍 Checking other routing fields...');
    
    const fieldLengths = {
      operation_name: 100,
      notes: null, // TEXT field, no limit
      vendor_name: 100,
      routing_status: 10
    };
    
    Object.entries(fieldLengths).forEach(([field, maxLen]) => {
      if (maxLen) {
        const tooLong = parsedData.routings.filter(r => 
          r[field] && r[field].length > maxLen
        );
        
        if (tooLong.length > 0) {
          console.log(`⚠️ Found ${tooLong.length} routings with ${field} > ${maxLen} chars:`);
          tooLong.slice(0, 5).forEach(r => {
            console.log(`  Job ${r.job_number}: "${r[field]}" (${r[field].length} chars)`);
          });
        } else {
          console.log(`✅ All ${field} values are within limit (${maxLen} chars)`);
        }
      }
    });
    
    // Test inserting the first routing that has an issue
    console.log('\n🧪 Testing first routing insertion...');
    
    // First, insert a test job
    const testJobResult = await client.query(`
      INSERT INTO jobs (job_number, customer_name, part_name, quantity, priority, estimated_hours, status)
      VALUES ('TEST_ROUTING', 'TEST', 'Test Part', 1, 1, 1.0, 'pending')
      RETURNING id
    `);
    
    const testJobId = testJobResult.rows[0].id;
    
    // Try the first routing from the parsed data
    const firstRouting = parsedData.routings[0];
    console.log('\nFirst routing data:');
    console.log(`  Job: ${firstRouting.job_number}`);
    console.log(`  Operation Number: "${firstRouting.operation_number}" (${firstRouting.operation_number.length} chars)`);
    console.log(`  Operation Name: "${firstRouting.operation_name}" (${firstRouting.operation_name.length} chars)`);
    console.log(`  Routing Status: "${firstRouting.routing_status}" (${firstRouting.routing_status ? firstRouting.routing_status.length : 0} chars)`);
    
    try {
      const result = await client.query(`
        INSERT INTO job_routings (
          job_id, operation_number, operation_name, machine_id, machine_group_id,
          sequence_order, estimated_hours, notes, is_outsourced, 
          vendor_name, vendor_lead_days, routing_status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING id
      `, [
        testJobId, firstRouting.operation_number, firstRouting.operation_name,
        firstRouting.machine_id, firstRouting.machine_group_id, firstRouting.sequence_order,
        firstRouting.estimated_hours, firstRouting.notes, firstRouting.is_outsourced,
        firstRouting.vendor_name, firstRouting.vendor_lead_days, firstRouting.routing_status
      ]);
      
      console.log(`✅ Test routing inserted successfully! ID: ${result.rows[0].id}`);
      
      // Clean up
      await client.query('DELETE FROM job_routings WHERE job_id = $1', [testJobId]);
      
    } catch (error) {
      console.log(`❌ Test routing insertion failed: ${error.message}`);
      console.log(`Error code: ${error.code}`);
      console.log(`Error detail: ${error.detail || 'No detail'}`);
      console.log(`Error column: ${error.column || 'No column info'}`);
    }
    
    // Clean up test job
    await client.query('DELETE FROM jobs WHERE id = $1', [testJobId]);
    
    client.release();
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
  } finally {
    await pool.end();
  }
}

// Run the test
testRoutingIssue();