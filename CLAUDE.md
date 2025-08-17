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
- [x] **Job detail modals with comprehensive scheduling information** ✅ NEW
- [x] **Clickable navigation to schedule calendar from job details** ✅ NEW

### Intelligent Validation Features:
1. **Machine Compatibility**: Prevents moving production operations to INSPECT machines and vice versa
2. **Employee Assignment**: Automatically finds qualified operators when moving between machines
3. **Sequence Validation**: Prevents dragging operations out of their proper sequence order
4. **Conflict Resolution**: Offers automatic job rescheduling for invalid moves

### Job Detail Modal Features:
1. **Comprehensive Scheduling Display**: Shows scheduled machine name, assigned operator, start time, and actual duration for each operation
2. **Visual Status Indicators**: Green "Scheduled" chips for operations that have been scheduled
3. **Direct Calendar Navigation**: Clickable start times that navigate to the specific date in schedule view
4. **Consistent Interface**: Unified modal design across all pages (Scheduling, Machine Queues, Job Management, Dashboard)
5. **Clean Operation Display**: Shows operation number only (e.g., "Op 1") without redundant sequence information

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

## Phase 3: User Authentication & Access Control ✅ COMPLETED
### Features Implemented:
- [x] **JWT-Based Authentication System** - Secure token-based authentication with bcrypt password hashing
- [x] **User Management Database Schema** - Users table with roles (admin, user, viewer) and activity tracking
- [x] **Authentication Middleware** - Server-side JWT verification and role-based access control
- [x] **Login Page Component** - Responsive login interface with proper error handling
- [x] **Admin User Management Interface** - Full CRUD operations for user accounts
- [x] **Protected Routes** - Authentication guards for all application routes
- [x] **Role-Based Navigation** - Dynamic menu system that adapts to user permissions
- [x] **Session Management** - Automatic logout on token expiration with persistent sessions

