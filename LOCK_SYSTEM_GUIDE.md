# Job & Operation Lock System Guide

## Overview
The lock system prevents accidental changes to jobs and operations that are in progress or have special priority. There are both automatic and manual locking mechanisms.

## How to Identify Locked Jobs/Operations

### Visual Indicators:
1. **🔒 Lock Icon**: Appears next to job numbers that are locked
2. **"Locked" Chip**: Orange chip shown on locked operations  
3. **Tooltip on Hover**: Shows the lock reason when hovering over lock icons
4. **Disabled Delete Button**: Delete buttons are grayed out for locked items

### Locations:
- **Scheduling Page** (`/scheduling`): Lock icons next to job numbers in the pending jobs list
- **Job Management** (`/jobs`): Lock icons on job cards
- **Dashboard** (`/`): Lock icons on job summary cards
- **Schedule View** (`/schedule`): "Locked" chips on individual operations

## Automatic Locking

Jobs and operations are automatically locked when:
1. **Operation Started**: When an operation status changes to "started", "in_progress", or "completed"
2. **Trigger Effect**: The database automatically locks both the operation AND its parent job

## Manual Locking

### How to Lock a Job:
1. **Open Job Details**: Click on any job to open its detail modal
2. **Click "Lock Job" Button**: Orange button with lock icon in the dialog footer
3. **Confirmation**: Job will be locked with reason "Manual lock - Protected from changes"

### How to Unlock a Job:
1. **Open Job Details**: Click on the locked job
2. **Click "Unlock Job" Button**: Orange button appears for locked jobs
3. **Restrictions**: Cannot unlock if operations are started/in progress

### Lock Rules:
- **Locked jobs CANNOT be**:
  - Deleted
  - Rescheduled (displaced)
  - Have their operations moved
  
- **Locked jobs CAN still**:
  - Be viewed
  - Have priority updated
  - Have notes added

## API Endpoints (For Developers)

### Lock a Job
```bash
POST /api/locks/job/{jobId}/lock
Body: { "reason": "Custom lock reason" }
```

### Unlock a Job
```bash
POST /api/locks/job/{jobId}/unlock
```

### Check Lock Status
```bash
GET /api/locks/job/{jobId}
```

### Lock/Unlock Specific Operation
```bash
POST /api/locks/operation/{slotId}/lock
POST /api/locks/operation/{slotId}/unlock
```

## Business Rules

1. **Started Operations**: Cannot be unlocked until completed or reset
2. **Firm Zone Protection**: Jobs within 14 days of promise date get additional protection
3. **Priority Displacement**: Locked jobs cannot be displaced by higher priority jobs
4. **Cascade Locking**: Locking a job locks all its scheduled operations

## Common Use Cases

### Scenario 1: High Priority Customer Order
**Action**: Manually lock the job after scheduling
**Result**: Job schedule protected from displacement by other jobs

### Scenario 2: Operation In Progress
**Action**: Mark operation as "started" in the system
**Result**: Auto-locks both operation and parent job

### Scenario 3: Critical Delivery Date
**Action**: Lock job when within firm zone (14 days of promise)
**Result**: Schedule frozen to ensure on-time delivery

### Scenario 4: Material Already Cut
**Action**: Lock the job after material processing begins
**Result**: Prevents schedule changes that would waste material

## Troubleshooting

### "Cannot unlock job with started operations"
- **Cause**: One or more operations have status of started/in_progress
- **Solution**: Complete or reset the operations first

### Lock icon not appearing
- **Cause**: UI may need refresh after lock status change
- **Solution**: Refresh the page (F5) to see updated lock status

### Cannot delete locked job
- **Cause**: This is by design - locks prevent deletion
- **Solution**: Unlock the job first, then delete

## Best Practices

1. **Document Lock Reasons**: Always provide clear reasons when manually locking
2. **Review Locks Regularly**: Unlock completed jobs to free up scheduling flexibility
3. **Use Automatic Locks**: Let the system auto-lock when operations start
4. **Respect Firm Zones**: Don't unlock jobs close to promise dates without good reason

---

*Lock system ensures schedule integrity and prevents accidental disruption of critical jobs.*