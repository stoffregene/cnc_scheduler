const express = require('express');
const { Pool } = require('pg');

const app = express();
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/scheduler'
});

async function debugJob57710() {
  try {
    console.log('=== DEBUGGING JOB 57710 SEQUENCE ORDER ===');
    
    // First, find the job
    const jobResult = await pool.query(`
      SELECT id, job_number FROM jobs WHERE job_number = '57710'
    `);
    
    if (jobResult.rows.length === 0) {
      console.log('Job 57710 not found');
      return;
    }
    
    const jobId = jobResult.rows[0].id;
    console.log(`Job ID: ${jobId}`);
    
    // Get the routing data exactly as the API endpoint does
    const result = await pool.query(`
      SELECT 
        jr.id, jr.operation_number, jr.operation_name, jr.machine_id,
        jr.machine_group_id, jr.sequence_order, jr.estimated_hours, jr.notes, jr.routing_status,
        m.name as machine_name, m.model as machine_model,
        ss.id as schedule_slot_id, ss.start_datetime, ss.end_datetime, 
        ss.machine_id as scheduled_machine_id, ss.employee_id as scheduled_employee_id,
        sm.name as scheduled_machine_name, sm.model as scheduled_machine_model,
        e.first_name || ' ' || e.last_name as scheduled_employee_name,
        ss.status as schedule_status, ss.duration_minutes, ss.locked as slot_locked
      FROM job_routings jr
      LEFT JOIN machines m ON jr.machine_id = m.id
      LEFT JOIN schedule_slots ss ON jr.id = ss.job_routing_id
      LEFT JOIN machines sm ON ss.machine_id = sm.id
      LEFT JOIN employees e ON ss.employee_id = e.id
      WHERE jr.job_id = $1
      ORDER BY jr.sequence_order, jr.operation_number
    `, [jobId]);
    
    console.log('\n=== RAW DATABASE RESULTS (ordered by sequence_order, operation_number) ===');
    result.rows.forEach((row, index) => {
      console.log(`${index + 1}. Op ${row.operation_number}: ${row.operation_name} | Machine: ${row.machine_name || 'None'} | Sequence: ${row.sequence_order} (type: ${typeof row.sequence_order})`);
    });
    
    console.log('\n=== WHAT FRONTEND RECEIVES (simulating API response) ===');
    const apiResponse = result.rows;
    console.log('Array order after backend query:');
    apiResponse.forEach((row, index) => {
      console.log(`${index + 1}. Op ${row.operation_number}: ${row.operation_name} | Sequence: ${row.sequence_order}`);
    });
    
    // Check if there are NULL sequence_order values
    const nullSequences = result.rows.filter(row => row.sequence_order === null || row.sequence_order === undefined);
    if (nullSequences.length > 0) {
      console.log('\n=== WARNING: NULL SEQUENCE VALUES FOUND ===');
      nullSequences.forEach(row => {
        console.log(`Op ${row.operation_number}: ${row.operation_name} has NULL sequence_order`);
      });
    }
    
    // Check for duplicate sequence_order values
    const sequenceMap = new Map();
    result.rows.forEach(row => {
      if (sequenceMap.has(row.sequence_order)) {
        sequenceMap.get(row.sequence_order).push(row.operation_number);
      } else {
        sequenceMap.set(row.sequence_order, [row.operation_number]);
      }
    });
    
    console.log('\n=== SEQUENCE ORDER DISTRIBUTION ===');
    for (const [sequence, operations] of sequenceMap.entries()) {
      if (operations.length > 1) {
        console.log(`⚠️  Sequence ${sequence}: Operations ${operations.join(', ')} (DUPLICATE!)`);
      } else {
        console.log(`✅ Sequence ${sequence}: Operation ${operations[0]}`);
      }
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

debugJob57710();