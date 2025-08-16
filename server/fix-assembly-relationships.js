const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function fixAssemblyRelationships() {
  try {
    console.log('=== FIXING ASSEMBLY RELATIONSHIPS ===\n');
    
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Step 1: Fix job types and relationships
      console.log('1. Updating job types and relationships...');
      
      // Update parent job (12345)
      await client.query(`
        UPDATE jobs 
        SET job_type = 'assembly_parent',
            is_assembly_parent = true,
            updated_at = CURRENT_TIMESTAMP
        WHERE job_number = '12345'
      `);
      console.log('   ✅ Updated 12345 as assembly parent');
      
      // Update child job (12345-1)
      const parentResult = await client.query('SELECT id FROM jobs WHERE job_number = $1', ['12345']);
      const parentId = parentResult.rows[0].id;
      
      await client.query(`
        UPDATE jobs 
        SET job_type = 'assembly_component',
            parent_job_id = $1,
            assembly_sequence = 1,
            updated_at = CURRENT_TIMESTAMP
        WHERE job_number = '12345-1'
      `, [parentId]);
      console.log('   ✅ Updated 12345-1 as assembly component');
      
      // Step 2: Create dependency relationship
      console.log('\\n2. Creating assembly dependency...');
      
      const childResult = await client.query('SELECT id FROM jobs WHERE job_number = $1', ['12345-1']);
      const childId = childResult.rows[0].id;
      
      // Delete any existing dependencies first
      await client.query(`
        DELETE FROM job_dependencies 
        WHERE prerequisite_job_id IN ($1, $2) OR dependent_job_id IN ($1, $2)
      `, [parentId, childId]);
      
      // Create the correct dependency: child must complete before parent
      await client.query(`
        INSERT INTO job_dependencies (dependent_job_id, prerequisite_job_id, dependency_type)
        VALUES ($1, $2, 'assembly')
        ON CONFLICT (dependent_job_id, prerequisite_job_id) DO NOTHING
      `, [parentId, childId]); // Parent depends on child
      
      console.log('   ✅ Created dependency: 12345-1 → 12345 (child must finish before parent)');
      
      // Step 3: Reschedule the parent job to respect the dependency
      console.log('\\n3. Fixing schedule conflicts...');
      
      // Get the child job's latest end time
      const childSchedule = await client.query(`
        SELECT MAX(ss.end_datetime) as latest_end
        FROM jobs j
        INNER JOIN job_routings jr ON j.id = jr.job_id
        INNER JOIN schedule_slots ss ON jr.id = ss.job_routing_id
        WHERE j.job_number = '12345-1'
      `);
      
      if (childSchedule.rows[0].latest_end) {
        const childEndTime = new Date(childSchedule.rows[0].latest_end);
        console.log(`   Child job (12345-1) finishes at: ${childEndTime.toLocaleString()}`);
        
        // Clear parent job schedule
        await client.query(`
          DELETE FROM schedule_slots 
          WHERE job_routing_id IN (
            SELECT jr.id 
            FROM job_routings jr 
            INNER JOIN jobs j ON jr.job_id = j.id 
            WHERE j.job_number = '12345'
          )
        `);
        console.log('   ✅ Cleared parent job (12345) schedule');
        
        // The parent will need to be rescheduled through the UI or API
        console.log('   📅 Parent job needs to be rescheduled after child completion');
      }
      
      await client.query('COMMIT');
      
      // Step 4: Verify the fix
      console.log('\\n=== VERIFICATION ===');
      
      const verification = await pool.query(`
        SELECT 
          j.job_number,
          j.job_type,
          j.is_assembly_parent,
          j.parent_job_id,
          j.assembly_sequence,
          pj.job_number as parent_job_number
        FROM jobs j
        LEFT JOIN jobs pj ON j.parent_job_id = pj.id
        WHERE j.job_number IN ('12345', '12345-1')
        ORDER BY j.job_number
      `);
      
      verification.rows.forEach(job => {
        console.log(`${job.job_number}: ${job.job_type} (parent: ${job.parent_job_number || 'none'})`);
      });
      
      const depCheck = await pool.query(`
        SELECT 
          p.job_number as prerequisite,
          d.job_number as dependent,
          jd.dependency_type
        FROM job_dependencies jd
        INNER JOIN jobs p ON jd.prerequisite_job_id = p.id
        INNER JOIN jobs d ON jd.dependent_job_id = d.id
        WHERE p.job_number IN ('12345', '12345-1') OR d.job_number IN ('12345', '12345-1')
      `);
      
      if (depCheck.rows.length > 0) {
        console.log('\\nDependencies:');
        depCheck.rows.forEach(dep => {
          console.log(`  ${dep.prerequisite} → ${dep.dependent} (${dep.dependency_type})`);
        });
      }
      
      console.log('\\n✅ Assembly relationships fixed successfully!');
      console.log('\\n📋 NEXT STEPS:');
      console.log('   1. Go to Scheduling page');
      console.log('   2. Select job 12345 (parent assembly)');
      console.log('   3. Click "Schedule Job" - it will now respect the dependency');
      console.log('   4. The scheduler will ensure 12345 starts AFTER 12345-1 is complete');
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

fixAssemblyRelationships();