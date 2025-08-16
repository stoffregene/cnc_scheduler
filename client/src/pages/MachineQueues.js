import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  Avatar,
  Chip,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  LinearProgress,
  Tooltip,
  IconButton,
  Paper,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  List,
  ListItem,
  ListItemText,
  Link,
} from '@mui/material';
import {
  Build as BuildIcon,
  Schedule as ScheduleIcon,
  Person as PersonIcon,
  Assignment as AssignmentIcon,
  Today as TodayIcon,
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
  Carpenter as SawIcon, // Better for saw - carpentry tool
  Water as WaterjetIcon, // Water icon for waterjet
  RotateRight as LatheIcon, // Rotation icon for lathe spinning
  Settings as MillIcon, // Gear/settings for milling
  Computer as VMCIcon, // Computer for CNC vertical machine
  Dashboard as HMCIcon, // Dashboard for horizontal machine center
  Search as InspectIcon, // Search is good for inspection
  CleaningServices as DeburrIcon, // Cleaning for deburring
  Gradient as GrindIcon, // Gradient/smooth for grinding
  Construction as DrillIcon, // Construction/drill icon
  Handyman as DefaultMachineIcon, // Generic machine
} from '@mui/icons-material';
import { format, parseISO, addDays, startOfWeek, endOfWeek, eachDayOfInterval, isSameWeek } from 'date-fns';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';

import { apiService } from '../services/apiService';

