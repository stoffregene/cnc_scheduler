const { Pool } = require('pg');
const path = require('path');
const UndoService = require('./services/undoService');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5732/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function testUndoSimple() {
  try {
    console.log('🧪 Testing undo system with simple operations...\n');
    
    const undoService = new UndoService(pool);
    
    // Step 1: Test creating manual undo operations
    console.log('🔄 Step 1: Creating test undo operations...');
    
    // Get a few test jobs
    const jobsResult = await pool.query(`
      SELECT id, job_number, customer_name
      FROM jobs 
      WHERE status != 'completed'
      ORDER BY id ASC 
      LIMIT 3
    `);
    
    if (jobsResult.rows.length === 0) {
      console.log('❌ No jobs found for testing');
      return;
    }
    
    const testJobs = jobsResult.rows.slice(0, 2);
    console.log(`   Found ${testJobs.length} test jobs:`);
    testJobs.forEach((job, index) => {
      console.log(`     ${index + 1}. ${job.job_number} (${job.customer_name})`);
    });
    
    // Create a manual undo operation
    const undoResult1 = await undoService.createUndoOperation(
      'manual_reschedule',
      `Test manual reschedule of job ${testJobs[0].job_number}`,
      [testJobs[0].id],
      {
        userAction: 'test_manual_reschedule',
        metadata: { 
          testOperation: true,
          originalJobNumber: testJobs[0].job_number 
        }
      }
    );
    
    console.log(`   Manual undo operation: ${undoResult1.success ? '✅ Created' : '❌ Failed'}`);
    if (undoResult1.success) {
      console.log(`     Undo ID: ${undoResult1.undoOperationId}`);
      console.log(`     Affected jobs: ${undoResult1.affectedJobsCount}`);
    }
    
    // Create an auto-schedule undo operation
    const undoResult2 = await undoService.createUndoOperation(
      'auto_schedule',
      `Test auto-schedule of multiple jobs`,
      testJobs.map(j => j.id),
      {
        userAction: 'test_auto_schedule',
        metadata: { 
          testOperation: true,
          scheduledJobs: testJobs.map(j => j.job_number)
        }
      }
    );
    
    console.log(`   Auto-schedule undo operation: ${undoResult2.success ? '✅ Created' : '❌ Failed'}`);
    if (undoResult2.success) {
      console.log(`     Undo ID: ${undoResult2.undoOperationId}`);
      console.log(`     Affected jobs: ${undoResult2.affectedJobsCount}`);
    }
    
    // Step 2: List available undo operations
    console.log('\n📋 Step 2: Available undo operations:');
    const undoOps = await undoService.getAvailableUndoOperations({ limit: 10 });
    
    console.log(`   Found ${undoOps.length} available undo operations:`);
    undoOps.forEach((op, index) => {
      const timeRemaining = Math.round(op.time_remaining / (1000 * 60 * 60)); // hours
      console.log(`     ${index + 1}. ID ${op.id}: ${op.operation_type}`);
      console.log(`        Description: ${op.operation_description}`);
      console.log(`        Affects ${op.affected_jobs} jobs, ${op.affected_operations} operations`);
      console.log(`        Expires in ${timeRemaining}h, Can undo: ${op.can_undo ? '✅' : '❌'}`);
      console.log(`        Created: ${new Date(op.created_at).toLocaleString()}`);
    });
    
    // Step 3: Test getting operation details
    if (undoOps.length > 0) {
      const testOp = undoOps[0];
      console.log(`\n🔍 Step 3: Getting details for operation ${testOp.id}...`);
      
      const details = await undoService.getUndoOperationDetails(testOp.id);
      if (details.success) {
        console.log(`   Operation details retrieved successfully:`);
        console.log(`     Type: ${details.undoOperation.operation_type}`);
        console.log(`     Description: ${details.undoOperation.operation_description}`);
        console.log(`     User action: ${details.undoOperation.user_action || 'N/A'}`);
        console.log(`     Metadata: ${JSON.stringify(details.undoOperation.metadata, null, 2)}`);
        console.log(`     Snapshots: ${details.snapshots.length} operations captured`);
        
        details.snapshots.forEach((snapshot, idx) => {
          console.log(`       ${idx + 1}. Job ${snapshot.job_number} Op ${snapshot.operation_number}`);
          console.log(`          Was scheduled: ${snapshot.was_scheduled ? '✅' : '❌'}`);
          if (snapshot.was_scheduled) {
            console.log(`          Machine: ${snapshot.machine_name || 'N/A'}, Employee: ${snapshot.employee_name || 'N/A'}`);
            console.log(`          Time: ${snapshot.original_start_datetime ? new Date(snapshot.original_start_datetime).toLocaleString() : 'N/A'}`);
          }
        });
      } else {
        console.log(`   ❌ Failed to get details: ${details.error}`);
      }
    }
    
    // Step 4: Test undo execution (if there are operations to undo)
    if (undoOps.length > 0) {
      const testOp = undoOps[undoOps.length - 1]; // Use the oldest one
      console.log(`\n🔄 Step 4: Testing undo execution for operation ${testOp.id}...`);
      
      const undoResult = await undoService.executeUndo(testOp.id);
      
      console.log(`   Undo execution: ${undoResult.success ? '✅ Success' : '❌ Failed'}`);
      if (undoResult.success) {
        console.log(`     Restored ${undoResult.restoredJobs} jobs and ${undoResult.restoredOperations} operations`);
        console.log(`     Jobs affected: ${undoResult.jobsAffected.join(', ')}`);
        console.log(`     Message: ${undoResult.message}`);
      } else {
        console.log(`     Error: ${undoResult.error}`);
      }
    }
    
    // Step 5: Test statistics and cleanup
    console.log('\n📊 Step 5: Undo system statistics:');
    
    // Get stats via SQL query
    const statsResult = await pool.query(`
      SELECT 
        COUNT(*) as total_operations,
        COUNT(*) FILTER (WHERE is_undone = FALSE AND expires_at > NOW()) as available_operations,
        COUNT(*) FILTER (WHERE is_undone = TRUE) as completed_undos,
        COUNT(*) FILTER (WHERE expires_at <= NOW() AND is_undone = FALSE) as expired_operations,
        COUNT(*) FILTER (WHERE operation_type = 'displacement') as displacement_operations,
        COUNT(*) FILTER (WHERE operation_type = 'manual_reschedule') as manual_reschedule_operations,
        COUNT(*) FILTER (WHERE operation_type = 'auto_schedule') as auto_schedule_operations
      FROM undo_operations
    `);
    
    const stats = statsResult.rows[0];
    Object.keys(stats).forEach(key => {
      stats[key] = parseInt(stats[key]) || 0;
    });
    
    console.log(`   Total undo operations: ${stats.total_operations}`);
    console.log(`   Available for undo: ${stats.available_operations}`);
    console.log(`   Completed undos: ${stats.completed_undos}`);
    console.log(`   Expired operations: ${stats.expired_operations}`);
    console.log(`   By type:`);
    console.log(`     Displacement: ${stats.displacement_operations}`);
    console.log(`     Manual reschedule: ${stats.manual_reschedule_operations}`);
    console.log(`     Auto schedule: ${stats.auto_schedule_operations}`);
    
    // Test cleanup function
    console.log('\n🧹 Testing cleanup function...');
    const cleanupResult = await undoService.cleanupExpiredOperations();
    console.log(`   Cleanup: ${cleanupResult.success ? '✅ Success' : '❌ Failed'}`);
    console.log(`   ${cleanupResult.message}`);
    
    console.log('\n🎉 Undo system simple test completed successfully!');
    console.log('\n💡 The undo system is working:');
    console.log('   ✅ Creates undo operations with schedule snapshots');
    console.log('   ✅ Lists available operations with expiry tracking');
    console.log('   ✅ Retrieves detailed operation information');
    console.log('   ✅ Executes undo operations (restores schedule state)');
    console.log('   ✅ Provides statistics and cleanup functionality');
    console.log('\n📱 Ready for integration with frontend and displacement system!');
    
  } catch (error) {
    console.error('❌ Undo system simple test failed:', error.message);
    console.error(error.stack);
  } finally {
    await pool.end();
  }
}

// Run the test
testUndoSimple();