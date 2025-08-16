const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5732/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function analyzeInspectAndNulls() {
  try {
    console.log('🔍 Analyzing INSPECT Operations and Null Assignments...\n');
    
    // 1. Check INSPECT operations and their estimated hours
    console.log('📋 INSPECT Operations Analysis:');
    console.log('============================');
    const inspectResult = await pool.query(`
      SELECT j.job_number, jr.operation_number, jr.operation_name, 
             jr.estimated_hours, jr.machine_id, m.name as machine_name
      FROM job_routings jr 
      JOIN jobs j ON jr.job_id = j.id
      LEFT JOIN machines m ON jr.machine_id = m.id
      WHERE jr.operation_name ILIKE '%INSPECT%'
      ORDER BY j.job_number, jr.operation_number
      LIMIT 15
    `);
    
    if (inspectResult.rows.length === 0) {
      console.log('   No INSPECT operations found');
    } else {
      inspectResult.rows.forEach(row => {
        console.log(`Job ${row.job_number} Op ${row.operation_number}: ${row.operation_name}`);
        console.log(`  Hours: ${row.estimated_hours}, Machine: ${row.machine_name || 'NULL'}`);
      });
    }
    
    // 2. Check for null machine assignments
    console.log('\n🚫 Operations with NULL Machine Assignments:');
    console.log('==========================================');
    const nullMachineResult = await pool.query(`
      SELECT j.job_number, jr.operation_number, jr.operation_name, 
             jr.machine_group_id, mg.name as group_name, jr.estimated_hours
      FROM job_routings jr 
      JOIN jobs j ON jr.job_id = j.id
      LEFT JOIN machine_groups mg ON jr.machine_group_id = mg.id
      WHERE jr.machine_id IS NULL
      ORDER BY j.job_number, jr.operation_number
      LIMIT 15
    `);
    
    if (nullMachineResult.rows.length === 0) {
      console.log('   No operations with NULL machine assignments found');
    } else {
      nullMachineResult.rows.forEach(row => {
        console.log(`Job ${row.job_number} Op ${row.operation_number}: ${row.operation_name}`);
        console.log(`  Machine: NULL, Group: ${row.group_name || 'NULL'}, Hours: ${row.estimated_hours}`);
      });
    }
    
    // 3. Check variety of estimated hours for INSPECT operations
    console.log('\n⏱️ INSPECT Operations Hour Distribution:');
    console.log('======================================');
    const hourDistribution = await pool.query(`
      SELECT estimated_hours, COUNT(*) as count
      FROM job_routings jr
      WHERE jr.operation_name ILIKE '%INSPECT%'
      GROUP BY estimated_hours
      ORDER BY estimated_hours
    `);
    
    hourDistribution.rows.forEach(row => {
      console.log(`  ${row.estimated_hours} hours: ${row.count} operations`);
    });
    
    // 4. Check current priority calculation for sample jobs
    console.log('\n🎯 Sample Job Priorities:');
    console.log('========================');
    const priorityResult = await pool.query(`
      SELECT job_number, customer_name, priority_score::numeric, due_date, promised_date
      FROM jobs 
      WHERE status = 'pending'
      ORDER BY priority_score::numeric DESC
      LIMIT 10
    `);
    
    priorityResult.rows.forEach(row => {
      const dueDate = row.due_date ? new Date(row.due_date) : null;
      const today = new Date();
      const daysUntilDue = dueDate ? Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24)) : 'N/A';
      
      console.log(`Job ${row.job_number}: Priority ${row.priority_score} (${row.customer_name})`);
      console.log(`  Due: ${dueDate ? dueDate.toLocaleDateString() : 'N/A'} (${daysUntilDue} days)`);
    });
    
  } catch (error) {
    console.error('❌ Analysis failed:', error.message);
  } finally {
    await pool.end();
  }
}

analyzeInspectAndNulls();