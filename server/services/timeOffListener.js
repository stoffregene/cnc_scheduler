const { Pool } = require('pg');
const DisplacementService = require('./displacementService');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../..', '.env') });

class TimeOffListener {
  constructor() {
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL || 'postgresql://postgres:sassysalad@localhost:5432/cnc_scheduler'
    });
    this.displacementService = new DisplacementService();
    this.client = null;
  }

  async start() {
    try {
      // Create a dedicated connection for listening
      this.client = await this.pool.connect();
      
      // Listen for displacement notifications
      await this.client.query('LISTEN displacement_required');
      await this.client.query('LISTEN urgent_rescheduling');
      
      console.log('📡 Time off listener started - monitoring for displacement events');
      
      // Handle notifications
      this.client.on('notification', async (msg) => {
        try {
          const payload = JSON.parse(msg.payload);
          
          if (msg.channel === 'displacement_required') {
            await this.handleDisplacementRequired(payload);
          } else if (msg.channel === 'urgent_rescheduling') {
            await this.handleUrgentRescheduling(payload);
          }
        } catch (error) {
          console.error('Error handling notification:', error);
        }
      });
      
      // Keep connection alive
      setInterval(() => {
        this.client.query('SELECT 1');
      }, 30000);
      
    } catch (error) {
      console.error('Error starting time off listener:', error);
      throw error;
    }
  }

  async handleDisplacementRequired(payload) {
    console.log('\n🔄 Displacement required due to time off:', payload);
    
    try {
      // Get all jobs that need rescheduling
      const result = await this.pool.query(`
        SELECT DISTINCT
          j.id,
          j.job_number,
          j.priority_score,
          j.promised_date,
          jr.id as routing_id,
          jr.operation_name,
          jr.sequence_order
        FROM jobs j
        JOIN job_routings jr ON j.id = jr.job_id
        WHERE jr.routing_status = 'needs_rescheduling'
        ORDER BY j.priority_score DESC
      `);
      
      console.log(`Found ${result.rows.length} operations needing rescheduling`);
      
      let successCount = 0;
      let failureCount = 0;
      
      // Process each job through DisplacementService
      for (const job of result.rows) {
        try {
          console.log(`\nProcessing job ${job.job_number} (priority: ${job.priority_score})`);
          
          // Try to schedule with displacement if necessary
          const scheduled = await this.displacementService.scheduleWithDisplacement(
            job.id,
            {
              respectFirmZone: true,
              allowDisplacement: true,
              reason: `Time off rescheduling - Employee #${payload.employee_id}`
            }
          );
          
          if (scheduled.success) {
            successCount++;
            console.log(`  ✅ Successfully rescheduled job ${job.job_number}`);
            
            // Update routing status
            await this.pool.query(
              `UPDATE job_routings 
               SET routing_status = 'scheduled' 
               WHERE id = $1`,
              [job.routing_id]
            );
          } else {
            failureCount++;
            console.log(`  ⚠️ Could not reschedule job ${job.job_number}: ${scheduled.message}`);
            
            // Create alert for failed rescheduling
            await this.createAlert(
              'rescheduling_failed',
              'high',
              `Failed to reschedule job ${job.job_number} after time off`,
              {
                job_number: job.job_number,
                priority_score: job.priority_score,
                promised_date: job.promised_date,
                reason: scheduled.message
              }
            );
          }
        } catch (error) {
          failureCount++;
          console.error(`  ❌ Error rescheduling job ${job.job_number}:`, error.message);
        }
      }
      
      // Log summary
      console.log('\n📊 Rescheduling Summary:');
      console.log(`  - Successfully rescheduled: ${successCount} jobs`);
      console.log(`  - Failed to reschedule: ${failureCount} jobs`);
      
      // Update displacement log
      await this.pool.query(`
        UPDATE displacement_logs
        SET 
          execution_details = execution_details || jsonb_build_object(
            'rescheduling_complete', true,
            'success_count', $1,
            'failure_count', $2,
            'timestamp', NOW()
          )
        WHERE trigger_type = 'time_off'
        AND created_at >= NOW() - INTERVAL '1 minute'
      `, [successCount, failureCount]);
      
    } catch (error) {
      console.error('Error in handleDisplacementRequired:', error);
    }
  }

  async handleUrgentRescheduling(payload) {
    console.log('\n🚨 URGENT RESCHEDULING REQUIRED:', payload.message);
    console.log('Critical jobs affected:', payload.critical_jobs);
    
    // Create high priority alert
    await this.createAlert(
      'urgent_time_off_impact',
      'critical',
      payload.message,
      payload
    );
    
    // Could trigger additional actions here like:
    // - Send email/SMS to management
    // - Check for overtime options
    // - Look for cross-training opportunities
  }

  async createAlert(type, severity, message, details) {
    try {
      await this.pool.query(`
        INSERT INTO system_alerts (alert_type, severity, message, details, created_at)
        VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
      `, [type, severity, message, JSON.stringify(details)]);
    } catch (error) {
      console.error('Error creating alert:', error);
    }
  }

  async stop() {
    if (this.client) {
      await this.client.query('UNLISTEN displacement_required');
      await this.client.query('UNLISTEN urgent_rescheduling');
      this.client.release();
    }
    await this.pool.end();
    console.log('Time off listener stopped');
  }
}

// Export for use in main server
module.exports = TimeOffListener;

// If run directly, start the listener
if (require.main === module) {
  const listener = new TimeOffListener();
  
  listener.start().catch(console.error);
  
  // Handle shutdown gracefully
  process.on('SIGINT', async () => {
    console.log('\nShutting down time off listener...');
    await listener.stop();
    process.exit(0);
  });
}