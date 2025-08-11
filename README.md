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

## Contributing

This application is designed specifically for CNC manufacturing operations. When contributing, please consider Lean 6S principles and manufacturing best practices.

## License

MIT License - see LICENSE file for details
