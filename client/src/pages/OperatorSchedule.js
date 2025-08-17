import React, { useState, useEffect } from 'react';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  Tabs,
  Tab,
  Chip,
  Avatar,
  Divider,
  LinearProgress,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  IconButton,
  Tooltip,
} from '@mui/material';
import {
  Visibility as VisibilityIcon,
  Schedule as ScheduleIcon,
  Person as PersonIcon,
  Today as TodayIcon,
} from '@mui/icons-material';
import { format, parseISO, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay, isToday } from 'date-fns';
import toast from 'react-hot-toast';

import { apiService } from '../services/apiService';
import Logo from '../components/Logo';

const OperatorSchedule = () => {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedShift, setSelectedShift] = useState('all');
  const [selectedDepartment, setSelectedDepartment] = useState('all');
  const [availabilityData, setAvailabilityData] = useState({});
  const [workSchedulesData, setWorkSchedulesData] = useState({});
  const [loadingAvailability, setLoadingAvailability] = useState(false);

  const shifts = [
    { value: 'all', label: 'All Shifts' },
    { value: 'day', label: 'Day Shift' },
    { value: 'night', label: 'Night Shift' },
    { value: 'swing', label: 'Swing Shift' }
  ];

  const departments = ['Production', 'Quality Control', 'Maintenance', 'Engineering', 'Management'];

  useEffect(() => {
    fetchEmployees();
  }, []);

  useEffect(() => {
    if (employees.length > 0) {
      fetchAvailabilityData();
      fetchWorkSchedulesData();
    }
  }, [employees, selectedDate]);

  const fetchEmployees = async () => {
    try {
      setLoading(true);
      const response = await apiService.employees.getAll();
      setEmployees(response || []); // apiService returns data directly
    } catch (error) {
      console.error('Error fetching employees:', error);
      toast.error('Failed to load employees');
      setEmployees([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchAvailabilityData = async () => {
    try {
      setLoadingAvailability(true);
      const startOfWeekDate = startOfWeek(selectedDate, { weekStartsOn: 1 }); // Monday start
      const endOfWeekDate = endOfWeek(selectedDate, { weekStartsOn: 1 }); // Sunday end
      
      const promises = employees.map(employee => {
        const params = {
          start_date: format(startOfWeekDate, 'yyyy-MM-dd'),
          end_date: format(endOfWeekDate, 'yyyy-MM-dd')
        };
        
        // Debug logging for Drew
        if (employee.id === 9) {
          console.log(`🔍 Making API call for Drew with params:`, params);
        }
        
        return apiService.employees.getAvailability(employee.id, params);
      });
      
      const responses = await Promise.all(promises);
      const availabilityMap = {};
      
      responses.forEach((response, index) => {
        const employeeId = employees[index].id;
        const employeeName = `${employees[index].first_name} ${employees[index].last_name}`;
        availabilityMap[employeeId] = response || []; // apiService returns data directly
        
        // Debug logging for Drew
        if (employeeId === 9) {
          console.log(`🔍 API response for ${employeeName} (ID: ${employeeId}):`, {
            dateRange: `${format(startOfWeekDate, 'yyyy-MM-dd')} to ${format(endOfWeekDate, 'yyyy-MM-dd')}`,
            response: response,
            entriesCount: response ? response.length : 0,
            actualDates: response ? response.map(entry => ({
              date: entry.date,
              dateType: typeof entry.date,
              dateString: entry.date instanceof Date ? entry.date.toISOString() : entry.date,
              status: entry.status,
              reason: entry.reason
            })) : []
          });
        }
      });
      
      setAvailabilityData(availabilityMap);
    } catch (error) {
      console.error('Error fetching availability data:', error);
      console.error('Full error details:', {
        message: error.message,
        response: error.response,
        status: error.response?.status,
        data: error.response?.data
      });
      toast.error('Failed to load availability data');
    } finally {
      setLoadingAvailability(false);
    }
  };

  const fetchWorkSchedulesData = async () => {
    try {
      const promises = employees.map(employee =>
        apiService.employees.getWorkSchedules(employee.id)
      );
      
      const responses = await Promise.all(promises);
      const workSchedulesMap = {};
      
      responses.forEach((response, index) => {
        workSchedulesMap[employees[index].id] = response || []; // apiService returns data directly
      });
      
      setWorkSchedulesData(workSchedulesMap);
    } catch (error) {
      console.error('Error fetching work schedules data:', error);
      // Don't show error toast as this is fallback data
    }
  };

  const getWeekDays = () => {
    const start = startOfWeek(selectedDate, { weekStartsOn: 1 });
    const end = endOfWeek(selectedDate, { weekStartsOn: 1 });
    const days = eachDayOfInterval({ start, end });
    
    // Debug logging for current week
    console.log(`📅 Current week display (${format(start, 'MMM dd')} - ${format(end, 'MMM dd')}):`, 
      days.map(d => format(d, 'yyyy-MM-dd')));
    
    return days;
  };

  const getEmployeeAvailabilityForDate = (employeeId, date) => {
    const employeeAvailability = availabilityData[employeeId] || [];
    const dateStr = format(date, 'yyyy-MM-dd');
    
    // Debug logging for Drew
    if (employeeId === 9) {
      console.log(`🔍 Drew availability check for ${dateStr}:`, {
        availabilityData: employeeAvailability,
        lookingFor: dateStr,
        found: employeeAvailability.find(entry => entry.date === dateStr)
      });
    }
    
    const found = employeeAvailability.find(entry => {
      // Handle both string dates and Date objects
      let entryDateStr;
      if (entry.date instanceof Date) {
        entryDateStr = format(entry.date, 'yyyy-MM-dd');
      } else if (typeof entry.date === 'string') {
        // Handle ISO date strings from database
        entryDateStr = entry.date.split('T')[0];
      } else {
        entryDateStr = entry.date;
      }
      return entryDateStr === dateStr;
    });
    
    // Debug logging for Drew
    if (employeeId === 9) {
      console.log(`🔍 Drew date comparison for ${dateStr}:`, {
        entries: employeeAvailability.map(e => ({
          date: e.date,
          dateType: typeof e.date,
          isDateObject: e.date instanceof Date,
          formatted: e.date instanceof Date ? format(e.date, 'yyyy-MM-dd') : e.date,
          matches: (e.date instanceof Date ? format(e.date, 'yyyy-MM-dd') : e.date) === dateStr,
          status: e.status,
          reason: e.reason
        })),
        found: found
      });
      
      // Extra debug: show raw availability data
      if (dateStr === "2025-08-18") {
        console.log('🔍 Raw availability data for Drew:', employeeAvailability);
      }
    }
    
    return found;
  };

  const getEmployeeWorkScheduleForDate = (employeeId, date) => {
    const employee = employees.find(emp => emp.id === employeeId);
    const workSchedules = workSchedulesData[employeeId] || [];
    
    if (!employee) return null;
    
    // Get day of week (1-7, where 1=Monday, 7=Sunday)
    const dayOfWeek = date.getDay() === 0 ? 7 : date.getDay();
    
    // First try to find specific work schedule for this day
    const specificSchedule = workSchedules.find(schedule => 
      schedule.day_of_week === dayOfWeek && schedule.enabled
    );
    
    if (specificSchedule) {
      return {
        start_time: specificSchedule.start_time,
        end_time: specificSchedule.end_time,
        type: 'specific'
      };
    }
    
    // Fallback to employee's default work schedule if they work on this day
    if (employee.work_days && Array.isArray(employee.work_days) && employee.work_days.includes(dayOfWeek)) {
      return {
        start_time: employee.start_time || '08:00:00',
        end_time: employee.end_time || '17:00:00',
        type: 'default'
      };
    }
    
    return null;
  };

  const getAvailabilityStatus = (availability, workSchedule) => {
    // If there's a specific availability entry, use that
    if (availability) {
      switch (availability.status) {
        case 'available':
          return { status: 'success', label: 'Available', color: 'success' };
        case 'unavailable':
          return { status: 'error', label: 'Unavailable', color: 'error' };
        case 'vacation':
          return { status: 'warning', label: 'Vacation', color: 'warning' };
        case 'sick':
          return { status: 'error', label: 'Sick', color: 'error' };
        case 'training':
          return { status: 'info', label: 'Training', color: 'info' };
        default:
          return { status: 'default', label: 'Unknown', color: 'default' };
      }
    }
    
    // If no availability entry, check work schedule
    if (workSchedule) {
      return { status: 'success', label: 'Scheduled', color: 'success' };
    }
    
    // No work schedule for this day
    return { status: 'default', label: 'Off Day', color: 'default' };
  };

  const formatTimeForDisplay = (timeString) => {
    if (!timeString) return '';
    const [hours, minutes] = timeString.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  const filteredEmployees = employees.filter(employee => {
    const shiftMatch = selectedShift === 'all' || employee.shift_type === selectedShift;
    const departmentMatch = selectedDepartment === 'all' || employee.department === selectedDepartment;
    return shiftMatch && departmentMatch;
  });

  const weekDays = getWeekDays();

  if (loading) {
    return (
      <Box>
        <LinearProgress />
        <Typography variant="h6" sx={{ mt: 2 }}>
          Loading operator schedules...
        </Typography>
      </Box>
    );
  }

  return (
    <Box>
      <Box sx={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: 2, 
        mb: 3,
        pb: 2,
        borderBottom: '1px solid',
        borderColor: 'divider'
      }}>
        <Logo 
          variant="horizontal" 
          color="primary" 
          height={36}
        />
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="h4" gutterBottom={false}>
            Operator Schedule
          </Typography>
          <Typography variant="subtitle1" color="text.secondary">
            Visual tracking of operator presence by shift
          </Typography>
        </Box>
      </Box>

      {/* Filters */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Grid container spacing={3} alignItems="center">
            <Grid item xs={12} sm={4}>
              <FormControl fullWidth>
                <InputLabel>Shift</InputLabel>
                <Select
                  value={selectedShift}
                  onChange={(e) => setSelectedShift(e.target.value)}
                  label="Shift"
                >
                  {shifts.map((shift) => (
                    <MenuItem key={shift.value} value={shift.value}>
                      {shift.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={4}>
              <FormControl fullWidth>
                <InputLabel>Department</InputLabel>
                <Select
                  value={selectedDepartment}
                  onChange={(e) => setSelectedDepartment(e.target.value)}
                  label="Department"
                >
                  <MenuItem value="all">All Departments</MenuItem>
                  {departments.map((dept) => (
                    <MenuItem key={dept} value={dept}>{dept}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={4}>
              <Typography variant="body2" color="textSecondary">
                Showing {filteredEmployees.length} of {employees.length} operators
              </Typography>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Week Navigation */}
      <Box sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
        <IconButton 
          onClick={() => setSelectedDate(new Date())}
          color="primary"
        >
          <TodayIcon />
        </IconButton>
        <Typography variant="h6">
          Week of {format(startOfWeek(selectedDate, { weekStartsOn: 1 }), 'MMM dd, yyyy')}
        </Typography>
        <IconButton 
          onClick={() => {
            const newDate = new Date(selectedDate);
            newDate.setDate(newDate.getDate() - 7);
            setSelectedDate(newDate);
          }}
        >
          ← Previous Week
        </IconButton>
        <IconButton 
          onClick={() => {
            const newDate = new Date(selectedDate);
            newDate.setDate(newDate.getDate() + 7);
            setSelectedDate(newDate);
          }}
        >
          Next Week →
        </IconButton>
      </Box>

      {/* Schedule Grid */}
      <Card>
        <CardContent sx={{ p: 0 }}>
          {loadingAvailability && <LinearProgress />}
          
          {/* Header Row */}
          <Box sx={{ 
            display: 'grid', 
            gridTemplateColumns: '250px repeat(7, 1fr)',
            borderBottom: '1px solid',
            borderColor: 'divider',
            backgroundColor: 'grey.50'
          }}>
            <Box sx={{ p: 2, borderRight: '1px solid', borderColor: 'divider' }}>
              <Typography variant="subtitle2" fontWeight="bold">
                Operator
              </Typography>
            </Box>
            {weekDays.map((day) => (
              <Box 
                key={day.toISOString()} 
                sx={{ 
                  p: 2, 
                  textAlign: 'center',
                  borderRight: '1px solid',
                  borderColor: 'divider',
                  backgroundColor: isToday(day) ? 'primary.light' : 'transparent'
                }}
              >
                <Typography variant="subtitle2" fontWeight="bold">
                  {format(day, 'EEE')}
                </Typography>
                <Typography variant="caption" color="textSecondary">
                  {format(day, 'MMM dd')}
                </Typography>
              </Box>
            ))}
          </Box>

          {/* Employee Rows */}
          {filteredEmployees.map((employee) => (
            <Box 
              key={employee.id}
              sx={{ 
                display: 'grid', 
                gridTemplateColumns: '250px repeat(7, 1fr)',
                borderBottom: '1px solid',
                borderColor: 'divider',
                '&:hover': { backgroundColor: 'action.hover' }
              }}
            >
              {/* Employee Info */}
              <Box sx={{ 
                p: 2, 
                borderRight: '1px solid', 
                borderColor: 'divider',
                display: 'flex',
                alignItems: 'center',
                gap: 2
              }}>
                <Avatar sx={{ bgcolor: 'primary.main', width: 32, height: 32 }}>
                  {employee.first_name.charAt(0)}{employee.last_name.charAt(0)}
                </Avatar>
                <Box>
                  <Typography variant="body2" fontWeight="medium">
                    {employee.first_name} {employee.last_name}
                  </Typography>
                  <Typography variant="caption" color="textSecondary">
                    {employee.position} • {employee.shift_type}
                  </Typography>
                </Box>
              </Box>

              {/* Daily Availability */}
              {weekDays.map((day) => {
                const availability = getEmployeeAvailabilityForDate(employee.id, day);
                const workSchedule = getEmployeeWorkScheduleForDate(employee.id, day);
                const status = getAvailabilityStatus(availability, workSchedule);
                
                // Determine what time to show
                let timeDisplay = null;
                if (availability && availability.start_time && availability.end_time) {
                  timeDisplay = `${formatTimeForDisplay(availability.start_time)} - ${formatTimeForDisplay(availability.end_time)}`;
                } else if (workSchedule) {
                  timeDisplay = `${formatTimeForDisplay(workSchedule.start_time)} - ${formatTimeForDisplay(workSchedule.end_time)}`;
                }
                
                return (
                  <Box 
                    key={day.toISOString()} 
                    sx={{ 
                      p: 1, 
                      borderRight: '1px solid',
                      borderColor: 'divider',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      minHeight: 80
                    }}
                  >
                    <Chip
                      label={status.label}
                      size="small"
                      color={status.color}
                      variant="outlined"
                      sx={{ mb: 0.5 }}
                    />
                    {timeDisplay && (
                      <Typography variant="caption" color="textSecondary" textAlign="center">
                        {timeDisplay}
                      </Typography>
                    )}
                    {availability && availability.reason && (
                      <Typography variant="caption" color="textSecondary" textAlign="center" sx={{ mt: 0.5 }}>
                        {availability.reason}
                      </Typography>
                    )}
                  </Box>
                );
              })}
            </Box>
          ))}
        </CardContent>
      </Card>

      {/* Legend */}
      <Card sx={{ mt: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Legend
          </Typography>
          <Grid container spacing={2}>
            <Grid item>
              <Chip label="Available" size="small" color="success" variant="outlined" />
            </Grid>
            <Grid item>
              <Chip label="Scheduled" size="small" color="success" variant="outlined" />
            </Grid>
            <Grid item>
              <Chip label="Unavailable" size="small" color="error" variant="outlined" />
            </Grid>
            <Grid item>
              <Chip label="Vacation" size="small" color="warning" variant="outlined" />
            </Grid>
            <Grid item>
              <Chip label="Sick" size="small" color="error" variant="outlined" />
            </Grid>
            <Grid item>
              <Chip label="Training" size="small" color="info" variant="outlined" />
            </Grid>
            <Grid item>
              <Chip label="Off Day" size="small" color="default" variant="outlined" />
            </Grid>
          </Grid>
        </CardContent>
      </Card>
    </Box>
  );
};

export default OperatorSchedule;
