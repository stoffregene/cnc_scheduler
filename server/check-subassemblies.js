const { Pool } = require('pg');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function checkSubassemblies() {
  try {
    console.log('🔍 Checking for subassembly patterns in job numbers...\n');
    
    // Look for jobs with dash followed by number (subassembly pattern)
    const subassemblyResult = await pool.query(`
      SELECT job_number, customer_name, part_name, status,
             COUNT(jr.id) as total_operations,
             COUNT(CASE WHEN jr.routing_status = 'C' THEN 1 END) as completed_operations
      FROM jobs j
      LEFT JOIN job_routings jr ON j.id = jr.job_id
      WHERE j.job_number ~ '-\\d+$'  -- Regex for jobs ending with dash and number(s)
      GROUP BY j.id, j.job_number, j.customer_name, j.part_name, j.status
      ORDER BY j.job_number
    `);
    
    console.log(`Found ${subassemblyResult.rows.length} potential subassemblies:`);
    subassemblyResult.rows.forEach(job => {
      const isCompleted = job.completed_operations === job.total_operations && job.total_operations > 0;
      console.log(`  ${job.job_number}: ${job.customer_name} - ${job.part_name} ${isCompleted ? '✅ COMPLETED' : ''}`);
    });
    
    // Check for parent-child relationships
    console.log('\n🔍 Looking for parent jobs for subassemblies...\n');
    
    const parentChildResult = await pool.query(`
      WITH potential_subassemblies AS (
        SELECT job_number, id
        FROM jobs 
        WHERE job_number ~ '-\\d+$'
      ),
      potential_parents AS (
        SELECT ps.job_number as subassembly_number,
               ps.id as subassembly_id,
               regexp_replace(ps.job_number, '-\\d+$', '') as parent_number
        FROM potential_subassemblies ps
      )
      SELECT pp.subassembly_number,
             pp.parent_number,
             j.id as parent_id,
             j.customer_name as parent_customer,
             j.part_name as parent_part,
             j.status as parent_status
      FROM potential_parents pp
      LEFT JOIN jobs j ON j.job_number = pp.parent_number
      ORDER BY pp.parent_number, pp.subassembly_number
    `);
    
    console.log('Parent-Child relationships:');
    parentChildResult.rows.forEach(rel => {
      if (rel.parent_id) {
        console.log(`  Parent: ${rel.parent_number} (${rel.parent_customer})`);
        console.log(`    └─ Subassembly: ${rel.subassembly_number}`);
      } else {
        console.log(`  ❌ Orphaned subassembly: ${rel.subassembly_number} (no parent ${rel.parent_number} found)`);
      }
    });
    
    // Check if any completed subassemblies are in current awaiting shipping
    console.log('\n🔍 Completed subassemblies currently in awaiting shipping:\n');
    
    const shippingSubassemblies = await pool.query(`
      WITH job_operation_status AS (
        SELECT 
          j.id as job_id,
          j.job_number,
          j.customer_name,
          j.part_name,
          j.status as job_status,
          COUNT(jr.id) as total_operations,
          COUNT(CASE WHEN jr.routing_status = 'C' THEN 1 END) as completed_operations,
          (COUNT(jr.id) = COUNT(CASE WHEN jr.routing_status = 'C' THEN 1 END)) as all_operations_completed
        FROM jobs j
        LEFT JOIN job_routings jr ON j.id = jr.job_id
        WHERE j.status IN ('active', 'scheduled', 'in_progress', 'pending')
        AND j.job_number ~ '-\\d+$'  -- Only subassemblies
        GROUP BY j.id, j.job_number, j.customer_name, j.part_name, j.status
        HAVING COUNT(jr.id) > 0
      )
      SELECT job_number, customer_name, part_name, total_operations, completed_operations
      FROM job_operation_status
      WHERE all_operations_completed = true
      ORDER BY job_number
    `);
    
    if (shippingSubassemblies.rows.length > 0) {
      console.log('❌ These subassemblies should NOT be in awaiting shipping:');
      shippingSubassemblies.rows.forEach(sub => {
        console.log(`  ${sub.job_number}: ${sub.customer_name} - ${sub.part_name} [${sub.completed_operations}/${sub.total_operations} ops]`);
      });
    } else {
      console.log('✅ No subassemblies currently in awaiting shipping');
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

checkSubassemblies();