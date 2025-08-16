const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function testOutsourcing() {
  try {
    console.log('=== TESTING OUTSOURCING FUNCTIONALITY ===\n');
    
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Create test jobs with outsourcing operations
      const testJobs = [
        {
          job_number: 'TEST-OUT-001',
          customer_name: 'Acme Manufacturing',
          part_name: 'Precision Bracket',
          part_number: 'ACM-001',
          quantity: 10,
          priority: 2,
          due_date: '2025-08-25',
          promised_date: '2025-08-25',
          status: 'pending',
          material: '6061 Aluminum',
          special_instructions: 'Test job with outsourcing',
          routings: [
            {
              operation_number: 1,
              operation_name: 'SAW',
              sequence_order: 1,
              estimated_hours: 1.5,
              is_outsourced: false
            },
            {
              operation_number: 2,
              operation_name: 'Heat Treat',
              sequence_order: 2,
              estimated_hours: 0,
              is_outsourced: true,
              vendor_name: 'ABC Heat Treating',
              vendor_lead_days: 5
            },
            {
              operation_number: 3,
              operation_name: 'Final Machining',
              sequence_order: 3,
              estimated_hours: 3.0,
              is_outsourced: false
            }
          ]
        },
        {
          job_number: 'TEST-OUT-002', 
          customer_name: 'Beta Industries',
          part_name: 'Complex Housing',
          part_number: 'BTI-002',
          quantity: 5,
          priority: 1,
          due_date: '2025-08-20',
          promised_date: '2025-08-20',
          status: 'pending',
          material: '4140 Steel',
          special_instructions: 'Urgent job with tight timeline',
          routings: [
            {
              operation_number: 1,
              operation_name: 'Rough Machining',
              sequence_order: 1,
              estimated_hours: 4.0,
              is_outsourced: false
            },
            {
              operation_number: 2,
              operation_name: 'Electroplating',
              sequence_order: 2,
              estimated_hours: 0,
              is_outsourced: true,
              vendor_name: 'XYZ Plating Services',
              vendor_lead_days: 3
            }
          ]
        },
        {
          job_number: 'S12345',
          customer_name: 'Stock Parts',
          part_name: 'Stock Bushing',
          part_number: 'STK-12345',
          quantity: 100,
          priority: 7,
          due_date: '2025-09-15',
          promised_date: '2025-09-15',
          status: 'pending',
          material: 'Brass',
          special_instructions: 'Stock job - lower priority',
          is_stock_job: true,
          stock_number: '12345',
          routings: [
            {
              operation_number: 1,
              operation_name: 'Turn',
              sequence_order: 1,
              estimated_hours: 2.0,
              is_outsourced: false
            },
            {
              operation_number: 2,
              operation_name: 'Anodizing',
              sequence_order: 2,
              estimated_hours: 0,
              is_outsourced: true,
              vendor_name: 'Quality Anodizing LLC',
              vendor_lead_days: 7
            }
          ]
        }
      ];
      
      console.log('Creating test jobs with outsourcing operations...\n');
      
      for (const job of testJobs) {
        // Insert job
        const jobResult = await client.query(`
          INSERT INTO jobs (
            job_number, customer_name, part_name, part_number, quantity,
            priority, due_date, promised_date, status, material, 
            special_instructions, is_stock_job, stock_number
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
          ON CONFLICT (job_number) DO UPDATE SET
            updated_at = CURRENT_TIMESTAMP
          RETURNING id
        `, [
          job.job_number, job.customer_name, job.part_name, job.part_number,
          job.quantity, job.priority, job.due_date, job.promised_date,
          job.status, job.material, job.special_instructions,
          job.is_stock_job || false, job.stock_number || null
        ]);
        
        const jobId = jobResult.rows[0].id;
        
        // Delete existing routings
        await client.query('DELETE FROM job_routings WHERE job_id = $1', [jobId]);
        
        // Insert routings
        for (const routing of job.routings) {
          await client.query(`
            INSERT INTO job_routings (
              job_id, operation_number, operation_name, sequence_order,
              estimated_hours, is_outsourced, vendor_name, vendor_lead_days
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          `, [
            jobId, routing.operation_number, routing.operation_name, routing.sequence_order,
            routing.estimated_hours, routing.is_outsourced || false,
            routing.vendor_name || null, routing.vendor_lead_days || 0
          ]);
        }
        
        console.log(`✅ Created job ${job.job_number} with ${job.routings.filter(r => r.is_outsourced).length} outsourced operation(s)`);
      }
      
      await client.query('COMMIT');
      
      // Test the outsourcing API
      console.log('\n=== TESTING OUTSOURCING API ===\n');
      
      const outsourcingResult = await pool.query(`
        SELECT 
          j.job_number,
          j.customer_name,
          j.promised_date,
          jr.operation_name,
          jr.vendor_name,
          jr.vendor_lead_days,
          j.promised_date - INTERVAL '1 day' * jr.vendor_lead_days as send_out_by_date,
          CASE 
            WHEN j.promised_date - INTERVAL '1 day' * jr.vendor_lead_days < CURRENT_DATE THEN 'OVERDUE'
            WHEN j.promised_date - INTERVAL '1 day' * jr.vendor_lead_days = CURRENT_DATE THEN 'DUE TODAY'
            WHEN j.promised_date - INTERVAL '1 day' * jr.vendor_lead_days <= CURRENT_DATE + INTERVAL '3 days' THEN 'URGENT'
            ELSE 'ON SCHEDULE'
          END as urgency_status
        FROM jobs j
        INNER JOIN job_routings jr ON j.id = jr.job_id
        WHERE jr.is_outsourced = true
        ORDER BY send_out_by_date
      `);
      
      console.log('Outsourced Operations Summary:');
      outsourcingResult.rows.forEach(op => {
        console.log(`  ${op.job_number}: ${op.operation_name} → ${op.vendor_name}`);
        console.log(`    Send out by: ${op.send_out_by_date?.toDateString() || 'No date'} (${op.urgency_status})`);
        console.log(`    Customer: ${op.customer_name}, Due: ${op.promised_date?.toDateString()}`);
        console.log('');
      });
      
      console.log(`✅ Successfully created ${testJobs.length} test jobs with outsourcing operations!`);
      console.log(`📊 Found ${outsourcingResult.rows.length} outsourced operations`);
      console.log('\n🌐 You can now visit http://localhost:3000 to see the outsourcing tile in action!');
      
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

testOutsourcing();