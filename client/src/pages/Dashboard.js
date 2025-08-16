import React, { useState, useEffect } from 'react';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  Chip,
  LinearProgress,
  Avatar,
  Divider,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  IconButton,
  Tooltip,
  Badge,
  Link,
} from '@mui/material';
import {
  Build as BuildIcon,
  Schedule as ScheduleIcon,
  Assessment as AssessmentIcon,
  TrendingUp as TrendingUpIcon,
  Factory as FactoryIcon,
  Speed as SpeedIcon,
  Warning as WarningIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Analytics as AnalyticsIcon,
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
  Today as TodayIcon,
  Lock as LockIcon,
} from '@mui/icons-material';
import { format, parseISO, isPast, isToday, isTomorrow } from 'date-fns';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';

import { apiService } from '../services/apiService';
import Logo from '../components/Logo';
import OutsourcingTile from '../components/OutsourcingTile';

const Dashboard = () => {
  const navigate = useNavigate();
  const [machineView, setMachineView] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [dashboardData, setDashboardData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedJob, setSelectedJob] = useState(null);
  const [jobDialogOpen, setJobDialogOpen] = useState(false);
  const [jobRoutings, setJobRoutings] = useState([]);
  const [shiftCapacity, setShiftCapacity] = useState(null);
  const [capacityPeriod, setCapacityPeriod] = useState('day');
  const [capacityDate, setCapacityDate] = useState(new Date());

  useEffect(() => {
    fetchDashboardData();
  }, []);

  useEffect(() => {
    if (dashboardData) { // Only refetch shift capacity if we already have initial data
      fetchShiftCapacityData();
    }
  }, [capacityPeriod, capacityDate]);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const capacityParams = new URLSearchParams({
        period: capacityPeriod,
        date: format(capacityDate, 'yyyy-MM-dd')
      });
      
      const [machineData, jobsData, summaryData, employeeData, shiftCapacityData] = await Promise.all([
        apiService.get('/api/schedules/machine-view'),
        apiService.jobs.getAll(),
        apiService.get('/api/schedules/dashboard/summary'),
        apiService.get('/api/employees'),
        apiService.get(`/api/shift-capacity/capacity?${capacityParams}`),
      ]);

      setMachineView(machineData.data);
      setJobs(jobsData.data);
      setDashboardData({ ...summaryData.data, employees: employeeData.data });
      setShiftCapacity(shiftCapacityData.data);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      toast.error('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const fetchShiftCapacityData = async () => {
    try {
      const capacityParams = new URLSearchParams({
        period: capacityPeriod,
        date: format(capacityDate, 'yyyy-MM-dd')
      });
      
      const shiftCapacityData = await apiService.get(`/api/shift-capacity/capacity?${capacityParams}`);
      setShiftCapacity(shiftCapacityData.data);
    } catch (error) {
      console.error('Error fetching shift capacity data:', error);
      toast.error('Failed to load shift capacity data');
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'scheduled':
        return 'primary';
      case 'completed':
        return 'success';
      case 'cancelled':
        return 'error';
      case 'pending':
        return 'warning';
      default:
        return 'default';
    }
  };

  const getPriorityColor = (score) => {
    if (score >= 800) return 'error'; // red - critical
    if (score >= 600) return 'warning'; // orange - high
    if (score >= 300) return 'secondary'; // yellow - medium
    return 'success'; // green - standard
  };

  const getPriorityLabel = (score) => {
    if (score >= 800) return 'CRITICAL';
    if (score >= 600) return 'HIGH';
    if (score >= 300) return 'MEDIUM';
    return 'STANDARD';
  };

  const getDueDateStatus = (dueDate) => {
    if (!dueDate) return { color: 'default', text: 'No due date' };
    
    const date = parseISO(dueDate);
    if (isPast(date)) return { color: 'error', text: 'Overdue' };
    if (isToday(date)) return { color: 'warning', text: 'Due today' };
    if (isTomorrow(date)) return { color: 'info', text: 'Due tomorrow' };
    return { color: 'success', text: format(date, 'MMM dd') };
  };

  const handleJobClick = async (job) => {
    setSelectedJob(job);
    setJobDialogOpen(true);
    
    // Fetch job routings with scheduling information
    try {
      const response = await apiService.get(`/api/jobs/${job.id}/routings`);
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

  const handlePeriodChange = (newPeriod) => {
    setCapacityPeriod(newPeriod);
  };

  const handleDateNavigation = (direction) => {
    const newDate = new Date(capacityDate);
    
    switch (capacityPeriod) {
      case 'day':
        newDate.setDate(newDate.getDate() + direction);
        break;
      case 'week':
        newDate.setDate(newDate.getDate() + (direction * 7));
        break;
      case 'month':
        newDate.setMonth(newDate.getMonth() + direction);
        break;
    }
    
    setCapacityDate(newDate);
  };

  const handleTodayClick = () => {
    setCapacityDate(new Date());
  };

  const getDateRangeLabel = () => {
    const date = capacityDate;
    
    switch (capacityPeriod) {
      case 'day':
        return format(date, 'MMM dd, yyyy');
      case 'week':
        const startOfWeek = new Date(date);
        startOfWeek.setDate(date.getDate() - date.getDay() + 1);
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);
        return `${format(startOfWeek, 'MMM dd')} - ${format(endOfWeek, 'MMM dd, yyyy')}`;
      case 'month':
        return format(date, 'MMMM yyyy');
      default:
        return format(date, 'MMM dd, yyyy');
    }
  };

  const StatCard = ({ title, value, icon, color, subtitle, trend }) => (
    <Card className="industrial-card data-card" sx={{ height: '100%', position: 'relative', overflow: 'hidden' }}>
      {/* Animated background element */}
      <Box
        sx={{
          position: 'absolute',
          top: 0,
          right: 0,
          width: '100px',
          height: '100px',
          background: `linear-gradient(135deg, ${color === 'primary' ? 'rgba(0, 212, 255, 0.05)' : color === 'secondary' ? 'rgba(255, 107, 53, 0.05)' : 'rgba(16, 185, 129, 0.05)'} 0%, transparent 70%)`,
          borderRadius: '50%',
          transform: 'translate(30px, -30px)'
        }}
      />
      <CardContent sx={{ position: 'relative', zIndex: 1 }}>
        <Box display="flex" alignItems="center" justifyContent="space-between">
          <Box sx={{ flex: 1 }}>
            <Typography 
              variant="overline" 
              sx={{ 
                color: '#cbd5e0', 
                fontWeight: 600,
                letterSpacing: '1px',
                fontSize: '0.75rem'
              }}
            >
              {title}
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mt: 1 }}>
              <Typography 
                variant="h3" 
                component="div" 
                sx={{ 
                  fontWeight: 800, 
                  color: color === 'primary' ? '#00d4ff' : color === 'secondary' ? '#ff6b35' : '#10b981',
                  lineHeight: 1
                }}
              >
                {value}
              </Typography>
              {trend && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <TrendingUpIcon 
                    sx={{ 
                      color: trend > 0 ? '#10b981' : '#ef4444', 
                      fontSize: '1rem',
                      transform: trend < 0 ? 'rotate(180deg)' : 'none'
                    }} 
                  />
                  <Typography 
                    variant="caption" 
                    sx={{ 
                      color: trend > 0 ? '#10b981' : '#ef4444',
                      fontWeight: 600
                    }}
                  >
                    {Math.abs(trend)}%
                  </Typography>
                </Box>
              )}
            </Box>
            {subtitle && (
              <Typography variant="body2" sx={{ color: '#a0aec0', mt: 1 }}>
                {subtitle}
              </Typography>
            )}
          </Box>
          <Avatar 
            sx={{ 
              width: 56,
              height: 56,
              background: color === 'primary' ? 'linear-gradient(135deg, #00d4ff 0%, #00a3cc 100%)' : 
                         color === 'secondary' ? 'linear-gradient(135deg, #ff6b35 0%, #ff8c5e 100%)' :
                         'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              boxShadow: `0 8px 24px ${color === 'primary' ? 'rgba(0, 212, 255, 0.3)' : 
                                      color === 'secondary' ? 'rgba(255, 107, 53, 0.3)' :
                                      'rgba(16, 185, 129, 0.3)'}`,
              fontSize: '1.5rem'
            }}
          >
            {icon}
          </Avatar>
        </Box>
      </CardContent>
    </Card>
  );

  const MachineCard = ({ machine }) => {
    const currentTime = new Date();
    const currentDay = currentTime.getDay(); // 0=Sunday, 1=Monday, etc.
    const currentHour = currentTime.getHours();
    const currentMinutes = currentTime.getHours() * 60 + currentTime.getMinutes();
    
    // Check if anyone is scheduled to work right now
    const employeesWorkingNow = dashboardData?.employees?.filter(emp => {
      if (!emp.work_days?.includes(currentDay)) return false;
      
      // Use custom hours if available, otherwise fall back to start_time/end_time
      let startHour, endHour;
      if (emp.custom_start_hour !== null && emp.custom_end_hour !== null) {
        startHour = emp.custom_start_hour;
        endHour = emp.custom_end_hour;
      } else if (emp.start_time && emp.end_time) {
        startHour = parseInt(emp.start_time.split(':')[0]);
        endHour = parseInt(emp.end_time.split(':')[0]);
      } else {
        return false;
      }
      
      const startMinutes = startHour * 60;
      const endMinutes = endHour * 60;
      
      return currentMinutes >= startMinutes && currentMinutes < endMinutes;
    }) || [];
    
    const someoneIsWorking = employeesWorkingNow.length > 0;
    
    const hasCurrentJob = someoneIsWorking && machine.schedules?.some(schedule => {
      const startTime = new Date(schedule.start_time);
      const endTime = new Date(schedule.end_time);
      const today = new Date().toDateString();
      const scheduleDate = startTime.toDateString();
      const isToday = today === scheduleDate;
      
      // Check if the employee assigned to this job is actually working now
      const assignedEmployee = employeesWorkingNow.find(emp => 
        schedule.employee_name?.includes(emp.first_name) && 
        schedule.employee_name?.includes(emp.last_name)
      );
      
      return isToday && 
             currentTime >= startTime && 
             currentTime <= endTime && 
             schedule.status === 'scheduled' &&
             assignedEmployee; // Only active if the assigned operator is working
    });
    
    const activityStatus = hasCurrentJob ? 'active' : 'idle';
    const activityColor = hasCurrentJob ? '#10b981' : '#9ca3af';
    
    return (
      <Card className="industrial-card" sx={{ height: '100%', minHeight: 200, position: 'relative' }}>
        <CardContent>
          <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <BuildIcon sx={{ color: activityColor, fontSize: '1.2rem' }} />
              <Typography variant="h6" component="div" sx={{ fontWeight: 600, color: '#e4e6eb' }}>
                {machine.machine_name}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0.5 }}>
              {machine.group_names && machine.group_names.length > 0 && (
                <Chip 
                  label={machine.group_names[0]} 
                  size="small" 
                  variant="filled"
                  sx={{
                    background: 'linear-gradient(135deg, rgba(0, 212, 255, 0.2) 0%, rgba(0, 212, 255, 0.1) 100%)',
                    border: '1px solid rgba(0, 212, 255, 0.3)',
                    color: '#00d4ff',
                    fontWeight: 600,
                    fontSize: '0.7rem'
                  }}
                />
              )}
              <Chip 
                label={activityStatus} 
                size="small" 
                sx={{
                  background: hasCurrentJob ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.2) 0%, rgba(16, 185, 129, 0.1) 100%)' : 'rgba(156, 163, 175, 0.2)',
                  border: `1px solid ${hasCurrentJob ? 'rgba(16, 185, 129, 0.3)' : 'rgba(156, 163, 175, 0.3)'}`,
                  color: activityColor,
                  fontWeight: 600,
                  fontSize: '0.7rem',
                  textTransform: 'uppercase'
                }}
              />
            </Box>
          </Box>
          
          <Typography variant="body2" sx={{ color: '#cbd5e0', mb: 2 }}>
            {machine.machine_model}
          </Typography>

          <Divider sx={{ my: 2, borderColor: 'rgba(255, 255, 255, 0.12)' }} />

          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
            <Typography variant="body2" sx={{ color: '#cbd5e0' }}>
              Scheduled Jobs:
            </Typography>
            <Chip 
              label={machine.schedules?.length || 0} 
              size="small"
              sx={{
                background: machine.schedules?.length > 0 ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.2) 0%, rgba(16, 185, 129, 0.1) 100%)' : 'rgba(107, 114, 128, 0.2)',
                border: `1px solid ${machine.schedules?.length > 0 ? 'rgba(16, 185, 129, 0.3)' : 'rgba(107, 114, 128, 0.3)'}`,
                color: machine.schedules?.length > 0 ? '#10b981' : '#6b7280',
                fontWeight: 600,
                minWidth: '40px'
              }}
            />
          </Box>

          {machine.schedules && machine.schedules.length > 0 ? (
            <List dense>
              {machine.schedules.slice(0, 3).map((schedule) => (
                <ListItem key={schedule.id} sx={{ px: 0 }}>
                  <ListItemAvatar>
                    <Avatar sx={{ width: 24, height: 24, fontSize: '0.75rem' }}>
                      {schedule.job_number?.slice(0, 2)}
                    </Avatar>
                  </ListItemAvatar>
                  <ListItemText
                    primary={schedule.part_name}
                    secondary={`${schedule.job_number} - ${schedule.employee_name}`}
                    primaryTypographyProps={{ variant: 'body2' }}
                    secondaryTypographyProps={{ variant: 'caption' }}
                  />
                  <Chip
                    label={schedule.status}
                    size="small"
                    color={getStatusColor(schedule.status)}
                  />
                </ListItem>
              ))}
              {machine.schedules.length > 3 && (
                <ListItem sx={{ px: 0 }}>
                  <ListItemText
                    secondary={`+${machine.schedules.length - 3} more jobs`}
                    secondaryTypographyProps={{ variant: 'caption', color: 'textSecondary' }}
                  />
                </ListItem>
              )}
            </List>
          ) : (
            <Box textAlign="center" py={2}>
              <Typography variant="body2" sx={{ color: '#a0aec0' }}>
                No scheduled jobs
              </Typography>
            </Box>
          )}
        </CardContent>
      </Card>
    );
  };

  const JobTile = ({ job }) => {
    const dueDateStatus = getDueDateStatus(job.due_date);
    
    return (
      <Card 
        sx={{ 
          cursor: 'pointer',
          '&:hover': { boxShadow: 4 },
          transition: 'box-shadow 0.2s'
        }}
        onClick={() => handleJobClick(job)}
      >
        <CardContent>
          <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={1}>
            <Typography variant="h6" component="div" noWrap sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {job.job_number}
              {job.schedule_locked && (
                <Tooltip title={`Locked: ${job.lock_reason || 'Started operation'}`}>
                  <LockIcon sx={{ fontSize: '1rem', color: 'warning.main' }} />
                </Tooltip>
              )}
            </Typography>
            <Chip
              label={job.priority_score || 0}
              size="small"
              color={getPriorityColor(job.priority_score || 0)}
              sx={{ fontWeight: 'bold' }}
            />
          </Box>
          
          <Typography variant="body2" color="textSecondary" gutterBottom>
            {job.part_name}
          </Typography>
          
          <Typography variant="body2" gutterBottom>
            Customer: {job.customer_name}
          </Typography>
          
          <Box display="flex" justifyContent="space-between" alignItems="center" mt={2}>
            <Typography variant="body2">
              Qty: {job.quantity}
            </Typography>
            <Chip
              label={dueDateStatus.text}
              size="small"
              color={dueDateStatus.color}
              variant="outlined"
            />
          </Box>
          
          {job.estimated_hours && (
            <Box mt={1}>
              <Typography variant="caption" color="textSecondary">
                Est. Hours: {job.estimated_hours}
              </Typography>
            </Box>
          )}
        </CardContent>
      </Card>
    );
  };

  if (loading) {
    return (
      <Box>
        <LinearProgress />
        <Typography variant="h6" sx={{ mt: 2 }}>
          Loading dashboard...
        </Typography>
      </Box>
    );
  }

  return (
    <Box className="fade-in-up">
      {/* Header */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" gutterBottom sx={{ color: '#e4e6eb', fontWeight: 700 }}>
          Dashboard
        </Typography>
        <Typography variant="subtitle1" sx={{ color: '#9ca3af', mb: 3 }}>
          Production overview and system status
        </Typography>
      </Box>
      
      {/* Overview Cards */}
      <Grid container spacing={3} mb={4}>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Total Jobs"
            value={jobs?.length || 0}
            icon={<AssessmentIcon />}
            color="primary"
            subtitle="Jobs in system"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Active Machines"
            value={(() => {
              const currentTime = new Date();
              const currentDay = currentTime.getDay();
              const currentMinutes = currentTime.getHours() * 60 + currentTime.getMinutes();
              
              const employeesWorkingNow = dashboardData?.employees?.filter(emp => {
                if (!emp.work_days?.includes(currentDay)) return false;
                
                let startHour, endHour;
                if (emp.custom_start_hour !== null && emp.custom_end_hour !== null) {
                  startHour = emp.custom_start_hour;
                  endHour = emp.custom_end_hour;
                } else if (emp.start_time && emp.end_time) {
                  startHour = parseInt(emp.start_time.split(':')[0]);
                  endHour = parseInt(emp.end_time.split(':')[0]);
                } else {
                  return false;
                }
                
                const startMinutes = startHour * 60;
                const endMinutes = endHour * 60;
                
                return currentMinutes >= startMinutes && currentMinutes < endMinutes;
              }) || [];
              
              const activeMachines = machineView?.filter(machine => {
                const hasCurrentJob = machine.schedules?.some(schedule => {
                  const startTime = new Date(schedule.start_time);
                  const endTime = new Date(schedule.end_time);
                  const today = new Date().toDateString();
                  const scheduleDate = startTime.toDateString();
                  const isToday = today === scheduleDate;
                  
                  const assignedEmployee = employeesWorkingNow.find(emp => 
                    schedule.employee_name?.includes(emp.first_name) && 
                    schedule.employee_name?.includes(emp.last_name)
                  );
                  
                  return isToday && 
                         currentTime >= startTime && 
                         currentTime <= endTime && 
                         schedule.status === 'scheduled' &&
                         assignedEmployee;
                });
                
                return hasCurrentJob;
              }) || [];
              
              return activeMachines.length;
            })()}
            icon={<BuildIcon />}
            color="success"
            subtitle="Currently running"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Scheduled"
            value={dashboardData?.summary?.scheduled_jobs_count || 0}
            icon={<ScheduleIcon />}
            color="info"
            subtitle="Scheduled jobs"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Completed"
            value={dashboardData?.summary?.completed_jobs_count || 0}
            icon={<TrendingUpIcon />}
            color="warning"
            subtitle="Completed jobs"
          />
        </Grid>
      </Grid>

      {/* Shift Capacity */}
      {shiftCapacity && (
        <>
          <Box sx={{ mt: 4, mb: 3 }}>
            <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
              <Typography variant="h5" sx={{ color: '#e4e6eb' }}>
                Shift Capacity
              </Typography>
              
              {/* Period Toggle Buttons */}
              <Box display="flex" gap={1}>
                <Button
                  variant={capacityPeriod === 'day' ? 'contained' : 'outlined'}
                  size="small"
                  onClick={() => handlePeriodChange('day')}
                  sx={{ minWidth: '60px' }}
                >
                  Day
                </Button>
                <Button
                  variant={capacityPeriod === 'week' ? 'contained' : 'outlined'}
                  size="small"
                  onClick={() => handlePeriodChange('week')}
                  sx={{ minWidth: '60px' }}
                >
                  Week
                </Button>
                <Button
                  variant={capacityPeriod === 'month' ? 'contained' : 'outlined'}
                  size="small"
                  onClick={() => handlePeriodChange('month')}
                  sx={{ minWidth: '60px' }}
                >
                  Month
                </Button>
              </Box>
            </Box>
            
            {/* Date Navigation */}
            <Box display="flex" alignItems="center" justifyContent="center" gap={2}>
              <IconButton 
                onClick={() => handleDateNavigation(-1)}
                sx={{ color: '#e4e6eb' }}
              >
                <ChevronLeftIcon />
              </IconButton>
              
              <Typography variant="h6" sx={{ 
                color: '#e4e6eb', 
                minWidth: '200px', 
                textAlign: 'center',
                fontWeight: 500
              }}>
                {getDateRangeLabel()}
              </Typography>
              
              <IconButton 
                onClick={() => handleDateNavigation(1)}
                sx={{ color: '#e4e6eb' }}
              >
                <ChevronRightIcon />
              </IconButton>
              
              <IconButton 
                onClick={handleTodayClick}
                sx={{ color: '#00d4ff', ml: 1 }}
                title="Go to today"
              >
                <TodayIcon />
              </IconButton>
            </Box>
          </Box>
          <Grid container spacing={3} mb={4}>
            <Grid item xs={12} md={4}>
              <Card sx={{ 
                background: 'linear-gradient(135deg, #1565c0 0%, #1976d2 100%)',
                color: 'white',
                height: '100%'
              }}>
                <CardContent>
                  <Box display="flex" alignItems="center" mb={2}>
                    <ScheduleIcon sx={{ mr: 1, fontSize: 28 }} />
                    <Typography variant="h6" component="div" sx={{ fontWeight: 600 }}>
                      1st Shift
                    </Typography>
                  </Box>
                  <Typography variant="h4" component="div" sx={{ fontWeight: 'bold', mb: 1 }}>
                    {shiftCapacity.first_shift.usable_capacity_formatted}
                  </Typography>
                  <Typography variant="body2" sx={{ opacity: 0.9, mb: 1 }}>
                    Usable Capacity (85% efficiency)
                  </Typography>
                  <Box sx={{ mt: 2 }}>
                    <Typography variant="body2" sx={{ opacity: 0.9 }}>
                      Used: {shiftCapacity.first_shift.scheduled_hours_formatted} ({shiftCapacity.first_shift.utilization_percent}%)
                    </Typography>
                    <LinearProgress 
                      variant="determinate" 
                      value={Math.min(shiftCapacity.first_shift.utilization_percent, 100)} 
                      sx={{ 
                        mt: 1, 
                        backgroundColor: 'rgba(255,255,255,0.3)',
                        '& .MuiLinearProgress-bar': {
                          backgroundColor: shiftCapacity.first_shift.utilization_percent > 90 ? '#ff5722' : '#4caf50'
                        }
                      }}
                    />
                    <Typography variant="caption" sx={{ opacity: 0.8, mt: 1, display: 'block' }}>
                      {shiftCapacity.first_shift.operators} operators • {shiftCapacity.first_shift.remaining_capacity_formatted} remaining
                    </Typography>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} md={4}>
              <Card sx={{ 
                background: 'linear-gradient(135deg, #6a1b9a 0%, #8e24aa 100%)',
                color: 'white',
                height: '100%'
              }}>
                <CardContent>
                  <Box display="flex" alignItems="center" mb={2}>
                    <ScheduleIcon sx={{ mr: 1, fontSize: 28 }} />
                    <Typography variant="h6" component="div" sx={{ fontWeight: 600 }}>
                      2nd Shift
                    </Typography>
                  </Box>
                  <Typography variant="h4" component="div" sx={{ fontWeight: 'bold', mb: 1 }}>
                    {shiftCapacity.second_shift.usable_capacity_formatted}
                  </Typography>
                  <Typography variant="body2" sx={{ opacity: 0.9, mb: 1 }}>
                    Usable Capacity (60% efficiency)
                  </Typography>
                  <Box sx={{ mt: 2 }}>
                    <Typography variant="body2" sx={{ opacity: 0.9 }}>
                      Used: {shiftCapacity.second_shift.scheduled_hours_formatted} ({shiftCapacity.second_shift.utilization_percent}%)
                    </Typography>
                    <LinearProgress 
                      variant="determinate" 
                      value={Math.min(shiftCapacity.second_shift.utilization_percent, 100)} 
                      sx={{ 
                        mt: 1, 
                        backgroundColor: 'rgba(255,255,255,0.3)',
                        '& .MuiLinearProgress-bar': {
                          backgroundColor: shiftCapacity.second_shift.utilization_percent > 90 ? '#ff5722' : '#4caf50'
                        }
                      }}
                    />
                    <Typography variant="caption" sx={{ opacity: 0.8, mt: 1, display: 'block' }}>
                      {shiftCapacity.second_shift.operators} operators • {shiftCapacity.second_shift.remaining_capacity_formatted} remaining
                    </Typography>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} md={4}>
              <Card sx={{ 
                background: 'linear-gradient(135deg, #2e7d32 0%, #388e3c 100%)',
                color: 'white',
                height: '100%'
              }}>
                <CardContent>
                  <Box display="flex" alignItems="center" mb={2}>
                    <ScheduleIcon sx={{ mr: 1, fontSize: 28 }} />
                    <Typography variant="h6" component="div" sx={{ fontWeight: 600 }}>
                      Total Capacity
                    </Typography>
                  </Box>
                  <Typography variant="h4" component="div" sx={{ fontWeight: 'bold', mb: 1 }}>
                    {shiftCapacity.total_capacity.usable_capacity_formatted}
                  </Typography>
                  <Typography variant="body2" sx={{ opacity: 0.9, mb: 1 }}>
                    Combined Usable Capacity
                  </Typography>
                  <Box sx={{ mt: 2 }}>
                    <Typography variant="body2" sx={{ opacity: 0.9 }}>
                      Used: {shiftCapacity.total_capacity.scheduled_hours_formatted} ({shiftCapacity.total_capacity.utilization_percent}%)
                    </Typography>
                    <LinearProgress 
                      variant="determinate" 
                      value={Math.min(shiftCapacity.total_capacity.utilization_percent, 100)} 
                      sx={{ 
                        mt: 1, 
                        backgroundColor: 'rgba(255,255,255,0.3)',
                        '& .MuiLinearProgress-bar': {
                          backgroundColor: shiftCapacity.total_capacity.utilization_percent > 90 ? '#ff5722' : '#4caf50'
                        }
                      }}
                    />
                    <Typography variant="caption" sx={{ opacity: 0.8, mt: 1, display: 'block' }}>
                      {shiftCapacity.total_capacity.operators} operators • {shiftCapacity.total_capacity.remaining_capacity_formatted} remaining
                    </Typography>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </>
      )}

      {/* Outsourcing Operations */}
      <Box sx={{ mt: 4, mb: 4 }}>
        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <OutsourcingTile />
          </Grid>
        </Grid>
      </Box>

      {/* Machine Status */}
      <Typography variant="h5" gutterBottom sx={{ mt: 4, color: '#e4e6eb' }}>
        Machines
      </Typography>
      <Grid container spacing={3} mb={4}>
        {machineView.map((machine) => (
          <Grid item xs={12} sm={6} md={4} lg={3} key={machine.machine_id}>
            <MachineCard machine={machine} />
          </Grid>
        ))}
      </Grid>

      {/* Recent Jobs */}
      <Typography variant="h5" gutterBottom sx={{ color: '#e4e6eb' }}>
        Recent Jobs
      </Typography>
      <Grid container spacing={2}>
        {jobs.slice(0, 12).map((job) => (
          <Grid item xs={12} sm={6} md={4} lg={3} key={job.id}>
            <JobTile job={job} />
          </Grid>
        ))}
      </Grid>

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
                    <strong>Part Number:</strong> {selectedJob.part_number}
                  </Typography>
                  <Typography variant="body2">
                    <strong>Quantity:</strong> {selectedJob.quantity}
                  </Typography>
                  <Typography variant="body2">
                    <strong>Material:</strong> {selectedJob.material}
                  </Typography>
                </Grid>
                <Grid item xs={12} md={6}>
                  <Typography variant="subtitle1" gutterBottom>
                    Job Details
                  </Typography>
                  <Typography variant="body2">
                    <strong>Customer:</strong> {selectedJob.customer_name}
                  </Typography>
                  <Typography variant="body2">
                    <strong>Priority:</strong> {selectedJob.priority_score || 0} ({getPriorityLabel(selectedJob.priority_score || 0)})
                  </Typography>
                  <Typography variant="body2">
                    <strong>Due Date:</strong> {selectedJob.due_date ? format(parseISO(selectedJob.due_date), 'MMM dd, yyyy') : 'Not set'}
                  </Typography>
                  <Typography variant="body2">
                    <strong>Status:</strong> {selectedJob.status}
                  </Typography>
                  {selectedJob.schedule_locked && (
                    <Typography variant="body2" sx={{ color: 'warning.main', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <LockIcon fontSize="small" />
                      <strong>Lock Status:</strong> {selectedJob.lock_reason || 'Operation started - schedule locked'}
                    </Typography>
                  )}
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
                
                {selectedJob.special_instructions && (
                  <Grid item xs={12}>
                    <Typography variant="subtitle1" gutterBottom>
                      Special Instructions
                    </Typography>
                    <Typography variant="body2">
                      {selectedJob.special_instructions}
                    </Typography>
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

export default Dashboard;
