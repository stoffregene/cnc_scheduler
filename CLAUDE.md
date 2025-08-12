# CNC Manufacturing Scheduler Development Progress

## Project Overview
A comprehensive React/Node.js/PostgreSQL application for CNC manufacturing job scheduling with drag-and-drop functionality, intelligent employee assignment, and automated conflict resolution.

## Technology Stack
- **Frontend**: React, Material-UI, @dnd-kit (drag-and-drop), date-fns
- **Backend**: Node.js, Express, PostgreSQL
- **Database**: PostgreSQL with complex relational schema
- **Key Libraries**: react-hot-toast, axios, multer, csv-parser

## Phase 1: Core Scheduling Engine ✅ COMPLETED
### Features Implemented:
- [x] PostgreSQL database schema with proper relationships
- [x] Job management (CRUD operations, CSV import)
- [x] Machine and employee management 
- [x] Automated backward scheduling algorithm
- [x] Employee shift pattern integration
- [x] REST API endpoints for all core functionality
- [x] Basic React frontend with routing

### Key Files:
- `server/services/schedulingService.js` - Core scheduling logic
- `server/routes/*.js` - API endpoints
- `database/migrations/*.sql` - Database schema

## Phase 2: Visual Scheduling System ✅ COMPLETED
### Features Implemented:
- [x] Calendar/Gantt view with week/day/month modes
- [x] Drag-and-drop manual override functionality
- [x] Machine queue boards (Kanban-style)
- [x] Employee assignment preservation during moves
- [x] Automatic operator assignment for cross-machine moves
- [x] Operation-machine compatibility validation
- [x] Unschedule/reschedule job functionality
- [x] **Operation sequence validation (prevent out-of-order dragging)** ✅ NEW

### Intelligent Validation Features:
1. **Machine Compatibility**: Prevents moving production operations to INSPECT machines and vice versa
2. **Employee Assignment**: Automatically finds qualified operators when moving between machines
3. **Sequence Validation**: Prevents dragging operations out of their proper sequence order
4. **Conflict Resolution**: Offers automatic job rescheduling for invalid moves

### Key Files:
- `client/src/pages/ScheduleView.js` - Main drag-and-drop scheduling interface
- `server/routes/scheduling.js` - Scheduling API endpoints including reschedule/unschedule
- `server/routes/jobs.js` - Added `/api/jobs/:id/routings` endpoint for sequence validation
- `server/routes/machines.js` - Machine operators endpoint

### Validation Logic:
```javascript
// Machine compatibility check
const isIncompatibleMove = 
  (!isInspectOperation && isTargetInspectMachine) || 
  (isInspectOperation && !isTargetInspectMachine);

// Sequence validation 
const validateOperationSequence = async (draggedSlot, targetDay) => {
  // Prevents scheduling operations before prerequisites
  // Prevents scheduling operations after subsequent operations
}
```

## Phase 3: Advanced Features 🚧 IN PROGRESS
### Current Status:
- [x] ~~Build collision detection and automatic rescheduling on conflicts~~
- [ ] Add employee workload visualization 
- [ ] Implement conflict resolution interface
- [ ] Build job displacement analysis - "what if" rescheduling impact visualization

### Next Priority Tasks:
1. **Collision Detection** - Detect overlapping schedules and auto-resolve
2. **Employee Workload Visualization** - Show employee capacity and utilization
3. **Conflict Resolution Interface** - UI for managing scheduling conflicts
4. **Impact Analysis** - Show downstream effects of schedule changes

## API Endpoints

### Jobs
- `GET /api/jobs` - List all jobs with routings
- `GET /api/jobs/:id` - Get specific job details
- `GET /api/jobs/:id/routings` - Get job routing sequence for validation
- `POST /api/jobs` - Create new job
- `PUT /api/jobs/:id` - Update job
- `DELETE /api/jobs/:id` - Delete job

### Scheduling  
- `GET /api/scheduling/slots` - Get scheduled slots (supports job_id, machine_id, employee_id filters)
- `PUT /api/scheduling/slots/:id` - Update schedule slot (drag-and-drop)
- `POST /api/scheduling/schedule-job/:id` - Auto-schedule specific job
- `POST /api/scheduling/reschedule-job/:id` - Unschedule and reschedule job
- `DELETE /api/scheduling/unschedule-job/:id` - Clear job schedule
- `GET /api/scheduling/available-slots` - Find optimal time slots for operations

### Machines
- `GET /api/machines` - List all machines
- `GET /api/machines/:id/operators` - Get qualified operators for machine

## Database Schema Notes

