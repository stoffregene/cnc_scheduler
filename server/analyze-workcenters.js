const { Pool } = require('pg');
require('dotenv').config();

async function analyzeWorkcenters() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL
  });

  try {
    console.log('🔍 Analyzing Workcenters from CSV Import\n');
    
    // Get all workcenters from job routings (non-outsourced)
    console.log('1. Finding all workcenters from imported CSV data...');
    console.log('='.repeat(80));
    
    const workcentersQuery = `
      SELECT 
        jr.operation_name,
        jr.is_outsourced,
        jr.vendor_name,
        COUNT(*) as operation_count,
        array_agg(DISTINCT j.job_number ORDER BY j.job_number) as jobs_using
      FROM job_routings jr
      JOIN jobs j ON jr.job_id = j.id
      WHERE jr.is_outsourced = FALSE
      GROUP BY jr.operation_name, jr.is_outsourced, jr.vendor_name
      ORDER BY COUNT(*) DESC, jr.operation_name
    `;
    
    const workcenters = await pool.query(workcentersQuery);
    
    console.log(`Found ${workcenters.rows.length} unique workcenters (non-outsourced):`);
    console.log('-'.repeat(80));
    
    const csvWorkcenters = [];
    workcenters.rows.forEach(wc => {
      csvWorkcenters.push(wc.operation_name);
      console.log(`${wc.operation_name.padEnd(20)} | ${wc.operation_count} operations | Jobs: ${wc.jobs_using.slice(0, 3).join(', ')}${wc.jobs_using.length > 3 ? '...' : ''}`);
    });
    
    // Get current machines from database
    console.log('\n2. Current machines in database...');
    console.log('='.repeat(80));
    
    const machinesQuery = `
      SELECT name, status, model
      FROM machines 
      ORDER BY name
    `;
    
    const machines = await pool.query(machinesQuery);
    
    console.log(`Found ${machines.rows.length} machines in database:`);
    console.log('-'.repeat(80));
    
    const existingMachines = [];
    machines.rows.forEach(machine => {
      existingMachines.push(machine.name);
      console.log(`${machine.name.padEnd(20)} | Status: ${machine.status} | Model: ${machine.model || 'N/A'}`);
    });
    
    // Find missing workcenters
    console.log('\n3. Analysis: Missing workcenters...');
    console.log('='.repeat(80));
    
    const missingWorkcenters = csvWorkcenters.filter(wc => {
      // Check exact match first
      if (existingMachines.includes(wc)) return false;
      
      // Check if any existing machine contains this workcenter name (case insensitive)
      const normalizedWC = wc.toLowerCase();
      const hasPartialMatch = existingMachines.some(machine => 
        machine.toLowerCase().includes(normalizedWC) || normalizedWC.includes(machine.toLowerCase())
      );
      
      return !hasPartialMatch;
    });
    
    if (missingWorkcenters.length === 0) {
      console.log('🎉 All workcenters from CSV are covered by existing machines!');
    } else {
      console.log(`❌ Found ${missingWorkcenters.length} workcenters that need to be added as machines:`);
      console.log('-'.repeat(80));
      
      missingWorkcenters.forEach((wc, index) => {
        // Get usage info for this workcenter
        const usage = workcenters.rows.find(row => row.operation_name === wc);
        console.log(`${(index + 1).toString().padStart(2)}. ${wc.padEnd(20)} | Used in ${usage.operation_count} operations`);
      });
      
      // Generate SQL to create missing machines
      console.log('\n4. SQL to create missing machines:');
      console.log('='.repeat(80));
      
      missingWorkcenters.forEach(wc => {
        const cleanName = wc.replace(/'/g, "''"); // Escape single quotes
        console.log(`INSERT INTO machines (name, status, capabilities) VALUES ('${cleanName}', 'active', ARRAY['general']);`);
      });
    }
    
    // Show outsourced operations for reference
    console.log('\n5. Outsourced operations (for reference):');
    console.log('='.repeat(80));
    
    const outsourcedQuery = `
      SELECT 
        jr.vendor_name,
        jr.operation_name,
        COUNT(*) as operation_count
      FROM job_routings jr
      WHERE jr.is_outsourced = TRUE
      GROUP BY jr.vendor_name, jr.operation_name
      ORDER BY jr.vendor_name, COUNT(*) DESC
    `;
    
    const outsourced = await pool.query(outsourcedQuery);
    
    if (outsourced.rows.length === 0) {
      console.log('No outsourced operations found.');
    } else {
      outsourced.rows.forEach(op => {
        console.log(`${op.vendor_name.padEnd(20)} | ${op.operation_name.padEnd(25)} | ${op.operation_count} operations`);
      });
    }
    
    // Summary
    console.log('\n📊 Summary:');
    console.log('='.repeat(80));
    console.log(`• Total workcenters from CSV: ${csvWorkcenters.length}`);
    console.log(`• Existing machines in database: ${existingMachines.length}`);
    console.log(`• Missing workcenters to add: ${missingWorkcenters.length}`);
    console.log(`• Outsourced operations: ${outsourced.rows.length}`);
    
  } catch (error) {
    console.error('❌ Error analyzing workcenters:', error.message);
    console.error('Error stack:', error.stack);
  } finally {
    await pool.end();
  }
}

analyzeWorkcenters();