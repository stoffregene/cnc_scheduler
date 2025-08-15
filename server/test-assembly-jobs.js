const { Pool } = require('pg');
require('dotenv').config();

async function testAssemblyJobs() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL
  });

  try {
    console.log('🔧 Testing Assembly Job System\n');
    
    // Create test assembly jobs
    console.log('1. Creating test assembly jobs...');
    console.log('='.repeat(80));
    
    // Create parent assembly job
    const parentResult = await pool.query(`
      INSERT INTO jobs (
        job_number, part_name, quantity, job_type, is_assembly_parent,
        customer_name, due_date, priority
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (job_number) DO UPDATE SET
        job_type = EXCLUDED.job_type,
        is_assembly_parent = EXCLUDED.is_assembly_parent,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `, ['12345', 'Test Assembly Unit', 1, 'assembly_parent', true, 'Test Customer', '2025-08-20', 3]);
    
    const parentJob = parentResult.rows[0];
    console.log(`✅ Created parent assembly: ${parentJob.job_number} (ID: ${parentJob.id})`);
    
    // Create component jobs
    const component1Result = await pool.query(`
      INSERT INTO jobs (
        job_number, part_name, quantity, job_type, parent_job_id, assembly_sequence,
        customer_name, due_date, priority
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (job_number) DO UPDATE SET
        job_type = EXCLUDED.job_type,
        parent_job_id = EXCLUDED.parent_job_id,
        assembly_sequence = EXCLUDED.assembly_sequence,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `, ['12345-1', 'Component 1', 1, 'assembly_component', parentJob.id, 1, 'Test Customer', '2025-08-18', 3]);
    
    const component2Result = await pool.query(`
      INSERT INTO jobs (
        job_number, part_name, quantity, job_type, parent_job_id, assembly_sequence,
        customer_name, due_date, priority
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (job_number) DO UPDATE SET
        job_type = EXCLUDED.job_type,
        parent_job_id = EXCLUDED.parent_job_id,
        assembly_sequence = EXCLUDED.assembly_sequence,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `, ['12345-2', 'Component 2', 1, 'assembly_component', parentJob.id, 2, 'Test Customer', '2025-08-19', 3]);
    
    const component1 = component1Result.rows[0];
    const component2 = component2Result.rows[0];
    
    console.log(`✅ Created component 1: ${component1.job_number} (ID: ${component1.id})`);
    console.log(`✅ Created component 2: ${component2.job_number} (ID: ${component2.id})`);
    
    // Create dependencies
    await pool.query(`
      INSERT INTO job_dependencies (dependent_job_id, prerequisite_job_id, dependency_type)
      VALUES ($1, $2, 'assembly'), ($1, $3, 'assembly')
      ON CONFLICT (dependent_job_id, prerequisite_job_id) DO NOTHING
    `, [parentJob.id, component1.id, component2.id]);
    
    console.log('✅ Created assembly dependencies');
    
    // Test dependency checking
    console.log('\n2. Testing dependency validation...');
    console.log('='.repeat(80));
    
    // Check if parent can be scheduled (should be false - components not complete)
    const canScheduleParent = await pool.query(`
      SELECT * FROM can_job_be_scheduled($1)
    `, [parentJob.id]);
    
    const parentCheck = canScheduleParent.rows[0];
    console.log(`Parent Assembly (${parentJob.job_number}):`);
    console.log(`  Can Schedule: ${parentCheck.can_schedule}`);
    console.log(`  Blocking Jobs: ${parentCheck.blocking_job_numbers || 'None'}`);
    
    // Check components (should be true - no dependencies)
    const canScheduleComp1 = await pool.query(`
      SELECT * FROM can_job_be_scheduled($1)
    `, [component1.id]);
    
    const comp1Check = canScheduleComp1.rows[0];
    console.log(`Component 1 (${component1.job_number}):`);
    console.log(`  Can Schedule: ${comp1Check.can_schedule}`);
    console.log(`  Blocking Jobs: ${comp1Check.blocking_job_numbers || 'None'}`);
    
    // Test assembly view
    console.log('\n3. Testing assembly view...');
    console.log('='.repeat(80));
    
    const assemblyView = await pool.query(`
      SELECT * FROM assembly_jobs_view WHERE assembly_job_number = $1
    `, [parentJob.job_number]);
    
    if (assemblyView.rows.length > 0) {
      const assembly = assemblyView.rows[0];
      console.log(`Assembly: ${assembly.assembly_job_number}`);
      console.log(`  Status: ${assembly.assembly_status}`);
      console.log(`  Total Components: ${assembly.total_components}`);
      console.log(`  Completed Components: ${assembly.completed_components}`);
      console.log(`  Completion %: ${assembly.completion_percentage}%`);
      console.log(`  Ready for Assembly: ${assembly.ready_for_assembly}`);
      console.log(`  Component Details:`);
      
      assembly.component_jobs.forEach(comp => {
        console.log(`    ${comp.job_number}: ${comp.status} (sequence: ${comp.assembly_sequence})`);
      });
    }
    
    // Simulate completing component 1
    console.log('\n4. Simulating component completion...');
    console.log('='.repeat(80));
    
    await pool.query(`
      UPDATE jobs SET status = 'completed' WHERE id = $1
    `, [component1.id]);
    
    console.log(`✅ Marked ${component1.job_number} as completed`);
    
    // Check assembly status again
    const updatedAssemblyView = await pool.query(`
      SELECT * FROM assembly_jobs_view WHERE assembly_job_number = $1
    `, [parentJob.job_number]);
    
    if (updatedAssemblyView.rows.length > 0) {
      const assembly = updatedAssemblyView.rows[0];
      console.log(`Updated Assembly Status:`);
      console.log(`  Completed Components: ${assembly.completed_components}/${assembly.total_components}`);
      console.log(`  Completion %: ${assembly.completion_percentage}%`);
      console.log(`  Ready for Assembly: ${assembly.ready_for_assembly}`);
    }
    
    // Complete second component and check if parent can now be scheduled
    await pool.query(`
      UPDATE jobs SET status = 'completed' WHERE id = $1
    `, [component2.id]);
    
    console.log(`✅ Marked ${component2.job_number} as completed`);
    
    const finalParentCheck = await pool.query(`
      SELECT * FROM can_job_be_scheduled($1)
    `, [parentJob.id]);
    
    const finalCheck = finalParentCheck.rows[0];
    console.log(`\nFinal Parent Assembly Check:`);
    console.log(`  Can Schedule: ${finalCheck.can_schedule}`);
    console.log(`  Blocking Jobs: ${finalCheck.blocking_job_numbers || 'None'}`);
    
    // Test dependency tree
    console.log('\n5. Testing dependency tree...');
    console.log('='.repeat(80));
    
    const dependencyTree = await pool.query(`
      SELECT * FROM get_job_dependency_tree($1)
    `, [parentJob.id]);
    
    console.log('Dependency Tree:');
    dependencyTree.rows.forEach(node => {
      const indent = '  '.repeat(node.dependency_level);
      console.log(`${indent}${node.job_number} (${node.job_type}) - Status: ${node.status}`);
    });
    
    console.log('\n🎉 Assembly job system test completed successfully!');
    
  } catch (error) {
    console.error('❌ Error testing assembly jobs:', error.message);
    console.error('Error details:', error.stack);
  } finally {
    await pool.end();
  }
}

testAssemblyJobs();