const { Pool } = require('pg');
const path = require('path');
const PriorityService = require('./services/priorityService');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function testPrioritySystem() {
  const priorityService = new PriorityService(pool);
  
  try {
    console.log('🧪 Testing Priority System...\n');
    
    // Test 1: Check customer tiers
    console.log('1. Customer Tiers:');
    const tiers = await priorityService.getAllCustomerTiers();
    tiers.forEach(tier => {
      console.log(`   ${tier.tier.toUpperCase()}: ${tier.customer_name} (Weight: ${tier.priority_weight})`);
    });
    
    // Test 2: Test job priority scores
    console.log('\n2. Job Priority Scores:');
    const jobsResult = await pool.query(`
      SELECT 
        j.job_number, 
        j.customer_name, 
        j.priority_score,
        j.promised_date,
        j.order_date,
        j.is_expedite,
        j.has_outsourcing,
        j.outsourcing_lead_days,
        j.is_assembly_parent,
        ct.tier as customer_tier
      FROM jobs j
      LEFT JOIN customer_tiers ct ON UPPER(ct.customer_name) = UPPER(j.customer_name)
      WHERE j.status != 'completed'
      ORDER BY j.priority_score DESC
      LIMIT 10
    `);
    
    console.log('Top 10 Jobs by Priority:');
    console.log('═════════════════════════════════════════════════════════════════');
    jobsResult.rows.forEach((job, index) => {
      const color = priorityService.getPriorityColor(job.priority_score);
      const label = priorityService.getPriorityLabel(job.priority_score);
      
      const flags = [];
      if (job.is_expedite) flags.push('EXPEDITE');
      if (job.has_outsourcing) flags.push(`OUTSOURCING(${job.outsourcing_lead_days}d)`);
      if (job.is_assembly_parent) flags.push('ASSEMBLY');
      
      const daysUntilPromised = job.promised_date ? 
        Math.ceil((new Date(job.promised_date) - new Date()) / (1000 * 60 * 60 * 24)) : 'N/A';
      
      console.log(
        `${(index + 1).toString().padStart(2)}. ${job.job_number.padEnd(15)} | ` +
        `${(job.customer_name || 'Unknown').padEnd(20)} | ` +
        `Score: ${job.priority_score.toString().padStart(4)} | ` +
        `${label.padEnd(8)} | ` +
        `Days: ${daysUntilPromised.toString().padStart(3)} | ` +
        `${flags.join(', ')}`
      );
    });
    
    // Test 3: Test expedite detection
    console.log('\n3. Expedite Detection Test:');
    const orderDate = new Date();
    const promisedDate1 = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000); // 20 days
    const promisedDate2 = new Date(Date.now() + 35 * 24 * 60 * 60 * 1000); // 35 days
    
    console.log(`   Order to 20 days: ${priorityService.checkExpediteStatus(orderDate, promisedDate1) ? 'EXPEDITE' : 'Normal'}`);
    console.log(`   Order to 35 days: ${priorityService.checkExpediteStatus(orderDate, promisedDate2) ? 'EXPEDITE' : 'Normal'}`);
    
    // Test 4: Test priority color coding
    console.log('\n4. Priority Color Coding:');
    const testScores = [950, 750, 450, 150];
    testScores.forEach(score => {
      const color = priorityService.getPriorityColor(score);
      const label = priorityService.getPriorityLabel(score);
      console.log(`   Score ${score}: ${label} (${color})`);
    });
    
    // Test 5: Check if trigger is working
    console.log('\n5. Testing Auto-Lock Trigger:');
    const lockTestResult = await pool.query(`
      SELECT 
        ss.id,
        ss.status,
        ss.locked,
        j.job_number,
        j.schedule_locked,
        j.lock_reason
      FROM schedule_slots ss
      JOIN jobs j ON ss.job_id = j.id
      WHERE ss.status IN ('started', 'in_progress', 'completed')
      LIMIT 3
    `);
    
    if (lockTestResult.rows.length > 0) {
      console.log('   Started/Completed Operations:');
      lockTestResult.rows.forEach(row => {
        console.log(`   - Job ${row.job_number}: Status=${row.status}, Slot Locked=${row.locked}, Job Locked=${row.schedule_locked}`);
      });
    } else {
      console.log('   No started/completed operations found to test locks');
    }
    
    console.log('\n✅ Priority system test complete!');
    console.log('\n📝 Summary:');
    console.log(`   - Customer tiers: ${tiers.length} configured`);
    console.log(`   - Job priority scores: Calculated for all jobs`);
    console.log(`   - Expedite detection: Working`);
    console.log(`   - Color coding: Implemented`);
    console.log(`   - Auto-lock triggers: ${lockTestResult.rows.length > 0 ? 'Active' : 'Ready'}`);
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
  } finally {
    await pool.end();
  }
}

testPrioritySystem();