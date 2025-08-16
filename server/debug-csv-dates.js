const path = require('path');
const JobBossCSVParserV2 = require('./services/jobbossCSVParserV2');

async function debugCSVDates() {
  try {
    console.log('🔍 Debugging CSV date parsing...\n');
    
    const csvPath = path.join(__dirname, '..', 'AttachedAssets', 'data.csv');
    console.log(`📁 Reading CSV from: ${csvPath}`);
    
    // Parse CSV using the new parser
    const parser = new JobBossCSVParserV2(null); // No pool needed for testing
    const parsedData = await parser.parseCSV(csvPath);
    
    console.log('\n📊 Date Analysis:');
    console.log(`Total jobs parsed: ${parsedData.jobs.length}`);
    
    // Analyze the first few jobs' dates
    const sampleJobs = parsedData.jobs.slice(0, 5);
    
    console.log('\n📋 Sample job dates:');
    sampleJobs.forEach((job, index) => {
      console.log(`${index + 1}. Job ${job.job_number}:`);
      console.log(`   promised_date: "${job.promised_date}" (type: ${typeof job.promised_date})`);
      console.log(`   order_date: "${job.order_date}" (type: ${typeof job.order_date})`);
      console.log(`   due_date: "${job.due_date}" (type: ${typeof job.due_date})`);
      console.log('');
    });
    
    // Check for any invalid dates
    console.log('🔍 Checking for invalid dates...');
    let invalidDates = [];
    
    parsedData.jobs.forEach(job => {
      if (job.promised_date && job.promised_date !== null) {
        const promisedTest = new Date(job.promised_date);
        if (isNaN(promisedTest.getTime())) {
          invalidDates.push({
            job: job.job_number,
            field: 'promised_date',
            value: job.promised_date
          });
        }
      }
      
      if (job.order_date && job.order_date !== null) {
        const orderTest = new Date(job.order_date);
        if (isNaN(orderTest.getTime())) {
          invalidDates.push({
            job: job.job_number,
            field: 'order_date', 
            value: job.order_date
          });
        }
      }
    });
    
    if (invalidDates.length > 0) {
      console.log(`❌ Found ${invalidDates.length} invalid dates:`);
      invalidDates.slice(0, 10).forEach(invalid => {
        console.log(`   - Job ${invalid.job}: ${invalid.field} = "${invalid.value}"`);
      });
      if (invalidDates.length > 10) {
        console.log(`   ... and ${invalidDates.length - 10} more`);
      }
    } else {
      console.log('✅ All dates appear to be valid');
    }
    
    // Test specific problematic date formats
    console.log('\n🧪 Testing PostgreSQL date compatibility...');
    const testDates = sampleJobs.map(job => job.promised_date).filter(d => d);
    
    testDates.slice(0, 3).forEach(dateStr => {
      console.log(`Testing: "${dateStr}"`);
      const jsDate = new Date(dateStr);
      console.log(`  JS Date: ${jsDate.toISOString()}`);
      console.log(`  ISO format: ${jsDate.toISOString().split('T')[0]}`);
    });
    
  } catch (error) {
    console.error('❌ Debug failed:', error.message);
    console.error(error.stack);
  }
}

// Run the debug
debugCSVDates();