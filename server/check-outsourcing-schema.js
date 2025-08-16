const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/cnc_scheduler',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function checkOutsourcingSchema() {
  try {
    console.log('=== CHECKING OUTSOURCING SCHEMA ===\n');
    
    // Check job_routings table for outsourcing fields
    const routingColumns = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_name = 'job_routings' 
      AND (column_name LIKE '%outsourc%' OR column_name LIKE '%vendor%')
      ORDER BY ordinal_position
    `);
    
    console.log('Job Routings outsourcing columns:');
    if (routingColumns.rows.length > 0) {
      routingColumns.rows.forEach(col => {
        console.log(`  ${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable})`);
      });
    } else {
      console.log('  No outsourcing columns found in job_routings table');
    }
    
    // Check for sample data with outsourcing
    const outsourcedOps = await pool.query(`
      SELECT job_id, operation_name, is_outsourced, vendor_name, vendor_lead_days
      FROM job_routings 
      WHERE is_outsourced = true 
      LIMIT 5
    `);
    
    console.log('\nSample outsourced operations:');
    if (outsourcedOps.rows.length > 0) {
      outsourcedOps.rows.forEach(op => {
        console.log(`  Job ${op.job_id}: ${op.operation_name} → ${op.vendor_name} (${op.vendor_lead_days} days)`);
      });
    } else {
      console.log('  No outsourced operations found in current data');
    }
    
    // Check vendors table if it exists
    const vendorsTable = await pool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns 
      WHERE table_name = 'vendors'
      ORDER BY ordinal_position
    `);
    
    console.log('\nVendors table structure:');
    if (vendorsTable.rows.length > 0) {
      vendorsTable.rows.forEach(col => {
        console.log(`  ${col.column_name}: ${col.data_type}`);
      });
    } else {
      console.log('  Vendors table not found');
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

checkOutsourcingSchema();