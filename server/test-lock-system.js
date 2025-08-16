const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function testLockSystem() {
  try {
    console.log('🧪 Testing Lock System...\n');
    
    // Step 1: Find a job with a scheduled operation
    const scheduledOps = await pool.query(`
      SELECT 
        ss.id as slot_id,
        ss.job_id,
        j.job_number,
        ss.status,
        ss.locked
      FROM schedule_slots ss
      JOIN jobs j ON ss.job_id = j.id
      WHERE ss.status != 'completed'
      LIMIT 1
    `);
    
    if (scheduledOps.rows.length === 0) {
      console.log('❌ No scheduled operations found to test with');
      return;
    }
    
    const slot = scheduledOps.rows[0];
    console.log(`📋 Found slot ${slot.slot_id} for job ${slot.job_number}`);
    console.log(`   Status: ${slot.status}, Locked: ${slot.locked}`);
    
    // Step 2: Simulate starting the operation (this should trigger auto-lock)
    console.log('\n🔧 Simulating operation start...');
    await pool.query(`
      UPDATE schedule_slots 
      SET status = 'started'
      WHERE id = $1
    `, [slot.slot_id]);
    
    // Step 3: Check if auto-lock triggered
    const afterUpdate = await pool.query(`
      SELECT 
        ss.locked as slot_locked,
        ss.status,
        j.schedule_locked as job_locked,
        j.lock_reason
      FROM schedule_slots ss
      JOIN jobs j ON ss.job_id = j.id
      WHERE ss.id = $1
    `, [slot.slot_id]);
    
    const result = afterUpdate.rows[0];
    console.log(`✅ After starting operation:`);
    console.log(`   Slot locked: ${result.slot_locked}`);
    console.log(`   Job locked: ${result.job_locked}`);
    console.log(`   Lock reason: ${result.lock_reason || 'None'}`);
    
    // Step 4: Test frontend API response
    console.log('\n🌐 Testing API response...');
    const jobApiResponse = await pool.query(`
      SELECT job_number, schedule_locked, lock_reason, priority_score
      FROM jobs 
      WHERE id = $1
    `, [slot.job_id]);
    
    console.log('Job API data:', jobApiResponse.rows[0]);
    
    // Step 5: Test job routings API response
    const routingsResponse = await pool.query(`
      SELECT 
        jr.operation_number,
        ss.locked as slot_locked,
        ss.status as schedule_status
      FROM job_routings jr
      LEFT JOIN schedule_slots ss ON jr.id = ss.job_routing_id
      WHERE jr.job_id = $1
      ORDER BY jr.sequence_order
    `, [slot.job_id]);
    
    console.log('\nRoutings with lock status:');
    routingsResponse.rows.forEach(routing => {
      console.log(`  Op ${routing.operation_number}: Status=${routing.schedule_status}, Locked=${routing.slot_locked}`);
    });
    
    console.log('\n🎯 Lock system test complete!');
    console.log('   - Auto-lock triggers should be working');
    console.log('   - Frontend should now display lock indicators');
    console.log('   - Check the UI at http://localhost:3000');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  } finally {
    await pool.end();
  }
}

testLockSystem();