const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function checkAssemblyDependencies() {
  try {
    console.log('=== CHECKING ASSEMBLY DEPENDENCIES ===\n');
    
    // Check if jobs 12345 and 12345-1 exist and their relationships
    const jobsResult = await pool.query(`
      SELECT 
        id,
        job_number,
        part_name,
        job_type,
        is_assembly_parent,
        parent_job_id,
        assembly_sequence,
        status,
        due_date
      FROM jobs 
      WHERE job_number IN ('12345', '12345-1')
      ORDER BY job_number
    `);
    
    console.log('Jobs found:');
    jobsResult.rows.forEach(job => {
      console.log(`  ${job.job_number}: ${job.part_name}`);
      console.log(`    Type: ${job.job_type}, Is Parent: ${job.is_assembly_parent}`);
      console.log(`    Parent Job ID: ${job.parent_job_id}, Assembly Seq: ${job.assembly_sequence}`);
      console.log(`    Status: ${job.status}, Due: ${job.due_date}`);
      console.log('');
    });
    
    // Check job dependencies
    const depsResult = await pool.query(`
      SELECT 
        jd.id,
        jd.dependency_type,
        p.job_number as prerequisite_job,
        d.job_number as dependent_job,
        jd.created_at
      FROM job_dependencies jd
      INNER JOIN jobs p ON jd.prerequisite_job_id = p.id
      INNER JOIN jobs d ON jd.dependent_job_id = d.id
      WHERE p.job_number IN ('12345', '12345-1') 
         OR d.job_number IN ('12345', '12345-1')
      ORDER BY jd.created_at
    `);
    
    console.log('Job Dependencies:');
    if (depsResult.rows.length > 0) {
      depsResult.rows.forEach(dep => {
        console.log(`  ${dep.prerequisite_job} → ${dep.dependent_job} (${dep.dependency_type})`);
      });
    } else {
      console.log('  ❌ NO DEPENDENCIES FOUND - This is the problem!');
    }
    
    // Check schedule slots for these jobs
    const slotsResult = await pool.query(`
      SELECT 
        j.job_number,
        jr.operation_name,
        jr.sequence_order,
        ss.start_datetime,
        ss.end_datetime,
        ss.duration_minutes
      FROM jobs j
      INNER JOIN job_routings jr ON j.id = jr.job_id
      LEFT JOIN schedule_slots ss ON jr.id = ss.job_routing_id
      WHERE j.job_number IN ('12345', '12345-1')
      ORDER BY j.job_number, jr.sequence_order, ss.start_datetime
    `);
    
    console.log('\nScheduled Operations:');
    slotsResult.rows.forEach(slot => {
      const startTime = slot.start_datetime ? new Date(slot.start_datetime).toLocaleString() : 'Not scheduled';
      console.log(`  ${slot.job_number} Op ${slot.sequence_order} (${slot.operation_name}): ${startTime}`);
    });
    
    // Check if assembly relationships should be automatically created
    console.log('\n=== ANALYSIS ===');
    
    const parentJob = jobsResult.rows.find(j => j.job_number === '12345');
    const childJob = jobsResult.rows.find(j => j.job_number === '12345-1');
    
    if (parentJob && childJob) {
      console.log(`\nParent Job (${parentJob.job_number}):`);
      console.log(`  Should be: job_type='assembly_parent', is_assembly_parent=true`);
      console.log(`  Currently: job_type='${parentJob.job_type}', is_assembly_parent=${parentJob.is_assembly_parent}`);
      
      console.log(`\nChild Job (${childJob.job_number}):`);
      console.log(`  Should be: job_type='assembly_component', parent_job_id=${parentJob.id}`);
      console.log(`  Currently: job_type='${childJob.job_type}', parent_job_id=${childJob.parent_job_id}`);
      
      if (depsResult.rows.length === 0) {
        console.log('\n❌ MISSING DEPENDENCY: Child job should complete before parent assembly!');
        console.log(`   Should create: ${childJob.job_number} → ${parentJob.job_number} (assembly dependency)`);
      }
      
      // Show the scheduling problem
      const parentSlots = slotsResult.rows.filter(s => s.job_number === '12345');
      const childSlots = slotsResult.rows.filter(s => s.job_number === '12345-1');
      
      if (parentSlots.length > 0 && childSlots.length > 0) {
        const parentStart = new Date(parentSlots[0].start_datetime);
        const childEnd = new Date(childSlots[childSlots.length - 1].end_datetime || childSlots[childSlots.length - 1].start_datetime);
        
        console.log(`\n📅 SCHEDULING CONFLICT DETECTED:`);
        console.log(`   Parent (${parentJob.job_number}) starts: ${parentStart.toLocaleString()}`);
        console.log(`   Child (${childJob.job_number}) ends: ${childEnd.toLocaleString()}`);
        
        if (parentStart <= childEnd) {
          console.log(`   ❌ PROBLEM: Parent assembly starts before child component is finished!`);
          console.log(`   ✅ SOLUTION: Parent should start AFTER child is completely finished`);
        }
      }
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

checkAssemblyDependencies();