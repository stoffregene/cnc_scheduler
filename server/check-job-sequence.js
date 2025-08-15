const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5732/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function checkJobSequence() {
  try {
    console.log('Checking current schedule sequence for Job 12345...\n');
    
    const result = await pool.query(`
      SELECT 
        s.id,
        j.job_number,
        jr.sequence_order,
        jr.operation_name,
        m.name as machine_name,
        s.start_datetime,
        s.end_datetime,
        e.first_name || ' ' || e.last_name as operator_name,
        EXTRACT(EPOCH FROM (s.end_datetime - s.start_datetime))/60 as duration_minutes
      FROM schedule_slots s
      JOIN jobs j ON s.job_id = j.id
      JOIN job_routings jr ON s.job_routing_id = jr.id
      JOIN machines m ON s.machine_id = m.id
      JOIN employees e ON s.employee_id = e.id
      WHERE j.job_number = '12345'
      ORDER BY jr.sequence_order, s.start_datetime
    `);
    
    console.log('📋 Current Job 12345 Schedule:');
    console.log('='.repeat(70));
    
    let previousEndTime = null;
    result.rows.forEach((slot, index) => {
      const startTime = new Date(slot.start_datetime);
      const endTime = new Date(slot.end_datetime);
      
      console.log(`\n${index + 1}. Sequence ${slot.sequence_order}: ${slot.operation_name}`);
      console.log(`   Machine: ${slot.machine_name}`);
      console.log(`   Operator: ${slot.operator_name}`);
      console.log(`   Start: ${startTime.toISOString()}`);
      console.log(`   End: ${endTime.toISOString()}`);
      console.log(`   Duration: ${slot.duration_minutes} minutes`);
      
      if (previousEndTime) {
        const gap = (startTime.getTime() - previousEndTime.getTime()) / (1000 * 60);
        if (gap >= 0) {
          console.log(`   ✅ Gap after previous: ${gap} minutes`);
        } else {
          console.log(`   ❌ OVERLAP with previous: ${Math.abs(gap)} minutes`);
        }
      }
      
      previousEndTime = endTime;
    });
    
    // Check for sequence violations
    console.log('\n🔍 Sequence Validation:');
    const violations = await pool.query(`
      WITH sequence_check AS (
        SELECT 
          s1.id as current_slot,
          s1.start_datetime as current_start,
          jr1.sequence_order as current_seq,
          jr1.operation_name as current_op,
          s2.end_datetime as prev_end,
          jr2.sequence_order as prev_seq,
          jr2.operation_name as prev_op
        FROM schedule_slots s1
        JOIN job_routings jr1 ON s1.job_routing_id = jr1.id
        JOIN jobs j ON s1.job_id = j.id
        LEFT JOIN schedule_slots s2 ON s1.job_id = s2.job_id
        LEFT JOIN job_routings jr2 ON s2.job_routing_id = jr2.id
        WHERE j.job_number = '12345'
        AND jr1.sequence_order > jr2.sequence_order
        AND s1.start_datetime < s2.end_datetime
      )
      SELECT * FROM sequence_check
    `);
    
    if (violations.rows.length === 0) {
      console.log('✅ All operations are in proper sequence order');
    } else {
      console.log('❌ Sequence violations found:');
      violations.rows.forEach(violation => {
        console.log(`   Operation ${violation.current_op} (seq ${violation.current_seq}) starts before ${violation.prev_op} (seq ${violation.prev_seq}) ends`);
      });
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

checkJobSequence();