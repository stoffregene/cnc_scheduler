# CNC Manufacturing Scheduler

A comprehensive scheduling application designed for CNC manufacturing businesses, built with Lean 6S principles in mind.

## Features

### 🏭 Lean 6S Manufacturing Focus
- **Sort**: Organized job and machine management
- **Set in Order**: Structured scheduling and workflow
- **Shine**: Clean, intuitive interface
- **Standardize**: Consistent processes and procedures
- **Sustain**: Long-term efficiency and continuous improvement
- **Safety**: Built-in safety considerations and protocols

### 📊 Core Functionality
- **Dashboard**: Kanban-style view of machines and assigned jobs
- **Job Management**: Import and manage jobs from JobBoss ERP system
- **Employee Directory**: Manage schedules, shifts, and availability
- **Machine Directory**: Configure machines with substitution logic
- **Smart Scheduling**: Intelligent job assignment and machine substitution

## Tech Stack

- **Frontend**: React with TypeScript
- **Backend**: Node.js with Express
- **Database**: PostgreSQL
- **UI Framework**: Material-UI (MUI)
- **State Management**: React Context API
- **File Processing**: CSV import/export functionality

## Quick Start

1. **Install Dependencies**
   ```bash
   npm run install-all
   ```

2. **Setup Database**
   ```bash
   npm run setup-db
   ```

3. **Start Development Servers**
   ```bash
   npm run dev
   ```

4. **Access the Application**
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:5000

## Project Structure

```
cnc-scheduler/
├── client/                 # React frontend
│   ├── src/
│   │   ├── components/     # Reusable UI components
│   │   ├── pages/         # Main application pages
│   │   ├── contexts/      # React context providers
│   │   ├── services/      # API service functions
│   │   └── types/         # TypeScript type definitions
├── server/                # Node.js backend
│   ├── routes/            # API route handlers
│   ├── models/            # Database models
│   ├── middleware/        # Express middleware
│   └── utils/             # Utility functions
└── database/              # Database schemas and migrations
```

## Database Schema

### Core Tables
- **jobs**: Job information from JobBoss
- **machines**: Machine configurations and capabilities
- **employees**: Employee information and schedules
- **schedules**: Job assignments and scheduling data
- **machine_groups**: Machine categorization for substitution logic

## API Endpoints

### Jobs
- `GET /api/jobs` - Get all jobs
- `POST /api/jobs/import` - Import jobs from CSV
- `PUT /api/jobs/:id` - Update job

### Machines
- `GET /api/machines` - Get all machines
- `POST /api/machines` - Create new machine
- `PUT /api/machines/:id` - Update machine

### Employees
- `GET /api/employees` - Get all employees
- `POST /api/employees` - Create new employee
- `PUT /api/employees/:id` - Update employee

## Scheduling System Implementation Plan

### 🎯 Implementation Phases

#### **Phase 1: Foundation (Database + Core Logic)**
- **Machine Hierarchy**: Multi-tier machine groups with substitution rules
  - Parent groups (e.g., "MILL") can accept any sub-group jobs
  - Explicit machine routing prevents substitution
- **Enhanced Scheduling Tables**: 15-minute time slot granularity
- **Backward Scheduling Algorithm**: 28-day lead time optimization
- **Priority Scoring System**: Overdue jobs + customer frequency weighting

#### **Phase 2: Scheduling Engine**
- **Auto-Scheduler**: Sequential operation constraints (no parallel ops)
- **Machine + Operator Pairing**: Best-fit selection with availability checking
- **Conflict Resolution**: Priority → Created Date → Alphabetical tiebreakers
- **Employee Availability Integration**: Time-off constraint handling

#### **Phase 3: Dual UI Implementation**
- **Calendar Grid View**: Weekly/daily with 15-minute increments
- **Kanban Machine Boards**: Scrollable job queues per machine
- **Drag-and-Drop Manual Override**: Fine-tune auto-scheduled assignments
- **Real-time Save**: Immediate persistence of schedule changes

#### **Phase 4: Advanced Features**
- **Auto-Rescheduling Triggers**: Employee time-off impact handling
- **Customer Priority Weighting**: Frequent customer preference system
- **Schedule Optimization**: Continuous improvement suggestions
- **JobBoss Integration**: One-way CSV import data flow

### 🔧 Technical Requirements

#### **Scheduling Constraints**
- **No Job Overlap**: Sequential scheduling with priority-based queuing
- **Machine Substitution**: Group-level flexibility with tier restrictions
- **Operator Exclusivity**: One machine per operator at any time
- **Route Sequencing**: Strict operation order enforcement
- **Employee Availability**: Time-off entries trigger rescheduling

#### **Business Logic**
- **Lead Time**: 28-day backward scheduling from promised date
- **Priority Algorithm**: Due date + customer frequency + manual priority
- **Time Granularity**: 15-minute scheduling increments
- **Conflict Resolution**: Automated tiebreaker hierarchy

## Contributing

This application is designed specifically for CNC manufacturing operations. When contributing, please consider Lean 6S principles and manufacturing best practices.

## License

MIT License - see LICENSE file for details