### Key Tables:
- `jobs` - Job master data
- `job_routings` - Operations with sequence_order for validation
- `schedule_slots` - Scheduled time slots
- `machines` - CNC machines
- `employees` - Workers (contains fallback schedule data)
- `employee_work_schedules` - **PRIMARY** source for operator work hours 
- `employee_shift_schedule` - Alternative schedule configuration
- `operator_machine_assignments` - Employee qualifications

### Employee Schedule Architecture:
**Data Sources (in priority order):**
1. **`employee_work_schedules`** - Actual operator schedules used by frontend (/operator-schedule)
2. **`employee_shift_schedule`** - Alternative schedule configuration
3. **`employees`** table - Fallback with custom_start_hour, custom_end_hour fields

**Database Function**: `get_employee_working_hours(employee_id, date)` 
- Used by scheduling service to determine operator availability
- Recently fixed to prioritize `employee_work_schedules` table
- Returns: start_hour, end_hour, duration_hours, is_overnight, is_working_day

### Sequence Validation:
Operations use `sequence_order` field in `job_routings` table:
- SAW operations: sequence_order = 1
- HMC operations: sequence_order = 2  
- INSPECT operations: sequence_order = 3

## Recent Fixes & Improvements

### Drag-and-Drop Enhancements:
1. **Employee Assignment Logic**: Preserves employees for same-machine moves, auto-assigns qualified operators for cross-machine moves
2. **Validation Dialogs**: User-friendly confirmation dialogs for invalid moves with auto-reschedule options
3. **Optimal Time Placement**: Uses available-slots API for intelligent scheduling instead of arbitrary defaults
4. **Sequence Enforcement**: Prevents operations from being scheduled out of order

### Critical Schedule Fix ✅ RESOLVED:
**ISSUE**: Scheduler was using incorrect employee work hours (8 AM - 5 PM for everyone) instead of actual schedules.
- **Root Cause**: Database function `get_employee_working_hours()` wasn't checking the correct `employee_work_schedules` table
- **Impact**: Jobs were scheduled outside operators' actual work hours
- **Solution**: Updated database function to prioritize `employee_work_schedules` table data
- **Result**: Scheduler now uses accurate hours (e.g., Drew: 4:30 AM - 3 PM, Kyle: 6 AM - 4:30 PM)

### Bug Fixes:
- Fixed `daysInView` variable scope issues in drag handlers
- Resolved employee assignment preservation during manual moves  
- Corrected database inconsistencies with utility scripts
- Added proper error handling for missing employee assignments
- **Fixed scheduling service to use correct employee work hours from `employee_work_schedules` table**

## Development Notes

### Testing Commands:
- `npm run dev` - Start development servers (client + server)
- `npm run lint` - Check code quality  
- `npm run typecheck` - TypeScript validation

### Environment Setup:
- Database: PostgreSQL with `DATABASE_URL` environment variable
- Ports: Client (3000), Server (5000)
- Upload directory: `server/uploads/` for CSV imports

## Architecture Patterns

### Frontend:
- Component-based React architecture
- Material-UI for consistent styling
- Custom hooks for data fetching and state management
- Drag-and-drop with @dnd-kit library

### Backend:
- RESTful API design
- Service layer pattern for business logic
- Transaction-based database operations
- Comprehensive error handling and logging

### Data Flow:
1. User interacts with drag-and-drop interface
2. Frontend validates move and calls appropriate API
3. Backend performs business logic validation
4. Database updates with proper transaction handling
5. Frontend refreshes data and updates UI

## Security Considerations
- Input validation on all endpoints
- SQL injection prevention with parameterized queries  
- File upload restrictions for CSV imports
- Environment variable protection for database credentials

## Troubleshooting

### Schedule Timing Issues
**Problem**: Jobs scheduled at wrong times or outside operator availability
**Check**: 
1. Verify `/operator-schedule` page shows correct employee hours
2. Test database function: `SELECT * FROM get_employee_working_hours(employee_id, CURRENT_DATE)`
3. Compare with API: `GET /api/employees/:id/work-schedules`
4. **Root Cause**: Usually function not using `employee_work_schedules` table

**Fix Commands**:
```sql
-- Check if function uses correct table
SELECT * FROM get_employee_working_hours(9, CURRENT_DATE); -- Test with Drew

-- If incorrect, run fix script:
node server/fix-working-hours-function.js
```

### Database Inconsistencies
**Utility Scripts Available**:
- `check-all-schedules.js` - Audit all employee schedule data
- `check-drew-details.js` - Specific employee schedule debugging  
- `fix-working-hours-function.js` - Repair schedule function
- `check-sequence-schema.js` - Validate operation sequence data

---

*Last Updated: August 12, 2025*
*Current Phase: Phase 3 - Advanced Features*
*Next Milestone: Collision Detection & Employee Workload Visualization*