### Authentication Features:
1. **Secure Login System**: JWT tokens with 24-hour expiration
2. **Role-Based Access**: Admin, User, and Viewer permission levels
3. **Admin Controls**: Full user management (create, edit, delete, password reset)
4. **Responsive Design**: Login page matches application theme (#E82A2A branding)
5. **Default Admin Account**: Username: `admin`, Password: `admin123` (change in production)
6. **Auto-Logout**: Proper cleanup of authentication state on logout

### Key Files:
- `server/routes/auth.js` - Authentication endpoints (login, logout, change password)
- `server/routes/users.js` - User management endpoints (admin only)
- `server/middleware/auth.js` - JWT verification and role checking
- `client/src/contexts/AuthContext.js` - React authentication context
- `client/src/pages/Login.js` - Login page component
- `client/src/pages/UserManagement.js` - Admin user management interface
- `client/src/components/ProtectedRoute.js` - Route protection wrapper

## Phase 4: Advanced Features 🚧 IN PROGRESS
### Current Status:
- [x] Build collision detection and automatic rescheduling on conflicts
- [x] Fix auto-scheduling workload distribution (session tracking)
- [ ] Implement priority-based displacement system
- [ ] Add job locking mechanism
- [ ] Build displacement logging system
- [ ] Add schedule optimization features

### Next Priority Tasks:
1. **Priority System** - Customer tiers and urgency-based scoring
2. **Lock System** - Prevent displacement of started/critical jobs
3. **Displacement Engine** - Smart job displacement with cascade handling
4. **Optimization** - Global schedule optimization algorithm

## API Endpoints

### Authentication
- `POST /api/auth/login` - User login (username/email + password)
- `GET /api/auth/me` - Get current user info (requires auth token)
- `POST /api/auth/logout` - User logout
- `POST /api/auth/change-password` - Change user password (requires auth token)

### User Management (Admin Only)
- `GET /api/users` - List all users
- `GET /api/users/:id` - Get specific user details
- `POST /api/users` - Create new user
- `PUT /api/users/:id` - Update user
- `DELETE /api/users/:id` - Delete user
- `POST /api/users/:id/reset-password` - Reset user password

### Jobs
- `GET /api/jobs` - List all jobs with routings
- `GET /api/jobs/:id` - Get specific job details
- `GET /api/jobs/:id/routings` - Get job routings with scheduling information (machine names, operators, start times)
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
- `users` - User accounts with authentication and role management
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

### Manual Rescheduling System ✅ COMPLETED:
1. **Drag-and-Drop Removed**: Eliminated complex drag-and-drop interface per user feedback that it was "almost useless"
2. **Enhanced Manual Rescheduling**: Added comprehensive date picker with machine selection capabilities
3. **Smart Machine Filtering**: INSPECT operations only show INSPECT machines, production operations exclude INSPECT machines
4. **Machine Swapping**: Full capability to change operation machines with automatic operator reassignment
5. **Trickle-Down Scheduling**: Automatically reschedules all subsequent operations when moving any operation
6. **Visual Summary Modal**: Shows detailed summary of what operations were moved and where

### Critical Schedule Fixes ✅ RESOLVED:

**1. Employee Work Hours Fix**:
- **Issue**: Scheduler using default 8 AM - 5 PM instead of actual schedules
- **Solution**: Fixed database function to prioritize `employee_work_schedules` table
- **Result**: Now uses accurate hours (e.g., Drew: 4:30 AM - 3 PM, Kyle: 6 AM - 4:30 PM)

**2. SAW/Waterjet 24-Hour Lag Time Fix**:
- **Issue**: HMC operations couldn't be scheduled after SAW due to validation conflicts
- **Solution**: Fixed slot generation to respect minimum start time within shifts
- **Technical Fix**: Changed from `$3::date + interval` to `$3::timestamp + interval` in query
- **Result**: Properly enforces 24-hour minimum lag while allowing flexible scheduling

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
- Manual rescheduling system with date picker and machine selection

### Backend:
- RESTful API design
- Service layer pattern for business logic
- Transaction-based database operations
- Comprehensive error handling and logging

### Data Flow:
1. User interacts with manual rescheduling controls in modal interface
2. Frontend validates date and machine selection
3. Backend performs business logic validation and machine swapping
4. Database updates with proper transaction handling
5. Frontend refreshes data and shows summary modal

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

## Current Todo List Status ✅ ALL COMPLETED

### Authentication System Implementation ✅ COMPLETED (December 2024):
1. ✅ **User Authentication Database Schema** - Added users table with roles, password hashing, activity tracking
2. ✅ **JWT Authentication Middleware** - Server-side token verification with role-based access control
3. ✅ **User Management API Endpoints** - Complete CRUD operations for user accounts (admin only)
4. ✅ **Login Page Component** - Responsive login interface matching application theme
5. ✅ **Admin User Management Page** - Full interface for managing users, roles, and permissions
6. ✅ **Authentication Guards** - Protected routes with role-based access control
7. ✅ **Navigation Updates** - Dynamic menu system with logout functionality and user avatar

### Previously Completed Tasks:
1. ✅ **Manual Rescheduling Date Picker** - Added comprehensive date picker to job detail modal
2. ✅ **Trickle-Down Rescheduling** - Implemented automatic rescheduling of subsequent operations
3. ✅ **Employee Schedule Validation** - Fixed and validated operator working hours integration
4. ✅ **Chunk Handling** - Fixed manual rescheduling to move ALL chunks of multi-day operations
5. ✅ **Dependent Operations** - Ensured INSPECT and subsequent operations get rescheduled properly
6. ✅ **Date Validation** - Fixed timezone issues and employee work day validation
7. ✅ **Visual Summary** - Added summary modal showing what operations were moved where
8. ✅ **Forward vs Backward Scheduling** - Implemented smart scheduling direction based on operation sequence
9. ✅ **Partial vs Full Reschedule** - Smart logic to only reschedule current + subsequent operations
10. ✅ **Drag-and-Drop Removal** - Completely removed drag-and-drop functionality per user feedback
11. ✅ **Machine Selection Enhancement** - Added machine/machine group selection to manual rescheduling
12. ✅ **Machine Swapping Capability** - Full support for changing operation machines with operator reassignment
13. ✅ **Job Detail Modals Enhancement** - Added comprehensive scheduling information display to all job modals
14. ✅ **Calendar Navigation Links** - Added clickable start times that navigate directly to schedule view
15. ✅ **Modal UI Cleanup** - Removed redundant sequence fields, simplified operation display
16. ✅ **Pick Order Classification** - Implemented logic to identify pick orders (pick_qty = make_qty)
17. ✅ **Manufacturing vs Pick Order Separation** - Pick orders excluded from manufacturing schedule
18. ✅ **CSV Parser V2 Enhancement** - Added pick order detection to JobBossCSVParserV2

### Pick Order System ✅ COMPLETED:
1. **Classification Logic**: Jobs where pick_qty = make_qty are identified as pick orders
2. **Manufacturing Exclusion**: Pick orders don't appear in manufacturing schedule as no production required
3. **Separate Tracking**: Pick orders tracked separately for fulfillment/shipping purposes
4. **Enhanced Import Process**: Import script separates 292 manufacturing jobs from 1 pick order
5. **Visual Identification**: Pick orders marked with "Pick Order - No Manufacturing Required" in special instructions

### Outstanding Issues to Fix:
- **Partial Reschedule Bug**: When rescheduling later operations (HMC, INSPECT), the system says "Job already scheduled" because SAW operation still exists. Need to improve the scheduling service to handle partial reschedules properly.

## Priority-Based Displacement System (IN DEVELOPMENT)

### Priority Scoring System
**Customer Tiers:**
- **Top Tier (400 pts)**: MAREL, POUL, NCS (>80% of business)
- **Mid Tier (200 pts)**: ACCU MOLD, GRIPTITE, KATECHO
- **Standard Tier (0 pts)**: All other customers

**Priority Calculation (0-1000 scale):**
1. Customer Tier: 0-400 points (highest weight)
2. Already Late: 250 points (past promised date)
3. Expedite Flag: 200 points (<28 days order-to-promise)
4. Days to Promised: 0-150 points (urgency factor)
5. Job Type: 50 points (assembly parents)
6. Assembly Children: Parent score + 50 points
7. Outsourcing Lead Time: 0-100 points (5 pts/day)

**Color Coding:**
- 800-1000: Red (#ef4444) - Critical
- 600-799: Orange (#f97316) - High
- 300-599: Yellow (#eab308) - Medium
- 0-299: Green (#22c55e) - Standard

### Lock System
**Auto-Lock Triggers:**
- Operations marked as started/in_progress/completed
- Manual lock via Schedule View or Job Details
- Assembly children auto-lock when parent is locked

**Lock Rules:**
- Only unlocked operations can be displaced
- Locked jobs show with dark gray background (#1f2937) and orange border
- Override requires confirmation dialog
- Locks remain until manually removed (no expiration)

### Displacement Rules
**Displacement Triggers:**
- CSV imports with high-priority jobs
- Schedule All operation
- Manual "Optimize All" button

**Displacement Thresholds:**
- Minimum 15% priority difference required
- Firm Zone Protection: Jobs within 14 days of promise date cannot be displaced
- Assembly dependencies are never broken

**Smart Placement:**
- Respects explicit machine assignments from routings
- Can swap within machine groups for flexibility
- No automatic batching during displacement

### Displacement Logging
**Log Configuration:**
- 45-day rolling window retention
- Manual clear capability
- Bottom console panel on Schedule View

**Log Format:**
```
[Timestamp] Action Type
📦 Job 12345 → May 15
├─→ Job 12346 → May 16
│  └─→ Job 12347 → May 17 ⚠️ PAST DUE
└─→ Job 12348 → May 18
```

**Tracked Events:**
- Manual job moves with cascade effects
- Auto-scheduler displacements
- CSV imports causing displacements
- What-if scenarios (preview without execution)

**Undo Capability:**
- 10-minute window for recent displacements
- Lightweight state storage (max 10 undo entries)

### Required Acknowledgments
**Alerts triggered for:**
- High-priority customer jobs being displaced
- Jobs pushed past their due date
- Multiple jobs affected (>5) requires manual confirmation

## Mobile Network Access Configuration 📱🌐

### Overview
Complete guide for enabling mobile device access to the CNC Scheduler application on local networks. This configuration is **100% secure** and does NOT expose the application to the internet.

### Security Architecture
- ✅ **Local Network Only**: Devices on 192.168.1.x subnet only
- ✅ **No Internet Exposure**: No port forwarding or public access
- ✅ **Windows Firewall Protected**: Specific rules for local network only
- ✅ **PostgreSQL Access Control**: Database restricted to local subnet

### Step-by-Step Configuration

#### 1. PostgreSQL Network Configuration

**A. Configure PostgreSQL to Accept LAN Connections**

Edit `C:\Program Files\PostgreSQL\17\data\postgresql.conf`:
```conf
# Already set by default in PostgreSQL 17:
listen_addresses = '*'
```

**B. Configure Client Authentication**

Edit `C:\Program Files\PostgreSQL\17\data\pg_hba.conf`:
```conf
# Add this line after the existing IPv4 local connections:
# Local network connections (192.168.1.x):
host    all             all             192.168.1.0/24          scram-sha-256
```

**C. Reload PostgreSQL Configuration**
```bash
# From server directory:
node reload-pg-config.js
```

#### 2. Windows Firewall Configuration

**Add PostgreSQL Firewall Rule** (requires Administrator privileges):
```cmd
netsh advfirewall firewall add rule name="PostgreSQL Local Network" dir=in action=allow protocol=TCP localport=5432 remoteip=192.168.1.0/24
```

Or via PowerShell:
```powershell
New-NetFirewallRule -DisplayName 'PostgreSQL Local Network' -Direction Inbound -Protocol TCP -LocalPort 5432 -RemoteAddress 192.168.1.0/24 -Action Allow
```

#### 3. Application Configuration

**A. Determine Server IP Address**
```cmd
ipconfig
# Note the IPv4 Address (e.g., 192.168.1.14)
```

**B. Update API Service Configuration**

Edit `client/src/services/apiService.js`:
```javascript
// Replace hostname with actual IP address
const apiBaseURL = 'http://192.168.1.14:5000'; // Use your server's IP
```

**C. Update Environment Configuration**

Edit `client/.env`:
```env
DANGEROUSLY_DISABLE_HOST_CHECK=true
REACT_APP_API_URL=http://192.168.1.14:5000
```

#### 4. Restart Services

**A. Restart React Development Server**
```bash
cd client && npm start
```

**B. Ensure Node.js Server is Running**
```bash
cd server && npm start
```

### Testing Mobile Access

#### 1. Access URLs
- **React App**: `http://192.168.1.14:3000`
- **API Health Check**: `http://192.168.1.14:5000/api/health`
- **Database Test**: `http://192.168.1.14:5000/api/test-database`

#### 2. Troubleshooting

**Common Issues:**

1. **"amtapp.local not found"**
   - **Solution**: Use IP address instead of hostname
   - Mobile devices often can't resolve .local domains

2. **Connection timeout after 30 seconds**
   - **Check**: Windows Firewall rule is properly configured
   - **Check**: PostgreSQL is accepting connections from network

3. **"Network error" on mobile**
   - **Check**: Mobile device is on same subnet (192.168.1.x)
   - **Check**: React app is using IP address in API calls

**Verification Commands:**
```bash
# Check PostgreSQL is listening on all interfaces
netstat -an | findstr :5432

# Check firewall rules
netsh advfirewall firewall show rule name="PostgreSQL Local Network"

# Test database connectivity
psql -h 192.168.1.14 -U postgres -d cnc_scheduler
```

#### 3. Server Logs

Monitor successful mobile connections:
```bash
# Watch for mobile user agents and IP addresses
# Example successful login:
🔄 Login attempt: {
  ip: '::ffff:192.168.1.7',
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X)...',
  timestamp: '2025-08-17T03:08:09.178Z',
  hasUsername: true,
  hasPassword: true
}
✅ Login successful: {
  userId: 1,
  username: 'admin',
  ip: '::ffff:192.168.1.7',
  timestamp: '2025-08-17T03:08:09.257Z'
}
```

### On-Site Deployment Checklist

#### Pre-Deployment
- [ ] Identify server computer's IP address on local network
- [ ] Ensure PostgreSQL 17 is installed and running
- [ ] Have administrator access for firewall configuration

#### Configuration Steps
- [ ] Edit PostgreSQL pg_hba.conf for local network subnet
- [ ] Reload PostgreSQL configuration
- [ ] Add Windows Firewall rule for PostgreSQL
- [ ] Update API URLs in application code
- [ ] Update environment variables
- [ ] Restart application services

#### Testing
- [ ] Test health endpoint from mobile device
- [ ] Test database endpoint from mobile device
- [ ] Perform complete login from mobile device
- [ ] Verify all application features work on mobile

#### Security Verification
- [ ] Confirm no internet exposure (test from external network)
- [ ] Verify firewall rule is subnet-specific
- [ ] Check PostgreSQL authentication logs

### Network Topology
```
Internet ❌ (No Access)
    |
Router/Gateway (192.168.1.1)
    |
Local Network Switch (192.168.1.0/24)
    |
├── Server PC (192.168.1.14)
│   ├── PostgreSQL :5432
│   ├── Node.js API :5000
│   └── React Dev Server :3000
│
├── Mobile Device (192.168.1.7)
├── Tablet (192.168.1.x)
└── Other Local Devices (192.168.1.x)
```

### Important Notes
- **IP Address Dependency**: Configuration is tied to specific IP address
- **DHCP Considerations**: Use static IP for server or update configuration if IP changes
- **Development vs Production**: This guide is for development/local deployment
- **Subnet Flexibility**: Adjust 192.168.1.0/24 to match your local network

---

*Last Updated: August 17, 2025*
*Current Phase: Phase 3 - Advanced Features + Mobile Network Access ✅*
*Next Milestone: Implement priority-based displacement system*