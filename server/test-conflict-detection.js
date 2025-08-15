const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const ConflictDetectionService = require('./services/conflictDetectionService');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5732/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function testConflictDetection() {
  try {
    console.log('🔍 Testing Conflict Detection System...\n');

    const conflictDetection = new ConflictDetectionService(pool);
    
    // Test conflict detection
    console.log('Running comprehensive conflict detection...');
    const startTime = Date.now();
    
    const conflictResult = await conflictDetection.detectAllConflicts({
      startDate: new Date('2025-08-11'),
      endDate: new Date('2025-08-20'),
      includeResolved: false
    });
    
    const endTime = Date.now();
    console.log(`Detection completed in ${endTime - startTime}ms\n`);
    
    // Display results
    console.log('📊 CONFLICT DETECTION RESULTS:\n');
    console.log('='.repeat(50));
    
    console.log(`Total conflicts found: ${conflictResult.summary.total_conflicts}`);
    console.log('');
    
    // Show breakdown by type
    console.log('🔧 Conflicts by Type:');
    Object.entries(conflictResult.summary.by_type).forEach(([type, count]) => {
      if (count > 0) {
        console.log(`  ${type}: ${count}`);
      }
    });
    console.log('');
    
    // Show breakdown by severity
    console.log('⚠️  Conflicts by Severity:');
    Object.entries(conflictResult.summary.by_severity).forEach(([severity, count]) => {
      if (count > 0) {
        const icon = severity === 'critical' ? '🔴' : severity === 'high' ? '🟡' : '🟢';
        console.log(`  ${icon} ${severity}: ${count}`);
      }
    });
    console.log('');
    
    // Show most affected resources
    if (Object.keys(conflictResult.summary.most_affected_jobs).length > 0) {
      console.log('📋 Most Affected Jobs:');
      Object.entries(conflictResult.summary.most_affected_jobs)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 5)
        .forEach(([job, count]) => {
          console.log(`  ${job}: ${count} conflicts`);
        });
      console.log('');
    }
    
    if (Object.keys(conflictResult.summary.most_affected_operators).length > 0) {
      console.log('👥 Most Affected Operators:');
      Object.entries(conflictResult.summary.most_affected_operators)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 5)
        .forEach(([operator, count]) => {
          console.log(`  ${operator}: ${count} conflicts`);
        });
      console.log('');
    }
    
    if (Object.keys(conflictResult.summary.most_affected_machines).length > 0) {
      console.log('🏭 Most Affected Machines:');
      Object.entries(conflictResult.summary.most_affected_machines)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 5)
        .forEach(([machine, count]) => {
          console.log(`  ${machine}: ${count} conflicts`);
        });
      console.log('');
    }
    
    // Show detailed examples of each conflict type
    console.log('📝 DETAILED CONFLICT EXAMPLES:\n');
    console.log('='.repeat(50));
    
    Object.entries(conflictResult.conflicts).forEach(([conflictType, conflicts]) => {
      if (conflicts.length > 0) {
        console.log(`\n🔹 ${conflictType.toUpperCase().replace(/_/g, ' ')} (${conflicts.length}):`);
        
        conflicts.slice(0, 3).forEach((conflict, index) => {
          console.log(`\n  Example ${index + 1}:`);
          console.log(`    Severity: ${conflict.severity}`);
          
          if (conflict.job1_number && conflict.job2_number) {
            console.log(`    Jobs: ${conflict.job1_number} vs ${conflict.job2_number}`);
          }
          
          if (conflict.operator_name) {
            console.log(`    Operator: ${conflict.operator_name}`);
          }
          
          if (conflict.machine_name) {
            console.log(`    Machine: ${conflict.machine_name}`);
          }
          
          if (conflict.overlap_minutes) {
            console.log(`    Overlap: ${conflict.overlap_minutes} minutes`);
          }
          
          if (conflict.violation_reason) {
            console.log(`    Reason: ${conflict.violation_reason}`);
          }
          
          if (conflict.overtime_minutes) {
            console.log(`    Overtime: ${conflict.overtime_minutes} minutes`);
          }
        });
        
        if (conflicts.length > 3) {
          console.log(`    ... and ${conflicts.length - 3} more`);
        }
      }
    });
    
    // Test logging conflicts to database
    console.log('\n💾 Logging conflicts to database...');
    const runId = await conflictDetection.logConflicts(conflictResult.conflicts, conflictResult);
    console.log(`✅ Conflicts logged with run ID: ${runId}`);
    
    console.log('\n🎉 Conflict detection test completed successfully!');
    
  } catch (error) {
    console.error('❌ Error testing conflict detection:', error);
  } finally {
    await pool.end();
  }
}

testConflictDetection();