const MachineQueues = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  
  // Load saved date from localStorage
  const [currentDate, setCurrentDate] = useState(() => {
    const saved = localStorage.getItem('machineQueuesDate');
    if (saved) {
      try {
        return new Date(saved);
      } catch (e) {
        console.error('Failed to parse saved machine queues date:', e);
      }
    }
    return new Date();
  });
  
  const [machineWorkloads, setMachineWorkloads] = useState([]);
  const [selectedTimeframe, setSelectedTimeframe] = useState(() => {
    return localStorage.getItem('machineQueuesTimeframe') || 'today';
  });
  const [selectedJob, setSelectedJob] = useState(null);
  const [jobDialogOpen, setJobDialogOpen] = useState(false);
  const [jobRoutings, setJobRoutings] = useState([]);

  useEffect(() => {
    fetchMachineWorkloads();
  }, [currentDate, selectedTimeframe]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchMachineWorkloads = async () => {
    try {
      setLoading(true);
      
      let workloadData = [];
      
      if (selectedTimeframe === 'week') {
        // For weekly view, fetch data for each day of the week
        const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 }); // Monday start
        const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 }); // Sunday end
        const daysInWeek = eachDayOfInterval({ start: weekStart, end: weekEnd });
        
        // Fetch data for each day and combine
        const weeklyResponses = await Promise.all(
          daysInWeek.map(day => 
            apiService.get('/api/scheduling/machine-workload', {
              params: { date: format(day, 'yyyy-MM-dd') }
            })
          )
        );
        
        // Combine all machines from all days
        const allMachineData = {};
        weeklyResponses.forEach((response, dayIndex) => {
          const dayDate = format(daysInWeek[dayIndex], 'yyyy-MM-dd');
          response.data.forEach(machine => {
            const machineKey = machine.machine_id;
            if (!allMachineData[machineKey]) {
              allMachineData[machineKey] = {
                ...machine,
                scheduled_jobs: 0,
                total_minutes: 0,
                scheduled_jobs_detail: []
              };
            }
            
            // Accumulate jobs and minutes
            allMachineData[machineKey].scheduled_jobs += parseInt(machine.scheduled_jobs || 0);
            allMachineData[machineKey].total_minutes += parseInt(machine.total_minutes || 0);
            
            // Add jobs with day information
            if (machine.scheduled_jobs_detail && machine.scheduled_jobs_detail.length > 0) {
              machine.scheduled_jobs_detail.forEach(job => {
                allMachineData[machineKey].scheduled_jobs_detail.push({
                  ...job,
                  week_day: dayDate
                });
              });
            }
          });
        });
        
        workloadData = Object.values(allMachineData);
      } else {
        // For today/tomorrow, use single date
        const targetDate = selectedTimeframe === 'today' 
          ? format(currentDate, 'yyyy-MM-dd')
          : format(addDays(currentDate, 1), 'yyyy-MM-dd');

        const response = await apiService.get('/api/scheduling/machine-workload', {
          params: { date: targetDate }
        });
        
        workloadData = response.data;
      }
      
      setMachineWorkloads(workloadData);
    } catch (error) {
      console.error('Error fetching machine workloads:', error);
      toast.error('Failed to load machine workloads');
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status) => {
    const colors = {
      'scheduled': '#2196f3',
      'in_progress': '#ff9800', 
      'completed': '#4caf50',
      'cancelled': '#f44336'
    };
    return colors[status] || '#9e9e9e';
  };

  const getUtilizationColor = (utilization) => {
    if (utilization >= 90) return '#f44336'; // Red - overloaded
    if (utilization >= 75) return '#ff9800'; // Orange - high
    if (utilization >= 50) return '#ffc107'; // Yellow - medium
    if (utilization >= 25) return '#4caf50'; // Green - good
    return '#9e9e9e'; // Grey - low
  };

  const calculateUtilization = (totalMinutes) => {
    const dailyCapacity = 16 * 60; // 16 hours * 60 minutes (6 AM - 10 PM)
    return Math.min(100, (totalMinutes / dailyCapacity) * 100);
  };

  const formatDuration = (minutes) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours === 0) return `${mins}m`;
    if (mins === 0) return `${hours}h`;
    return `${hours}h ${mins}m`;
  };
  
  // Navigation functions
  const navigateDate = (direction) => {
    const increment = selectedTimeframe === 'week' ? 7 : 1;
    setCurrentDate(prevDate => {
      const newDate = addDays(prevDate, direction === 'next' ? increment : -increment);
      localStorage.setItem('machineQueuesDate', newDate.toISOString());
      return newDate;
    });
  };
  
  const goToToday = () => {
    const today = new Date();
    setCurrentDate(today);
    localStorage.setItem('machineQueuesDate', today.toISOString());
  };
  
  // Sort machines with jobs at top, prioritize mills/lathes
  const sortMachines = (machines) => {
    return [...machines].sort((a, b) => {
      // First priority: machines with jobs vs without
      const aHasJobs = a.scheduled_jobs > 0;
      const bHasJobs = b.scheduled_jobs > 0;
      
      if (aHasJobs && !bHasJobs) return -1;
      if (!aHasJobs && bHasJobs) return 1;
      
      // Second priority: machine type priority
      const getMachinePriority = (name) => {
        const upperName = name?.toUpperCase() || '';
        if (upperName.includes('MILL')) return 1;
        if (upperName.includes('LATHE')) return 2;
        if (upperName.includes('VMC')) return 3;
        if (upperName.includes('HMC')) return 4;
        if (upperName.includes('SAW')) return 5;
        if (upperName.includes('WJ') || upperName.includes('WATERJET')) return 6;
        if (upperName.includes('GRIND')) return 7;
        if (upperName.includes('DRILL')) return 8;
        if (upperName.includes('DEBURR')) return 9;
        if (upperName.includes('INSPECT')) return 10;
        return 99;
      };
      
      const aPriority = getMachinePriority(a.machine_name);
      const bPriority = getMachinePriority(b.machine_name);
      
      if (aPriority !== bPriority) {
        return aPriority - bPriority;
      }
      
      // Third priority: utilization (higher first)
      return b.total_minutes - a.total_minutes;
    });
  };

  const handleJobClick = async (job) => {
    setSelectedJob(job);
    setJobDialogOpen(true);
    
    // Fetch job routings
    try {
      const response = await apiService.get(`/api/jobs/${job.job_id}/routings`);
      setJobRoutings(response.data);
    } catch (error) {
      console.error('Error fetching job routings:', error);
      setJobRoutings([]);
    }
  };

  const handleNavigateToSchedule = (routing) => {
    if (routing.start_datetime) {
      // Format the date for the schedule view URL
      const scheduleDate = format(parseISO(routing.start_datetime), 'yyyy-MM-dd');
      // Navigate to schedule view with the specific date
      navigate(`/schedule?date=${scheduleDate}`);
    }
  };

  const getTimePeriodDisplay = () => {
    const today = new Date();
    
    switch (selectedTimeframe) {
      case 'today':
        const isToday = format(currentDate, 'yyyy-MM-dd') === format(today, 'yyyy-MM-dd');
        return {
          title: isToday ? 'Today' : format(currentDate, 'EEEE'),
          subtitle: format(currentDate, 'MMMM d, yyyy'),
          color: isToday ? '#10b981' : '#00d4ff'
        };
        
      case 'tomorrow':
        const tomorrowDate = addDays(currentDate, 1);
        return {
          title: 'Tomorrow',
          subtitle: format(tomorrowDate, 'EEEE, MMMM d, yyyy'),
          color: '#ff9800'
        };
        
      case 'week':
        const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
        const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });
        const isCurrentWeek = isSameWeek(currentDate, today, { weekStartsOn: 1 });
        
        return {
          title: isCurrentWeek ? 'This Week' : 'Week View',
          subtitle: `${format(weekStart, 'MMM d')} - ${format(weekEnd, 'MMM d, yyyy')}`,
          color: isCurrentWeek ? '#10b981' : '#00d4ff'
        };
        
      default:
        return {
          title: 'Unknown',
          subtitle: '',
          color: '#9e9e9e'
        };
    }
  };

  const JobCard = ({ job }) => {
    const startTime = parseISO(job.start_datetime);
    const endTime = parseISO(job.end_datetime);

    return (
      <Card 
        sx={{ 
          mb: 1, 
          cursor: 'pointer',
          border: `2px solid ${getStatusColor(job.status)}`,
          '&:hover': {
            transform: 'translateY(-2px)',
            boxShadow: '0 4px 8px rgba(0,0,0,0.2)'
          },
          transition: 'all 0.2s ease'
        }}
        onClick={() => handleJobClick(job)}
      >
        <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
          {/* Job Header */}
          <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={1}>
            <Typography variant="h6" fontWeight="bold" color="primary">
              {job.job_number}
            </Typography>
            <Chip 
              size="small" 
              label={job.status}
              sx={{ 
                backgroundColor: getStatusColor(job.status),
                color: 'white',
                fontWeight: 'bold'
              }}
            />
          </Box>

          {/* Operation Info */}
          <Box display="flex" alignItems="center" gap={1} mb={1}>
            <AssignmentIcon fontSize="small" color="action" />
            <Typography variant="body2" fontWeight="medium">
              {job.operation_number} - {job.operation_name}
            </Typography>
          </Box>

          {/* Customer & Part */}
          <Typography variant="body2" color="text.secondary" mb={1}>
            <strong>{job.customer_name}</strong> • {job.part_name}
          </Typography>

          {/* Operator */}
          <Box display="flex" alignItems="center" gap={1} mb={1}>
            <PersonIcon fontSize="small" color="action" />
            <Typography variant="body2">{job.employee_name}</Typography>
          </Box>

          {/* Time & Duration */}
          <Box display="flex" justifyContent="space-between" alignItems="center">
            <Box display="flex" alignItems="center" gap={0.5}>
              <ScheduleIcon fontSize="small" color="action" />
              <Typography variant="caption">
                {job.week_day && format(parseISO(job.week_day), 'EEE') + ' '}
                {format(startTime, 'h:mm a')} - {format(endTime, 'h:mm a')}
              </Typography>
            </Box>
            <Typography variant="caption" fontWeight="bold" color="primary">
              {formatDuration(job.duration_minutes)}
            </Typography>
          </Box>

          {/* Priority & Sequence */}
          {(job.priority_score || job.sequence_order) && (
            <Box display="flex" justifyContent="space-between" alignItems="center" mt={1} pt={1}
                 sx={{ borderTop: '1px solid #e0e0e0' }}>
              {job.priority_score && (
                <Chip 
                  size="small" 
                  label={`Priority: ${job.priority_score}`}
                  variant="outlined"
                />
              )}
              {job.sequence_order && (
                <Chip 
                  size="small" 
                  label={`Seq: ${job.sequence_order}`}
                  variant="outlined"
                />
              )}
            </Box>
          )}

          {/* Notes */}
          {job.notes && (
            <Typography variant="caption" color="text.secondary" sx={{ 
              mt: 1, 
              display: 'block',
              fontStyle: 'italic',
              borderLeft: '2px solid #e0e0e0',
              pl: 1
            }}>
              {job.notes}
            </Typography>
          )}
        </CardContent>
      </Card>
    );
  };

  // Function to get machine type icon
  const getMachineIcon = (machineName) => {
    const name = machineName?.toUpperCase() || '';
    
    if (name.includes('SAW')) return <SawIcon fontSize="small" />;
    if (name.includes('WJ') || name.includes('WATERJET')) return <WaterjetIcon fontSize="small" />;
    if (name.includes('LATHE')) return <LatheIcon fontSize="small" />;
    if (name.includes('MILL')) return <MillIcon fontSize="small" />;
    if (name.includes('VMC')) return <VMCIcon fontSize="small" />;
    if (name.includes('HMC')) return <HMCIcon fontSize="small" />;
    if (name.includes('INSPECT')) return <InspectIcon fontSize="small" />;
    if (name.includes('DEBURR')) return <DeburrIcon fontSize="small" />;
    if (name.includes('GRIND')) return <GrindIcon fontSize="small" />;
    if (name.includes('DRILL')) return <DrillIcon fontSize="small" />;
    
    return <DefaultMachineIcon fontSize="small" />;
  };
  
  // Function to get machine type color
  const getMachineColor = (machineName) => {
    const name = machineName?.toUpperCase() || '';
    
    if (name.includes('SAW')) return '#f44336';
    if (name.includes('WJ') || name.includes('WATERJET')) return '#2196f3';
    if (name.includes('LATHE')) return '#ff9800';
    if (name.includes('MILL')) return '#795548';
    if (name.includes('VMC')) return '#9c27b0';
    if (name.includes('HMC')) return '#673ab7';
    if (name.includes('INSPECT')) return '#4caf50';
    if (name.includes('DEBURR')) return '#607d8b';
    if (name.includes('GRIND')) return '#009688';
    if (name.includes('DRILL')) return '#3f51b5';
    
    return '#9e9e9e';
  };
  
  const MachineColumn = ({ machine }) => {
    const utilization = calculateUtilization(machine.total_minutes);
    const utilizationColor = getUtilizationColor(utilization);
    const machineIcon = getMachineIcon(machine.machine_name);
    const machineColor = getMachineColor(machine.machine_name);
    
    return (
      <Paper sx={{ p: 2, height: 'fit-content', minHeight: '400px' }}>
        {/* Machine Header */}
        <Box mb={2}>
          <Box display="flex" alignItems="center" gap={1} mb={1}>
            <Avatar sx={{ bgcolor: machineColor, width: 32, height: 32 }}>
              {machineIcon}
            </Avatar>
            <Box flex={1}>
              <Typography variant="h6" fontWeight="bold">
                {machine.machine_name}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {machine.machine_model} • {machine.group_name || 'No Group'}
              </Typography>
            </Box>
          </Box>

          {/* Utilization Bar */}
          <Box mb={1}>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={0.5}>
              <Typography variant="caption" color="text.secondary">
                Utilization
              </Typography>
              <Typography variant="caption" fontWeight="bold" sx={{ color: utilizationColor }}>
                {utilization.toFixed(0)}%
              </Typography>
            </Box>
            <LinearProgress 
              variant="determinate" 
              value={utilization}
              sx={{
                height: 6,
                borderRadius: 3,
                backgroundColor: '#e0e0e0',
                '& .MuiLinearProgress-bar': {
                  backgroundColor: utilizationColor,
                  borderRadius: 3,
                }
              }}
            />
          </Box>

          {/* Summary Stats */}
          <Box display="flex" justifyContent="space-between" alignItems="center">
            <Tooltip title="Scheduled Jobs">
              <Chip 
                size="small" 
                icon={<AssignmentIcon />}
                label={`${machine.scheduled_jobs} jobs`}
                variant="outlined"
              />
            </Tooltip>
            <Tooltip title="Total Time">
              <Chip 
                size="small" 
                icon={<ScheduleIcon />}
                label={formatDuration(machine.total_minutes)}
                variant="outlined"
              />
            </Tooltip>
          </Box>
        </Box>

        <Divider sx={{ mb: 2 }} />

        {/* Job Cards */}
        <Box>
          {machine.scheduled_jobs_detail && machine.scheduled_jobs_detail.length > 0 ? (
            machine.scheduled_jobs_detail
              .sort((a, b) => new Date(a.start_datetime) - new Date(b.start_datetime))
              .map((job) => (
                <JobCard key={job.id} job={job} />
              ))
          ) : (
            <Box 
              sx={{ 
                textAlign: 'center', 
                py: 4, 
                color: 'text.secondary',
                backgroundColor: '#f5f5f5',
                borderRadius: 1,
                border: '2px dashed #e0e0e0'
              }}
            >
              <BuildIcon sx={{ fontSize: 48, opacity: 0.3, mb: 1 }} />
              <Typography variant="body2">
                No jobs scheduled for {selectedTimeframe}
              </Typography>
            </Box>
          )}
        </Box>
      </Paper>
    );
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" height="400px">
        <Typography>Loading machine queues...</Typography>
      </Box>
    );
  }

  const timePeriod = getTimePeriodDisplay();

  return (
    <Box>
      {/* Header */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" gutterBottom>
          Machine Queue Boards
        </Typography>
        <Typography variant="subtitle1" color="text.secondary" gutterBottom>
          Kanban-style view of machine workloads and job assignments
        </Typography>
        
        {/* Time Period Indicator */}
        <Box sx={{ 
          mt: 2, 
          p: 2, 
          background: 'rgba(19, 24, 35, 0.6)',
          borderRadius: 2,
          border: '1px solid rgba(0, 212, 255, 0.2)',
          backdropFilter: 'blur(10px)',
          display: 'flex',
          alignItems: 'center',
          gap: 2
        }}>
          <Box sx={{ 
            width: 8, 
            height: 8, 
            borderRadius: '50%', 
            backgroundColor: timePeriod.color,
            animation: 'pulse 2s infinite'
          }} />
          <Box>
            <Typography variant="h6" sx={{ 
              color: timePeriod.color, 
              fontWeight: 700,
              lineHeight: 1.2
            }}>
              {timePeriod.title}
            </Typography>
            <Typography variant="body2" sx={{ color: '#9ca3af' }}>
              {timePeriod.subtitle}
            </Typography>
          </Box>
          <Box sx={{ flexGrow: 1 }} />
          <Typography variant="caption" sx={{ 
            color: '#6b7280',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            fontWeight: 600
          }}>
            Viewing Schedule
          </Typography>
        </Box>
        
        {/* Controls */}
        <Box display="flex" justifyContent="space-between" alignItems="center" sx={{ mt: 2 }}>
          <Box display="flex" gap={2} alignItems="center">
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel>Timeframe</InputLabel>
              <Select
                value={selectedTimeframe}
                label="Timeframe"
                onChange={(e) => {
                  const newTimeframe = e.target.value;
                  setSelectedTimeframe(newTimeframe);
                  localStorage.setItem('machineQueuesTimeframe', newTimeframe);
                }}
              >
                <MenuItem value="today">Today</MenuItem>
                <MenuItem value="tomorrow">Tomorrow</MenuItem>
                <MenuItem value="week">This Week</MenuItem>
              </Select>
            </FormControl>
            
            {/* Date Navigation */}
            <Box display="flex" alignItems="center" gap={1}>
              <Tooltip title="Previous">
                <IconButton 
                  onClick={() => navigateDate('prev')}
                  sx={{ 
                    bgcolor: 'rgba(232, 42, 42, 0.1)',
                    '&:hover': { bgcolor: 'rgba(232, 42, 42, 0.2)' }
                  }}
                >
                  <ChevronLeftIcon />
                </IconButton>
              </Tooltip>
              
              <Button
                variant="outlined"
                startIcon={<TodayIcon />}
                onClick={goToToday}
              >
                Today
              </Button>
              
              <Tooltip title="Next">
                <IconButton 
                  onClick={() => navigateDate('next')}
                  sx={{ 
                    bgcolor: 'rgba(232, 42, 42, 0.1)',
                    '&:hover': { bgcolor: 'rgba(232, 42, 42, 0.2)' }
                  }}
                >
                  <ChevronRightIcon />
                </IconButton>
              </Tooltip>
            </Box>
            
            <Button
              variant="contained"
              onClick={fetchMachineWorkloads}
            >
              Refresh
            </Button>
          </Box>
        </Box>
      </Box>

      {/* Machine Queue Grid */}
      <Grid container spacing={2}>
        {sortMachines(machineWorkloads).map((machine) => (
          <Grid item xs={12} sm={6} md={4} lg={3} key={machine.machine_id}>
            <MachineColumn machine={machine} />
          </Grid>
        ))}
      </Grid>

      {machineWorkloads.length === 0 && (
        <Box 
          sx={{ 
            textAlign: 'center', 
            py: 6,
            backgroundColor: '#f5f5f5',
            borderRadius: 2,
            mt: 2
          }}
        >
          <BuildIcon sx={{ fontSize: 64, opacity: 0.3, mb: 2 }} />
          <Typography variant="h6" color="text.secondary" gutterBottom>
            No active machines found
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Make sure machines are configured and marked as active
          </Typography>
        </Box>
      )}
      
      {/* Legend */}
      <Card sx={{ mt: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Queue Board Legend
          </Typography>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <Typography variant="subtitle2" gutterBottom>Status Colors:</Typography>
              <Box display="flex" gap={1} flexWrap="wrap">
                <Chip size="small" sx={{ backgroundColor: '#2196f3', color: 'white' }} label="Scheduled" />
                <Chip size="small" sx={{ backgroundColor: '#ff9800', color: 'white' }} label="In Progress" />
                <Chip size="small" sx={{ backgroundColor: '#4caf50', color: 'white' }} label="Completed" />
                <Chip size="small" sx={{ backgroundColor: '#f44336', color: 'white' }} label="Cancelled" />
              </Box>
            </Grid>
            <Grid item xs={12} sm={6}>
              <Typography variant="subtitle2" gutterBottom>Utilization Colors:</Typography>
              <Box display="flex" gap={1} flexWrap="wrap">
                <Chip size="small" sx={{ backgroundColor: '#f44336', color: 'white' }} label="90%+ Overloaded" />
                <Chip size="small" sx={{ backgroundColor: '#ff9800', color: 'white' }} label="75%+ High" />
                <Chip size="small" sx={{ backgroundColor: '#ffc107', color: 'white' }} label="50%+ Medium" />
                <Chip size="small" sx={{ backgroundColor: '#4caf50', color: 'white' }} label="25%+ Good" />
              </Box>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Job Details Dialog */}
      <Dialog 
        open={jobDialogOpen} 
        onClose={() => setJobDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        {selectedJob && (
          <>
            <DialogTitle>
              Job Details: {selectedJob.job_number}
            </DialogTitle>
            <DialogContent>
              <Grid container spacing={2}>
                <Grid item xs={12} md={6}>
                  <Typography variant="subtitle1" gutterBottom>
                    Part Information
                  </Typography>
                  <Typography variant="body2">
                    <strong>Part Name:</strong> {selectedJob.part_name}
                  </Typography>
                  <Typography variant="body2">
                    <strong>Quantity:</strong> {selectedJob.quantity || 'Not specified'}
                  </Typography>
                  <Typography variant="body2">
                    <strong>Customer:</strong> {selectedJob.customer_name}
                  </Typography>
                </Grid>
                <Grid item xs={12} md={6}>
                  <Typography variant="subtitle1" gutterBottom>
                    Schedule Details
                  </Typography>
                  <Typography variant="body2">
                    <strong>Status:</strong> {selectedJob.status}
                  </Typography>
                  <Typography variant="body2">
                    <strong>Start Time:</strong> {selectedJob.start_datetime ? format(parseISO(selectedJob.start_datetime), 'MMM dd, yyyy h:mm a') : 'Not set'}
                  </Typography>
                  <Typography variant="body2">
                    <strong>End Time:</strong> {selectedJob.end_datetime ? format(parseISO(selectedJob.end_datetime), 'MMM dd, yyyy h:mm a') : 'Not set'}
                  </Typography>
                  <Typography variant="body2">
                    <strong>Duration:</strong> {selectedJob.duration_minutes ? formatDuration(selectedJob.duration_minutes) : 'Not set'}
                  </Typography>
                  <Typography variant="body2">
                    <strong>Employee:</strong> {selectedJob.employee_name || 'Not assigned'}
                  </Typography>
                </Grid>
                
                {/* Job Routings */}
                {jobRoutings.length > 0 && (
                  <Grid item xs={12}>
                    <Typography variant="subtitle1" gutterBottom>
                      Operations & Routing
                    </Typography>
                    <List dense>
                      {jobRoutings.map((routing) => (
                        <ListItem key={routing.id} sx={{ 
                          border: '1px solid',
                          borderColor: 'divider',
                          borderRadius: 1,
                          mb: 1,
                          px: 2
                        }}>
                          <ListItemText
                            primary={
                              <Box display="flex" alignItems="center" gap={1}>
                                <Chip 
                                  size="small" 
                                  label={`Op ${routing.operation_number}`}
                                  color="primary"
                                  variant="outlined"
                                />
                                <Typography variant="body2" fontWeight="bold">
                                  {routing.machine_name || routing.operation_name}
                                </Typography>
                                {routing.machine_name && routing.operation_name !== routing.machine_name && (
                                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                                    ({routing.operation_name})
                                  </Typography>
                                )}
                                {routing.schedule_slot_id && (
                                  <Chip 
                                    size="small" 
                                    label="Scheduled"
                                    color="success"
                                    variant="filled"
                                  />
                                )}
                              </Box>
                            }
                            secondary={
                              <Box sx={{ mt: 0.5 }}>
                                <Typography variant="caption" display="block">
                                  <strong>Estimated Hours:</strong> {routing.estimated_hours || 'Not set'}
                                </Typography>
                                <Typography variant="caption" display="block">
                                  <strong>Status:</strong> {routing.routing_status === 'C' ? 'Completed' : routing.routing_status || 'Not set'}
                                </Typography>
                                {routing.schedule_slot_id && (
                                  <>
                                    <Typography variant="caption" display="block" sx={{ color: 'success.main' }}>
                                      <strong>Scheduled Machine:</strong> {routing.scheduled_machine_name || 'Unknown'}
                                    </Typography>
                                    <Typography variant="caption" display="block" sx={{ color: 'success.main' }}>
                                      <strong>Assigned Operator:</strong> {routing.scheduled_employee_name || 'Unassigned'}
                                    </Typography>
                                    <Typography variant="caption" display="block" sx={{ color: 'success.main' }}>
                                      <strong>Start Time:</strong> {routing.start_datetime ? (
                                        <Link 
                                          component="button"
                                          variant="caption"
                                          onClick={() => handleNavigateToSchedule(routing)}
                                          sx={{ 
                                            color: 'success.main', 
                                            textDecoration: 'underline',
                                            cursor: 'pointer',
                                            ml: 0.5
                                          }}
                                        >
                                          {format(parseISO(routing.start_datetime), 'MMM dd, h:mm a')}
                                        </Link>
                                      ) : 'Not set'}
                                    </Typography>
                                    <Typography variant="caption" display="block" sx={{ color: 'success.main' }}>
                                      <strong>Duration:</strong> {routing.duration_minutes ? `${Math.round(routing.duration_minutes / 60 * 100) / 100}h` : 'Not set'}
                                    </Typography>
                                  </>
                                )}
                                {routing.notes && (
                                  <Typography variant="caption" display="block" sx={{ fontStyle: 'italic' }}>
                                    <strong>Notes:</strong> {routing.notes}
                                  </Typography>
                                )}
                              </Box>
                            }
                          />
                        </ListItem>
                      ))}
                    </List>
                  </Grid>
                )}
              </Grid>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setJobDialogOpen(false)}>Close</Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </Box>
  );
};

export default MachineQueues;