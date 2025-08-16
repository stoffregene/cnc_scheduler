const axios = require('axios');

async function checkQueue() {
  try {
    console.log('🔍 Checking Inspection Queue...\n');
    
    const result = await axios.get('http://localhost:5000/api/inspection/queue');
    console.log(`Items found: ${result.data.count}`);
    
    if (result.data.count === 0) {
      console.log('❌ No items in inspection queue');
    } else {
      console.log('✅ Inspection queue contents:');
      result.data.queue.forEach((item, idx) => {
        console.log(`  ${idx + 1}. Job ${item.job_number} Op ${item.operation_number}: ${item.operation_name}`);
        console.log(`     Status: ${item.status}, Priority: ${item.priority_score}`);
        console.log(`     Hours in queue: ${parseFloat(item.hours_in_queue || 0).toFixed(2)}`);
        console.log(`     Next operation: ${item.next_operation || 'None'}`);
      });
    }
    
    // Check analytics
    console.log('\n📊 Analytics:');
    const analyticsResult = await axios.get('http://localhost:5000/api/inspection/analytics');
    const analytics = analyticsResult.data.analytics.summary;
    
    console.log(`   Total items: ${analytics.total_items}`);
    console.log(`   Awaiting: ${analytics.awaiting_count}`);
    console.log(`   In Progress: ${analytics.in_progress_count}`);
    console.log(`   Completed: ${analytics.completed_count}`);
    
  } catch (error) {
    console.error('❌ Error checking queue:', error.response?.data?.error || error.message);
  }
}

checkQueue();