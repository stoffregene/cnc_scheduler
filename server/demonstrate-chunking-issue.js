const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5732/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function demonstrateChunkingIssue() {
  try {
    console.log('🔍 Demonstrating Chunking Efficiency Issue...\n');
    
    // Find chunked operations from scheduled jobs
    console.log('📊 Looking for chunked operations in current schedule...');
    const chunkedOpsResult = await pool.query(`
      SELECT 
        j.job_number,
        j.customer_name,
        jr.operation_name,
        m.name as machine_name,
        e.name as employee_name,
        ss.notes,
        ss.start_datetime,
        ss.end_datetime,
        ss.duration_minutes,
        DATE(ss.start_datetime) as slot_date
      FROM schedule_slots ss
      JOIN jobs j ON ss.job_id = j.id
      JOIN job_routings jr ON ss.job_routing_id = jr.id
      JOIN machines m ON ss.machine_id = m.id
      JOIN employees e ON ss.employee_id = e.id
      WHERE ss.notes LIKE '%Chunk%'
      ORDER BY j.job_number, jr.operation_number, ss.start_datetime
    `);
    
    if (chunkedOpsResult.rows.length === 0) {
      console.log('   No chunked operations found in current schedule.');
      console.log('   🎯 Let\'s find a long operation to demonstrate the issue...');
      
      // Find operations that would likely need chunking (>8 hours)
      const longOpsResult = await pool.query(`
        SELECT j.job_number, j.customer_name, jr.operation_name, jr.estimated_hours
        FROM job_routings jr
        JOIN jobs j ON jr.job_id = j.id
        WHERE jr.estimated_hours > 8
          AND j.auto_scheduled = true
        ORDER BY jr.estimated_hours DESC
        LIMIT 5
      `);
      
      console.log('   Long operations that should have been chunked:');
      longOpsResult.rows.forEach(op => {
        console.log(`     ${op.job_number}: ${op.operation_name} - ${op.estimated_hours}h (${op.customer_name})`);
      });
      
    } else {
      console.log(`   Found ${chunkedOpsResult.rows.length} chunked operations:`);
      
      // Group by job and operation to analyze chunking patterns
      const chunkGroups = {};
      chunkedOpsResult.rows.forEach(row => {
        const key = `${row.job_number}-${row.operation_name}`;
        if (!chunkGroups[key]) {
          chunkGroups[key] = {
            job_number: row.job_number,
            customer_name: row.customer_name,
            operation_name: row.operation_name,
            machine_name: row.machine_name,
            employee_name: row.employee_name,
            chunks: []
          };
        }
        chunkGroups[key].chunks.push({
          start: row.start_datetime,
          end: row.end_datetime,
          duration: row.duration_minutes,
          date: row.slot_date,
          notes: row.notes
        });
      });
      
      // Analyze each chunked operation for efficiency issues
      Object.values(chunkGroups).forEach(group => {
        console.log(`\n   📋 ${group.job_number} - ${group.operation_name} (${group.employee_name} on ${group.machine_name})`);
        
        let previousDate = null;
        let totalWastedTime = 0;
        
        group.chunks.forEach((chunk, index) => {
          const chunkDate = chunk.date;
          const chunkHours = (chunk.duration / 60).toFixed(1);
          
          console.log(`     Chunk ${index + 1}: ${chunkDate} - ${chunkHours}h (${chunk.start} to ${chunk.end})`);
          
          if (previousDate && previousDate === chunkDate) {
            console.log(`       ⚠️  Multiple chunks on same day - good!`);
          } else if (previousDate) {
            // Check if there was remaining time on previous day
            const prevChunk = group.chunks[index - 1];
            const prevEnd = new Date(prevChunk.end);
            const dayEnd = new Date(prevEnd);
            dayEnd.setHours(17, 0, 0, 0); // Assume 5 PM end
            
            const remainingMinutes = Math.max(0, (dayEnd - prevEnd) / (1000 * 60));
            if (remainingMinutes > 60) { // More than 1 hour remaining
              console.log(`       🚨 INEFFICIENCY: ${(remainingMinutes/60).toFixed(1)}h wasted on ${previousDate}!`);
              totalWastedTime += remainingMinutes;
            }
          }
          
          previousDate = chunkDate;
        });
        
        if (totalWastedTime > 0) {
          console.log(`     💰 Total wasted time: ${(totalWastedTime/60).toFixed(1)} hours`);
        }
      });
    }
    
    // Show example of current chunking logic issue
    console.log('\n🔧 Current Chunking Logic Issue:');
    console.log('   ❌ Problem: After each chunk, algorithm moves to NEXT DAY');
    console.log('   ❌ Result: Operator has 2h job, then 6h gap, then 10h job next day');
    console.log('   ✅ Solution: Check remaining time on SAME DAY first');
    console.log('   ✅ Benefit: 2h job + 6h of 10h job same day, 4h remainder next day');
    
    // Get employee work schedule example
    console.log('\n👷 Example Employee Schedule Analysis:');
    const employeeResult = await pool.query(`
      SELECT DISTINCT e.name, e.numeric_id
      FROM employees e
      JOIN schedule_slots ss ON e.numeric_id = ss.employee_id
      LIMIT 1
    `);
    
    if (employeeResult.rows.length > 0) {
      const employee = employeeResult.rows[0];
      console.log(`   Employee: ${employee.name} (ID: ${employee.numeric_id})`);
      
      // Get their scheduled work for analysis
      const scheduleResult = await pool.query(`
        SELECT 
          DATE(ss.start_datetime) as work_date,
          MIN(ss.start_datetime) as day_start,
          MAX(ss.end_datetime) as day_end,
          SUM(ss.duration_minutes) as total_minutes,
          COUNT(*) as slot_count
        FROM schedule_slots ss
        WHERE ss.employee_id = $1
        GROUP BY DATE(ss.start_datetime)
        ORDER BY work_date
        LIMIT 5
      `, [employee.numeric_id]);
      
      scheduleResult.rows.forEach(day => {
        const hours = (day.total_minutes / 60).toFixed(1);
        const startTime = new Date(day.day_start).toLocaleTimeString();
        const endTime = new Date(day.day_end).toLocaleTimeString();
        console.log(`     ${day.work_date}: ${hours}h (${startTime} - ${endTime}) across ${day.slot_count} operations`);
        
        // Calculate potential remaining time (assuming 8h workday)
        const remainingHours = Math.max(0, 8 - (day.total_minutes / 60));
        if (remainingHours > 1) {
          console.log(`       💡 Could fit ${remainingHours.toFixed(1)}h more work this day!`);
        }
      });
    }
    
  } catch (error) {
    console.error('Error demonstrating chunking issue:', error);
  } finally {
    await pool.end();
  }
}

demonstrateChunkingIssue();