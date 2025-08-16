# Displacement Engine Testing Guide

## 🎯 Overview
The displacement engine automatically handles scheduling conflicts by moving lower priority jobs to make room for higher priority ones. Here's how to test all the features.

## 🧪 Testing Methods

### Method 1: Database Test Scripts (Comprehensive)

Run the comprehensive test scenario:
```bash
cd server
node test-displacement-scenarios.js
```

This script:
- ✅ Clears existing schedules
- ✅ Schedules lower priority jobs first  
- ✅ Tests displacement opportunities
- ✅ Tests impact analysis
- ✅ Tests actual displacement execution
- ✅ Tests rescheduling of displaced jobs
- ✅ Tests displacement history and analytics

### Method 2: API Endpoint Testing

Test the REST API endpoints:
```bash
cd server
node test-displacement-api.js
```

This tests all displacement API endpoints:
- `GET /api/displacement/opportunities/:jobId` - Find displacement opportunities
- `GET /api/displacement/impact/:jobId` - Calculate impact analysis  
- `POST /api/displacement/schedule/:jobId` - Schedule with displacement
- `GET /api/displacement/history` - View displacement history
- `GET /api/displacement/analytics` - Get displacement analytics
- `GET /api/displacement/details/:logId` - Get detailed displacement info
- `POST /api/displacement/execute` - Manual displacement execution

### Method 3: Frontend Testing

1. **Navigate to Job Management**
2. **Schedule lower priority jobs first** (manually or via "Schedule All")
3. **Try to schedule a higher priority job** - displacement will trigger automatically
4. **View results** in the schedule calendar and machine queues

## 🔧 Manual Testing Scenarios

### Scenario 1: Basic Priority Displacement

1. **Setup**: Schedule job with priority score 50
2. **Test**: Try to schedule job with priority score 200  
3. **Expected**: Higher priority job displaces lower priority job
4. **Verify**: Check displacement logs and rescheduling

### Scenario 2: Firm Zone Protection

1. **Setup**: Schedule job due within 14 days
2. **Test**: Try to displace with higher priority job
3. **Expected**: Displacement blocked by firm zone protection
4. **Verify**: Job remains scheduled, displacement denied

### Scenario 3: Lock Protection

1. **Setup**: Schedule and lock a job (started operation)
2. **Test**: Try to displace with higher priority job
3. **Expected**: Displacement blocked by lock protection  
4. **Verify**: Locked job remains scheduled

### Scenario 4: Multiple Job Displacement

1. **Setup**: Schedule several lower priority jobs
2. **Test**: Schedule high priority job needing multiple slots
3. **Expected**: Multiple jobs displaced, all rescheduled
4. **Verify**: Check displacement details and delay calculations

## 📊 Key Metrics to Monitor

### Displacement Rules
- **Priority Threshold**: 15% minimum difference required
- **Firm Zone**: 14 days before promise date = protected
- **Lock Protection**: Started jobs cannot be displaced

### Success Indicators
- ✅ Higher priority job scheduled successfully
- ✅ Displaced jobs rescheduled automatically
- ✅ Complete audit trail in displacement logs
- ✅ Business rules enforced correctly

### Analytics to Check
- Total displacements performed
- Success rate of displacements
- Average execution time
- Customers most affected
- Average delay introduced

## 🎛️ Advanced Testing

### API Testing with curl

Test displacement opportunities:
```bash
curl "http://localhost:5000/api/displacement/opportunities/1234?requiredHours=8"
```

Test displacement impact:
```bash
curl "http://localhost:5000/api/displacement/impact/1234"
```

Schedule with displacement:
```bash
curl -X POST "http://localhost:5000/api/displacement/schedule/1234" \
  -H "Content-Type: application/json" \
  -d '{"test": true}'
```

Get displacement history:
```bash
curl "http://localhost:5000/api/displacement/history?limit=10"
```

### Database Queries for Verification

Check displacement logs:
```sql
SELECT * FROM displacement_logs ORDER BY timestamp DESC LIMIT 10;
```

Check displacement details:
```sql
SELECT * FROM displacement_details WHERE displacement_log_id = 1;
```

Check displacement impact:
```sql
SELECT * FROM displacement_impact WHERE displacement_log_id = 1;
```

## 🔍 Troubleshooting

### No Displacement Opportunities Found
**Cause**: No existing scheduled jobs to displace
**Solution**: Schedule some lower priority jobs first

### Displacement Denied - Firm Zone
**Cause**: Target jobs are within 14 days of promise date  
**Solution**: Expected behavior - firm zone protection working

### Displacement Denied - Insufficient Priority  
**Cause**: Priority difference less than 15%
**Solution**: Expected behavior - priority threshold working

### Rescheduling Failed
**Cause**: Displaced jobs couldn't find new slots
**Solution**: Check machine availability and operator schedules

## 📈 Performance Testing

Test with larger datasets:
```bash
# Schedule 50+ jobs first
node test-schedule-all-jobs.js

# Then test displacement
node test-displacement-scenarios.js
```

Monitor execution times and ensure displacement completes within reasonable time (< 5 seconds for typical scenarios).

## ✅ Test Checklist

### Core Functionality
- [ ] Priority-based displacement (15% threshold)
- [ ] Firm zone protection (14 days)  
- [ ] Lock protection (started jobs)
- [ ] Multiple job displacement
- [ ] Automatic rescheduling

### API Endpoints
- [ ] All displacement endpoints respond
- [ ] Proper error handling
- [ ] Correct response formats
- [ ] Parameter validation

### Business Logic
- [ ] Displacement rules enforced
- [ ] Impact analysis accurate
- [ ] Audit trail complete
- [ ] Analytics calculation correct

### Edge Cases
- [ ] No displacement opportunities
- [ ] All jobs protected (firm zone/locked)
- [ ] Circular displacement scenarios
- [ ] Large dataset performance

## 🎉 Success Criteria

The displacement engine is working correctly when:

1. **Higher priority jobs can displace lower priority jobs** (with 15% threshold)
2. **Protected jobs remain protected** (firm zone and locks)  
3. **Displaced jobs get rescheduled automatically**
4. **Complete audit trail is maintained**
5. **Business impact is calculated accurately**
6. **All API endpoints function correctly**
7. **Performance is acceptable** (< 5 seconds typical scenarios)

This displacement engine provides intelligent, rule-based job scheduling with full transparency and business protection!