const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5732/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function createDisplacementLogs() {
  try {
    console.log('📝 Creating sample displacement log entries for testing...\n');
    
    // Create a few sample displacement log entries with details
    const displacement1 = await pool.query(`
      INSERT INTO displacement_logs (
        trigger_job_id, trigger_job_number, success, total_displaced, total_rescheduled,
        execution_time_ms, notes, timestamp
      ) VALUES (
        2095, '60342-1', true, 2, 2, 1250,
        'Successfully displaced 2 lower priority jobs to schedule high priority job',
        NOW() - INTERVAL '2 hours'
      ) RETURNING id
    `);
    
    const logId1 = displacement1.rows[0].id;
    
    // Add displacement details for first log
    await pool.query(`
      INSERT INTO displacement_details (
        displacement_log_id, displaced_job_id, displaced_job_number,
        original_start_time, original_end_time, machine_id, machine_name,
        displacement_reason, hours_freed, reschedule_status,
        new_start_time, new_end_time, reschedule_delay_hours
      ) VALUES 
      (
        $1, 2096, '60342-2',
        '2025-08-19 08:00:00', '2025-08-19 16:00:00', 15, 'VMC-003',
        'Priority difference: 6567% (job priority 1000 vs 15)',
        8.0, 'rescheduled',
        '2025-08-20 08:00:00', '2025-08-20 16:00:00', 24.0
      ),
      (
        $1, 2097, '60303', 
        '2025-08-19 09:00:00', '2025-08-19 14:00:00', 12, 'HMC-002',
        'Priority difference: 9900% (job priority 1000 vs 10)',
        5.0, 'rescheduled',
        '2025-08-21 09:00:00', '2025-08-21 14:00:00', 48.0
      )
    `, [logId1]);
    
    // Add impact analysis for first log
    await pool.query(`
      INSERT INTO displacement_impact (
        displacement_log_id, customers_affected, machines_affected,
        total_hours_displaced, average_delay_days, priority_threshold_used
      ) VALUES (
        $1, ARRAY['MAREL POUL', 'ACCU MOLD'], ARRAY['VMC-003', 'HMC-002'],
        13.0, 1.5, 0.15
      )
    `, [logId1]);
    
    // Create second displacement log
    const displacement2 = await pool.query(`
      INSERT INTO displacement_logs (
        trigger_job_id, trigger_job_number, success, total_displaced, total_rescheduled,
        execution_time_ms, notes, timestamp
      ) VALUES (
        2098, 'S60062', true, 1, 1, 850,
        'Displaced 1 job to accommodate urgent STOCK order',
        NOW() - INTERVAL '30 minutes'
      ) RETURNING id
    `);
    
    const logId2 = displacement2.rows[0].id;
    
    // Add displacement details for second log
    await pool.query(`
      INSERT INTO displacement_details (
        displacement_log_id, displaced_job_id, displaced_job_number,
        original_start_time, original_end_time, machine_id, machine_name,
        displacement_reason, hours_freed, reschedule_status,
        new_start_time, new_end_time, reschedule_delay_hours
      ) VALUES (
        $1, 2099, '59970-1',
        '2025-08-18 10:00:00', '2025-08-18 18:00:00', 8, 'SAW-001',
        'Priority difference: 2500% (urgent STOCK order)',
        8.0, 'rescheduled',
        '2025-08-19 10:00:00', '2025-08-19 18:00:00', 24.0
      )
    `, [logId2]);
    
    // Add impact analysis for second log
    await pool.query(`
      INSERT INTO displacement_impact (
        displacement_log_id, customers_affected, machines_affected,
        total_hours_displaced, average_delay_days, priority_threshold_used
      ) VALUES (
        $1, ARRAY['ACCU MOLD'], ARRAY['SAW-001'],
        8.0, 1.0, 0.15
      )
    `, [logId2]);
    
    // Create a failed displacement log
    const displacement3 = await pool.query(`
      INSERT INTO displacement_logs (
        trigger_job_id, trigger_job_number, success, total_displaced, total_rescheduled,
        execution_time_ms, notes, timestamp
      ) VALUES (
        2100, '60148', false, 0, 0, 45,
        'Displacement failed: No suitable opportunities found (firm zone protection)',
        NOW() - INTERVAL '45 minutes'
      ) RETURNING id
    `);
    
    const logId3 = displacement3.rows[0].id;
    
    // Add impact analysis for failed displacement
    await pool.query(`
      INSERT INTO displacement_impact (
        displacement_log_id, customers_affected, machines_affected,
        total_hours_displaced, average_delay_days, priority_threshold_used
      ) VALUES (
        $1, ARRAY[]::text[], ARRAY[]::text[],
        0.0, 0.0, 0.15
      )
    `, [logId3]);
    
    console.log('✅ Created sample displacement logs:');
    console.log(`   Log ${logId1}: Successful displacement of 2 jobs`);
    console.log(`   Log ${logId2}: Successful displacement of 1 job`);
    console.log(`   Log ${logId3}: Failed displacement (firm zone protection)`);
    
    // Show current displacement history
    const history = await pool.query(`
      SELECT id, trigger_job_number, success, total_displaced, total_rescheduled, timestamp
      FROM displacement_logs 
      ORDER BY timestamp DESC 
      LIMIT 5
    `);
    
    console.log('\n📚 Current displacement history:');
    history.rows.forEach((row, index) => {
      console.log(`   ${index + 1}. ${row.trigger_job_number} - ${row.success ? 'SUCCESS' : 'FAILED'} (${row.total_displaced} displaced, ${row.total_rescheduled} rescheduled)`);
    });
    
    console.log('\n🎉 Sample displacement logs created successfully!');
    console.log('\n💻 View them at: http://localhost:3000/displacement-logs');
    
  } catch (error) {
    console.error('❌ Failed to create displacement logs:', error.message);
    console.error(error.stack);
  } finally {
    await pool.end();
  }
}

// Run the script
createDisplacementLogs();