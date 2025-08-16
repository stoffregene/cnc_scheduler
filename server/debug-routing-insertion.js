const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function debugRoutingInsertion() {
  try {
    console.log('=== DEBUGGING ROUTING INSERTION ISSUE ===\n');
    
    // Check if there are any operations with sequence_order = 0
    const seq0Check = await pool.query(`
      SELECT 
        j.job_number,
        jr.operation_number,
        jr.operation_name,
        jr.sequence_order,
        jr.machine_id,
        jr.machine_group_id,
        jr.routing_status
      FROM job_routings jr
      JOIN jobs j ON jr.job_id = j.id
      WHERE jr.sequence_order = 0
      ORDER BY j.job_number
    `);
    
    console.log(`Operations with sequence_order = 0: ${seq0Check.rows.length}`);
    if (seq0Check.rows.length > 0) {
      seq0Check.rows.forEach(row => {
        console.log(`  Job ${row.job_number}: Op ${row.operation_number} - ${row.operation_name} (seq: ${row.sequence_order})`);
      });
    } else {
      console.log('❌ NO operations with sequence 0 found!');
    }
    
    // Check what the minimum sequence_order is across all jobs
    const minSeqCheck = await pool.query(`
      SELECT 
        j.job_number,
        MIN(jr.sequence_order) as min_seq,
        MAX(jr.sequence_order) as max_seq,
        COUNT(jr.id) as op_count,
        ARRAY_AGG(jr.operation_name ORDER BY jr.sequence_order) as operations
      FROM job_routings jr
      JOIN jobs j ON jr.job_id = j.id
      GROUP BY j.job_number
      HAVING MIN(jr.sequence_order) != 1
      ORDER BY MIN(jr.sequence_order), j.job_number
    `);
    
    console.log('\nJobs that don\'t start with sequence 1:');
    if (minSeqCheck.rows.length > 0) {
      minSeqCheck.rows.forEach(row => {
        console.log(`  Job ${row.job_number}: sequences ${row.min_seq}-${row.max_seq} (${row.op_count} ops)`);
        console.log(`    Operations: ${row.operations.join(' → ')}`);
      });
    } else {
      console.log('❌ ALL jobs start with sequence 1 - sequence 0 operations are definitely missing!');
    }
    
    // Check if there's a database constraint or trigger causing the issue
    console.log('\n=== CHECKING DATABASE CONSTRAINTS ===\n');
    
    const constraintCheck = await pool.query(`
      SELECT 
        tc.constraint_name,
        tc.constraint_type,
        kcu.column_name,
        cc.check_clause
      FROM information_schema.table_constraints tc
      LEFT JOIN information_schema.key_column_usage kcu 
        ON tc.constraint_name = kcu.constraint_name
      LEFT JOIN information_schema.check_constraints cc
        ON tc.constraint_name = cc.constraint_name
      WHERE tc.table_name = 'job_routings'
        AND (kcu.column_name = 'sequence_order' OR cc.check_clause LIKE '%sequence%')
      ORDER BY tc.constraint_type, tc.constraint_name
    `);
    
    if (constraintCheck.rows.length > 0) {
      console.log('Constraints on sequence_order:');
      constraintCheck.rows.forEach(constraint => {
        console.log(`  ${constraint.constraint_type}: ${constraint.constraint_name}`);
        if (constraint.check_clause) {
          console.log(`    Check: ${constraint.check_clause}`);
        }
      });
    } else {
      console.log('No constraints found on sequence_order column');
    }
    
    // Let's check if the issue is in the job_routings table structure
    console.log('\n=== CHECKING JOB_ROUTINGS TABLE STRUCTURE ===\n');
    
    const tableStructure = await pool.query(`
      SELECT 
        column_name,
        data_type,
        is_nullable,
        column_default
      FROM information_schema.columns
      WHERE table_name = 'job_routings'
      ORDER BY ordinal_position
    `);
    
    console.log('job_routings table structure:');
    tableStructure.rows.forEach(col => {
      console.log(`  ${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable}, default: ${col.column_default || 'none'})`);
    });
    
    // Check if there's any specific filtering happening for sequence 0
    console.log('\n=== MANUAL TEST: INSERT SEQUENCE 0 ===\n');
    
    try {
      // Try to manually insert a sequence 0 operation to see if it's allowed
      const testJobId = await pool.query(`SELECT id FROM jobs WHERE job_number = '60243'`);
      
      if (testJobId.rows.length > 0) {
        const jobId = testJobId.rows[0].id;
        console.log(`Attempting to insert sequence 0 operation for job 60243 (id: ${jobId})...`);
        
        const insertResult = await pool.query(`
          INSERT INTO job_routings (
            job_id, operation_number, operation_name, sequence_order, 
            estimated_hours, routing_status, machine_id, machine_group_id
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING id, sequence_order, operation_name
        `, [jobId, '0', 'SAW', 0, 2.5, 'O', null, null]);
        
        console.log('✅ Successfully inserted sequence 0 operation!');
        console.log(`   ID: ${insertResult.rows[0].id}, Operation: ${insertResult.rows[0].operation_name}`);
        
        // Clean up the test insert
        await pool.query('DELETE FROM job_routings WHERE id = $1', [insertResult.rows[0].id]);
        console.log('   Test operation cleaned up');
        
      } else {
        console.log('❌ Job 60243 not found for test');
      }
      
    } catch (insertError) {
      console.log('❌ Failed to insert sequence 0 operation:');
      console.log(`   Error: ${insertError.message}`);
    }
    
    console.log('\n=== CONCLUSION ===');
    console.log('The issue is likely in the CSV parsing or import process, NOT the database.');
    console.log('The database can accept sequence 0 operations, but they\'re not making it through the import.');
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
    process.exit();
  }
}

debugRoutingInsertion();