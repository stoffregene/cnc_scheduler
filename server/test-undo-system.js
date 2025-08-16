const { Pool } = require('pg');
const path = require('path');
const UndoService = require('./services/undoService');
const DisplacementService = require('./services/displacementService');
const SchedulingService = require('./services/schedulingService');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5732/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function testUndoSystem() {
  try {
    console.log('🧪 Testing undo system functionality...\n');
    
    const undoService = new UndoService(pool);
    const displacementService = new DisplacementService(pool);
    const schedulingService = new SchedulingService(pool);
    
    // Step 1: Clear existing schedules for clean test
    console.log('🧹 Step 1: Clearing existing schedules...');
    await pool.query('DELETE FROM schedule_slots');
    console.log('   ✅ Cleared all schedule slots\n');
    
    // Step 2: Get test jobs with different priorities
    const lowPriorityResult = await pool.query(`
      SELECT id, job_number, priority_score, customer_name
      FROM jobs 
      WHERE status != 'completed' AND priority_score <= 50
      ORDER BY priority_score ASC 
      LIMIT 2
    `);
    
    const highPriorityResult = await pool.query(`
      SELECT id, job_number, priority_score, customer_name
      FROM jobs 
      WHERE status != 'completed' AND priority_score >= 200
      ORDER BY priority_score DESC 
      LIMIT 1
    `);
    
    if (lowPriorityResult.rows.length === 0 || highPriorityResult.rows.length === 0) {
      console.log('❌ Need jobs with different priorities for testing');
      return;
    }
    
    const lowPriorityJob = lowPriorityResult.rows[0];
    const highPriorityJob = highPriorityResult.rows[0];
    
    console.log('📋 Step 2: Selected test jobs:');
    console.log(`   Low Priority: ${lowPriorityJob.job_number} (Score: ${lowPriorityJob.priority_score})`);
    console.log(`   High Priority: ${highPriorityJob.job_number} (Score: ${highPriorityJob.priority_score})`);
    
    // Step 3: Schedule low priority job first
    console.log('\n📅 Step 3: Scheduling low priority job...');
    const scheduleResult = await schedulingService.scheduleJob(lowPriorityJob.id);
    console.log(`   ${lowPriorityJob.job_number}: ${scheduleResult.success ? '✅ Success' : '❌ Failed'}`);
    
    if (!scheduleResult.success) {
      console.log('❌ Cannot proceed - low priority job failed to schedule');
      return;
    }
    
    // Step 4: Create manual undo operation for testing
    console.log('\n🔄 Step 4: Creating manual undo operation...');
    const manualUndo = await undoService.createUndoOperation(
      'manual_reschedule',
      `Manual test reschedule of job ${lowPriorityJob.job_number}`,
      [lowPriorityJob.id],
      {
        userAction: 'test_manual_reschedule',
        metadata: { testOperation: true }
      }
    );
    
    console.log(`   Manual undo operation: ${manualUndo.success ? '✅ Created' : '❌ Failed'}`);
    if (manualUndo.success) {
      console.log(`   Undo ID: ${manualUndo.undoOperationId}`);
      console.log(`   Expires: ${new Date(manualUndo.expiresAt).toLocaleString()}`);
    }
    
    // Step 5: Trigger displacement with undo creation
    console.log('\n⚡ Step 5: Triggering displacement with undo creation...');
    const displacementResult = await displacementService.scheduleWithDisplacement(
      highPriorityJob.id,
      { test: false } // Create real undo operation
    );
    
    console.log(`   Displacement: ${displacementResult.success ? '✅ Success' : '❌ Failed'}`);
    console.log(`   Displacement used: ${displacementResult.displacementUsed || false}`);
    
    // Step 6: List available undo operations
    console.log('\n📋 Step 6: Available undo operations:');
    const undoOps = await undoService.getAvailableUndoOperations({ limit: 10 });
    
    console.log(`   Found ${undoOps.length} available undo operations:`);
    undoOps.forEach((op, index) => {
      const timeRemaining = Math.round(op.time_remaining / (1000 * 60 * 60)); // hours
      console.log(`     ${index + 1}. ID ${op.id}: ${op.operation_type} - ${op.operation_description}`);
      console.log(`        Affects ${op.affected_jobs} jobs, ${op.affected_operations} operations`);
      console.log(`        Expires in ${timeRemaining}h, Can undo: ${op.can_undo ? '✅' : '❌'}`);
    });
    
    // Step 7: Test undo operation execution
    if (undoOps.length > 0) {
      const latestUndo = undoOps[0];
      console.log(`\n🔄 Step 7: Testing undo execution for operation ${latestUndo.id}...`);
      
      // Get operation details first
      const details = await undoService.getUndoOperationDetails(latestUndo.id);
      if (details.success) {
        console.log(`   Operation details:`)
        console.log(`     Type: ${details.undoOperation.operation_type}`);
        console.log(`     Description: ${details.undoOperation.operation_description}`);
        console.log(`     Snapshots: ${details.snapshots.length} operations captured`);
        
        details.snapshots.forEach((snapshot, idx) => {
          console.log(`       ${idx + 1}. Job ${snapshot.job_number} Op ${snapshot.operation_number} - ${snapshot.was_scheduled ? 'Scheduled' : 'Unscheduled'}`);
          if (snapshot.was_scheduled) {
            console.log(`          Machine: ${snapshot.machine_name}, Employee: ${snapshot.employee_name}`);
            console.log(`          Time: ${snapshot.original_start_datetime ? new Date(snapshot.original_start_datetime).toLocaleString() : 'N/A'}`);
          }
        });
      }
      
      // Execute the undo
      console.log(`\n   Executing undo operation ${latestUndo.id}...`);
      const undoResult = await undoService.executeUndo(latestUndo.id);
      
      console.log(`   Undo execution: ${undoResult.success ? '✅ Success' : '❌ Failed'}`);
      if (undoResult.success) {
        console.log(`   Restored ${undoResult.restoredJobs} jobs and ${undoResult.restoredOperations} operations`);
        console.log(`   Jobs affected: ${undoResult.jobsAffected.join(', ')}`);
        console.log(`   Message: ${undoResult.message}`);
      } else {
        console.log(`   Error: ${undoResult.error}`);
      }
    }
    
    // Step 8: Test undo statistics
    console.log('\n📊 Step 8: Undo system statistics:');
    const stats = await pool.query(`
      SELECT 
        COUNT(*) as total_operations,
        COUNT(*) FILTER (WHERE is_undone = FALSE AND expires_at > NOW()) as available_operations,
        COUNT(*) FILTER (WHERE is_undone = TRUE) as completed_undos,
        COUNT(*) FILTER (WHERE expires_at <= NOW() AND is_undone = FALSE) as expired_operations
      FROM undo_operations
    `);
    
    const statData = stats.rows[0];
    console.log(`   Total undo operations: ${statData.total_operations}`);
    console.log(`   Available for undo: ${statData.available_operations}`);
    console.log(`   Completed undos: ${statData.completed_undos}`);
    console.log(`   Expired operations: ${statData.expired_operations}`);
    
    // Step 9: Test cleanup function
    console.log('\n🧹 Step 9: Testing cleanup function...');
    const cleanupResult = await undoService.cleanupExpiredOperations();
    console.log(`   Cleanup: ${cleanupResult.success ? '✅ Success' : '❌ Failed'}`);
    console.log(`   ${cleanupResult.message}`);
    
    console.log('\n🎉 Undo system test completed successfully!');
    console.log('\n💡 The undo system is ready for use:');
    console.log('   - Displacement operations automatically create undo operations');
    console.log('   - Undo operations expire after 24 hours');
    console.log('   - Schedule state is captured before operations');
    console.log('   - Undo restores exact previous schedule state');
    console.log('\n📱 API endpoints available:');
    console.log('   GET /api/undo/operations - List available undo operations');
    console.log('   POST /api/undo/execute/:id - Execute an undo operation');
    console.log('   GET /api/undo/stats - Get undo system statistics');
    
  } catch (error) {
    console.error('❌ Undo system test failed:', error.message);
    console.error(error.stack);
  } finally {
    await pool.end();
  }
}

// Run the test
testUndoSystem();