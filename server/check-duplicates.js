const path = require('path');
const JobBossCSVParserV2 = require('./services/jobbossCSVParserV2');

async function checkDuplicates() {
  try {
    console.log('🔍 Checking for duplicate routings in CSV...\n');
    
    const csvPath = path.join(__dirname, '..', 'AttachedAssets', 'data.csv');
    
    // Parse CSV using V2 parser
    const parser = new JobBossCSVParserV2(null);
    const parsedData = await parser.parseCSV(csvPath);
    
    console.log(`Total routings parsed: ${parsedData.routings.length}`);
    
    // Count duplicates
    const routingMap = new Map();
    
    parsedData.routings.forEach(routing => {
      const key = `${routing.job_number}-${routing.operation_number}`;
      if (!routingMap.has(key)) {
        routingMap.set(key, []);
      }
      routingMap.get(key).push(routing);
    });
    
    // Find duplicates
    const duplicates = [];
    routingMap.forEach((routings, key) => {
      if (routings.length > 1) {
        duplicates.push({ key, count: routings.length, routings });
      }
    });
    
    console.log(`\n📊 Duplicate Analysis:`);
    console.log(`  Unique job-operation combinations: ${routingMap.size}`);
    console.log(`  Duplicate combinations: ${duplicates.length}`);
    
    if (duplicates.length > 0) {
      console.log('\n⚠️ Sample duplicates:');
      duplicates.slice(0, 5).forEach(dup => {
        console.log(`  ${dup.key}: ${dup.count} occurrences`);
        
        // Check if the duplicates are identical or have differences
        const first = dup.routings[0];
        const allSame = dup.routings.every(r => 
          r.estimated_hours === first.estimated_hours &&
          r.operation_name === first.operation_name &&
          r.routing_status === first.routing_status
        );
        
        if (allSame) {
          console.log(`    → All duplicates are identical`);
        } else {
          console.log(`    → Duplicates have differences:`);
          dup.routings.forEach((r, i) => {
            console.log(`      ${i + 1}. Hours: ${r.estimated_hours}, Name: ${r.operation_name}, Status: ${r.routing_status}`);
          });
        }
      });
    }
    
    // Check for job 59917 specifically
    console.log('\n🔍 Analyzing job 59917 (first job):');
    const job59917Routings = parsedData.routings.filter(r => r.job_number === '59917');
    console.log(`  Total routing lines: ${job59917Routings.length}`);
    
    const job59917Map = new Map();
    job59917Routings.forEach(r => {
      const op = r.operation_number;
      if (!job59917Map.has(op)) {
        job59917Map.set(op, 0);
      }
      job59917Map.set(op, job59917Map.get(op) + 1);
    });
    
    console.log('  Operation counts:');
    Array.from(job59917Map.entries()).sort((a, b) => parseInt(a[0]) - parseInt(b[0])).forEach(([op, count]) => {
      console.log(`    Op ${op}: ${count} occurrences`);
    });
    
    console.log('\n💡 Solution: Need to deduplicate routings by job_number + operation_number');
    console.log('   Strategy: Keep first occurrence or merge data from duplicates');
    
  } catch (error) {
    console.error('❌ Check failed:', error.message);
    console.error(error.stack);
  }
}

// Run the check
checkDuplicates();