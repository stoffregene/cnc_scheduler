const { Pool } = require('pg');
require('dotenv').config();

async function listAllWorkcenters() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL
  });

  try {
    console.log('📋 Complete List of Workcenters from CSV Import\n');
    
    // Get all workcenters from job routings (both outsourced and non-outsourced)
    const workcentersQuery = `
      SELECT 
        jr.operation_name as csv_workcenter,
        jr.is_outsourced,
        jr.vendor_name,
        COUNT(*) as operation_count,
        array_agg(DISTINCT j.job_number ORDER BY j.job_number) as sample_jobs,
        MIN(jr.estimated_hours) as min_hours,
        MAX(jr.estimated_hours) as max_hours,
        AVG(jr.estimated_hours) as avg_hours
      FROM job_routings jr
      JOIN jobs j ON jr.job_id = j.id
      GROUP BY jr.operation_name, jr.is_outsourced, jr.vendor_name
      ORDER BY jr.is_outsourced, COUNT(*) DESC, jr.operation_name
    `;
    
    const workcenters = await pool.query(workcentersQuery);
    
    // Separate internal vs outsourced
    const internalWorkcenters = workcenters.rows.filter(wc => !wc.is_outsourced);
    const outsourcedWorkcenters = workcenters.rows.filter(wc => wc.is_outsourced);
    
    console.log('🏭 INTERNAL WORKCENTERS (Non-Outsourced):');
    console.log('='.repeat(100));
    console.log('CSV Name                | Ops | Avg Hours | Min-Max Hours | Sample Jobs');
    console.log('-'.repeat(100));
    
    internalWorkcenters.forEach((wc, index) => {
      const csvName = wc.csv_workcenter.padEnd(19);
      const opsCount = wc.operation_count.toString().padEnd(3);
      const avgHours = parseFloat(wc.avg_hours).toFixed(1).padEnd(9);
      const hourRange = `${wc.min_hours}-${wc.max_hours}`.padEnd(13);
      const sampleJobs = wc.sample_jobs.slice(0, 3).join(', ');
      
      console.log(`${(index + 1).toString().padStart(2)}. ${csvName} | ${opsCount} | ${avgHours} | ${hourRange} | ${sampleJobs}`);
    });
    
    console.log('\n🚚 OUTSOURCED OPERATIONS:');
    console.log('='.repeat(100));
    console.log('Vendor Name             | Operation Name          | Ops | Avg Hours | Sample Jobs');
    console.log('-'.repeat(100));
    
    outsourcedWorkcenters.forEach((wc, index) => {
      const vendorName = (wc.vendor_name || 'Unknown').padEnd(23);
      const opName = wc.csv_workcenter.padEnd(23);
      const opsCount = wc.operation_count.toString().padEnd(3);
      const avgHours = parseFloat(wc.avg_hours).toFixed(1).padEnd(9);
      const sampleJobs = wc.sample_jobs.slice(0, 2).join(', ');
      
      console.log(`${(index + 1).toString().padStart(2)}. ${vendorName} | ${opName} | ${opsCount} | ${avgHours} | ${sampleJobs}`);
    });
    
    // Show current machines for reference
    console.log('\n🔧 YOUR CURRENT MACHINES IN DATABASE:');
    console.log('='.repeat(100));
    
    const machinesQuery = `
      SELECT 
        name, 
        status, 
        model,
        array_to_string(capabilities, ', ') as capabilities,
        efficiency_modifier
      FROM machines 
      ORDER BY name
    `;
    
    const machines = await pool.query(machinesQuery);
    
    console.log('Machine Name            | Status | Model           | Capabilities | Efficiency');
    console.log('-'.repeat(100));
    
    machines.rows.forEach((machine, index) => {
      const name = machine.name.padEnd(19);
      const status = machine.status.padEnd(6);
      const model = (machine.model || 'N/A').padEnd(15);
      const capabilities = (machine.capabilities || 'general').padEnd(12);
      const efficiency = (machine.efficiency_modifier || 1.0).toString();
      
      console.log(`${(index + 1).toString().padStart(2)}. ${name} | ${status} | ${model} | ${capabilities} | ${efficiency}x`);
    });
    
    // Summary for mapping
    console.log('\n📝 MAPPING TEMPLATE:');
    console.log('='.repeat(100));
    console.log('Please map these CSV workcenters to your existing machines:');
    console.log('(Format: "CSV_NAME" → "YOUR_MACHINE_NAME" or "NEW" if needs to be created)');
    console.log('-'.repeat(100));
    
    internalWorkcenters.forEach((wc, index) => {
      console.log(`${(index + 1).toString().padStart(2)}. "${wc.csv_workcenter}" → __________ (${wc.operation_count} operations)`);
    });
    
    console.log('\n💡 HINTS FOR MAPPING:');
    console.log('='.repeat(100));
    console.log('• VMC = Vertical Machining Center');
    console.log('• HMC = Horizontal Machining Center'); 
    console.log('• LATHE = Turning/Lathe operations');
    console.log('• SAW = Sawing/Cutting operations');
    console.log('• INSPECT = Inspection/Quality control');
    console.log('• BLAST = Sandblasting/Surface prep');
    console.log('• TUMBLE = Tumbling/Deburring');
    console.log('• ASSEMBLE = Assembly operations');
    console.log('• BENDING = Brake/Bending operations');
    console.log('• DEBURR = Manual deburring');
    
  } catch (error) {
    console.error('❌ Error listing workcenters:', error.message);
  } finally {
    await pool.end();
  }
}

listAllWorkcenters();