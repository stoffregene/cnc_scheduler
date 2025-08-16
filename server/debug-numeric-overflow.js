const path = require('path');
const JobBossCSVParserV2 = require('./services/jobbossCSVParserV2');

async function debugNumericOverflow() {
  try {
    console.log('🔍 Debugging numeric field overflow...\n');
    
    const csvPath = path.join(__dirname, '..', 'AttachedAssets', 'data.csv');
    console.log(`📁 Reading CSV from: ${csvPath}`);
    
    // Parse CSV using the new parser
    const parser = new JobBossCSVParserV2(null); // No pool needed for testing
    const parsedData = await parser.parseCSV(csvPath);
    
    console.log('\n📊 Numeric Field Analysis:');
    console.log(`Total jobs parsed: ${parsedData.jobs.length}`);
    
    // Analyze numeric fields for extreme values
    const manufacturingJobs = parsedData.jobs.filter(job => !job.is_pick_order);
    
    console.log(`Manufacturing jobs to import: ${manufacturingJobs.length}`);
    
    // Check for extreme values in numeric fields
    const numericFields = ['quantity', 'priority', 'estimated_hours', 'material_lead_days', 'outsourcing_lead_days'];
    
    numericFields.forEach(field => {
      const values = manufacturingJobs.map(job => job[field]).filter(v => v !== null && v !== undefined);
      const max = Math.max(...values);
      const min = Math.min(...values);
      const hasNaN = values.some(v => isNaN(v));
      const hasInfinity = values.some(v => !isFinite(v));
      
      console.log(`\\n${field}:`);
      console.log(`  Min: ${min}`);
      console.log(`  Max: ${max}`);
      console.log(`  Has NaN: ${hasNaN}`);
      console.log(`  Has Infinity: ${hasInfinity}`);
      
      if (max > 1000000 || hasNaN || hasInfinity) {
        console.log(`  ⚠️ Potential overflow in ${field}!`);
        
        // Show jobs with extreme values
        const extremeJobs = manufacturingJobs.filter(job => {
          const val = job[field];
          return val > 1000000 || isNaN(val) || !isFinite(val);
        });
        
        console.log(`  Extreme values (${extremeJobs.length} jobs):`);
        extremeJobs.slice(0, 5).forEach(job => {
          console.log(`    - Job ${job.job_number}: ${field} = ${job[field]}`);
        });
      }
    });
    
    // Check estimated_hours specifically since it's often the culprit
    console.log('\\n🔍 Detailed estimated_hours analysis:');
    const hoursValues = manufacturingJobs.map(job => job.estimated_hours);
    const sortedHours = hoursValues.filter(h => h !== null && h !== undefined).sort((a, b) => b - a);
    
    console.log('Top 10 estimated_hours values:');
    sortedHours.slice(0, 10).forEach((hours, index) => {
      const job = manufacturingJobs.find(j => j.estimated_hours === hours);
      console.log(`  ${index + 1}. ${hours} hours (Job: ${job?.job_number})`);
    });
    
    // Check for specific problematic jobs that failed during import
    console.log('\\n🧪 Testing the first few jobs for import readiness:');
    
    manufacturingJobs.slice(0, 3).forEach((job, index) => {
      console.log(`\\nJob ${index + 1}: ${job.job_number}`);
      console.log(`  Customer: ${job.customer_name}`);
      console.log(`  Quantity: ${job.quantity} (${typeof job.quantity})`);
      console.log(`  Priority: ${job.priority} (${typeof job.priority})`);
      console.log(`  Estimated hours: ${job.estimated_hours} (${typeof job.estimated_hours})`);
      console.log(`  Material lead days: ${job.material_lead_days} (${typeof job.material_lead_days})`);
      console.log(`  Outsourcing lead days: ${job.outsourcing_lead_days} (${typeof job.outsourcing_lead_days})`);
      
      // Check if any values would cause overflow
      const checkFields = {
        quantity: job.quantity,
        priority: job.priority,
        estimated_hours: job.estimated_hours,
        material_lead_days: job.material_lead_days,
        outsourcing_lead_days: job.outsourcing_lead_days
      };
      
      Object.entries(checkFields).forEach(([field, value]) => {
        if (value > 2147483647) { // PostgreSQL integer max
          console.log(`    ⚠️ ${field} too large for PostgreSQL integer: ${value}`);
        }
        if (isNaN(value) || !isFinite(value)) {
          console.log(`    ⚠️ ${field} is not a valid number: ${value}`);
        }
      });
    });
    
  } catch (error) {
    console.error('❌ Debug failed:', error.message);
    console.error(error.stack);
  }
}

// Run the debug
debugNumericOverflow();