const { Pool } = require('pg');
const JobBossCSVParser = require('./services/jobbossCSVParser');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function testSequence0Fix() {
  try {
    console.log('=== TESTING SEQUENCE 0 FIX ===\n');
    
    // Create a test CSV parser
    const parser = new JobBossCSVParser(pool);
    
    // Simulate CSV data with sequence 0
    const testData = [
      {
        job_number: 'TEST001',
        customer_name: 'TEST CUSTOMER',
        part_description: 'Test Part',
        est_required_qty: 1,
        amt_workcenter_vendor: 'SAW',
        sequence: '0',  // String sequence 0
        vendor: '',
        lead_days: 0,
        order_date: '2025-08-15',
        promised_date: '2025-08-30',
        est_total_hours: '2.5',
        status: 'ACTIVE',
        routing_status: 'O'
      },
      {
        job_number: 'TEST001',
        customer_name: 'TEST CUSTOMER',
        part_description: 'Test Part',
        est_required_qty: 1,
        amt_workcenter_vendor: 'LATHE-001',
        sequence: '1',  // String sequence 1
        vendor: '',
        lead_days: 0,
        order_date: '2025-08-15',
        promised_date: '2025-08-30',
        est_total_hours: '5.0',
        status: 'ACTIVE',
        routing_status: 'O'
      }
    ];
    
    // Test the cleanRow and validation logic
    console.log('1. Testing cleanRow processing:');
    const rawData = [];
    
    testData.forEach((row, index) => {
      const cleanedRow = parser.cleanRow(row);
      console.log(`   Row ${index}: sequence="${row.sequence}" → cleaned.sequence=${cleanedRow.sequence} (type: ${typeof cleanedRow.sequence})`);
      
      // Test the fixed condition
      if (cleanedRow.job_number && cleanedRow.sequence >= 0) {
        rawData.push(cleanedRow);
        console.log(`     ✅ Row accepted (condition: cleanedRow.sequence >= 0)`);
      } else {
        console.log(`     ❌ Row rejected`);
      }
    });
    
    console.log(`\n2. Results:`);
    console.log(`   Total test rows: ${testData.length}`);
    console.log(`   Rows accepted: ${rawData.length}`);
    console.log(`   Expected: 2 (both sequence 0 and 1)`);
    
    if (rawData.length === 2) {
      console.log(`   ✅ SUCCESS: Both sequence 0 and 1 operations accepted!`);
      
      // Show the accepted sequences
      console.log('\n   Accepted operations:');
      rawData.forEach(row => {
        console.log(`     Seq ${row.sequence}: ${row.amt_workcenter_vendor} (${row.est_total_hours}h)`);
      });
      
    } else {
      console.log(`   ❌ FAILURE: Expected 2 rows, got ${rawData.length}`);
    }
    
    // Test with additional edge cases
    console.log('\n3. Testing edge cases:');
    
    const edgeCases = [
      { sequence: '0', expected: true, case: 'String "0"' },
      { sequence: 0, expected: true, case: 'Number 0' },
      { sequence: '1', expected: true, case: 'String "1"' },
      { sequence: 1, expected: true, case: 'Number 1' },
      { sequence: '', expected: false, case: 'Empty string' },
      { sequence: null, expected: false, case: 'Null' },
      { sequence: undefined, expected: false, case: 'Undefined' }
    ];
    
    edgeCases.forEach(test => {
      const testRow = { job_number: 'TEST', sequence: test.sequence };
      const cleaned = parser.cleanRow(testRow);
      const accepted = !!(cleaned.job_number && cleaned.sequence >= 0);
      const status = accepted === test.expected ? '✅' : '❌';
      
      console.log(`     ${status} ${test.case}: sequence=${test.sequence} → ${cleaned.sequence} → ${accepted ? 'accepted' : 'rejected'}`);
    });
    
    console.log('\n=== CONCLUSION ===');
    console.log('The fix changes the condition from:');
    console.log('  OLD: if (cleanedRow.job_number && cleanedRow.sequence)');
    console.log('  NEW: if (cleanedRow.job_number && cleanedRow.sequence >= 0)');
    console.log('');
    console.log('This fixes the JavaScript falsy bug where sequence 0 was treated as false.');
    console.log('Now sequence 0 operations will be properly imported from CSV files!');
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
    process.exit();
  }
}

testSequence0Fix();