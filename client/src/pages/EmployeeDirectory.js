import React, { useState, useEffect } from 'react';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  IconButton,
  LinearProgress,
  Avatar,
  Divider,
  Tooltip,
  Switch,
  FormControlLabel,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Schedule as ScheduleIcon,
  Person as PersonIcon,
  Visibility as VisibilityIcon,
} from '@mui/icons-material';
import { TimePicker } from '@mui/x-date-pickers/TimePicker';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';

import { format, parseISO } from 'date-fns';
import toast from 'react-hot-toast';

import { apiService } from '../services/apiService';
import Logo from '../components/Logo';
import { useNavigate } from 'react-router-dom';

const EmployeeDirectory = () => {
  const navigate = useNavigate();
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [availabilityDialogOpen, setAvailabilityDialogOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [formData, setFormData] = useState({
    employee_id: '',
    first_name: '',
    last_name: '',
    department: '',
    position: '',
    shift_type: 'day',
    work_schedule: {
      monday: { enabled: false, start_time: null, end_time: null },
      tuesday: { enabled: false, start_time: null, end_time: null },
      wednesday: { enabled: false, start_time: null, end_time: null },
      thursday: { enabled: false, start_time: null, end_time: null },
      friday: { enabled: false, start_time: null, end_time: null },
      saturday: { enabled: false, start_time: null, end_time: null },
      sunday: { enabled: false, start_time: null, end_time: null },
    },
    status: 'active',
  });
  const [availabilityData, setAvailabilityData] = useState({
    start_date: new Date(),
    end_date: new Date(),
    start_time: null,
    end_time: null,
    status: 'available',
    reason: '',
    notes: '',
  });
  const [existingAvailability, setExistingAvailability] = useState([]);
  const [loadingAvailability, setLoadingAvailability] = useState(false);

  const departments = ['Production', 'Quality Control', 'Maintenance', 'Engineering', 'Management'];
  const positions = ['Operator', 'Lead', 'Supervisor', 'Manager', 'Engineer', 'Technician'];
  const shiftTypes = ['day', 'night', 'swing'];
  const availabilityStatuses = ['available', 'unavailable', 'vacation', 'sick', 'training'];

  // Helper function to convert time string to Date object for TimePicker
  const convertTimeStringToDate = (timeString) => {
    if (!timeString) return null;
    if (timeString instanceof Date) return timeString;
    
    // Parse time string like "08:00:00" to Date object
    const [hours, minutes, seconds] = timeString.split(':').map(Number);
    const date = new Date();
    date.setHours(hours, minutes, seconds || 0, 0);
    return date;
  };

  // Helper function to convert Date to time string
  const convertDateToTimeString = (date) => {
    if (!date) return null;
    if (date instanceof Date) {
      return date.toTimeString().slice(0, 8);
    }
    return date;
  };

  useEffect(() => {
    fetchEmployees();
  }, []);

  const fetchEmployees = async () => {
    try {
      setLoading(true);
      const response = await apiService.employees.getAll();
      setEmployees(response.data);
    } catch (error) {
      console.error('Error fetching employees:', error);
      toast.error('Failed to load employees');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = async (employee = null) => {
    if (employee) {
      setEditingEmployee(employee);
      // Convert existing work_days array to new work_schedule format
      const workSchedule = {
        monday: { enabled: false, start_time: null, end_time: null },
        tuesday: { enabled: false, start_time: null, end_time: null },
        wednesday: { enabled: false, start_time: null, end_time: null },
        thursday: { enabled: false, start_time: null, end_time: null },
        friday: { enabled: false, start_time: null, end_time: null },
        saturday: { enabled: false, start_time: null, end_time: null },
        sunday: { enabled: false, start_time: null, end_time: null },
      };

      try {
        // Load work schedules from the new API
        const workSchedulesResponse = await apiService.employees.getWorkSchedules(employee.id);
        const workSchedules = workSchedulesResponse.data;
        
        // Convert work schedules to the form format
        const dayMap = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
        workSchedules.forEach(schedule => {
          if (schedule.day_of_week >= 1 && schedule.day_of_week <= 7) {
            const dayName = dayMap[schedule.day_of_week - 1];
            workSchedule[dayName] = {
              enabled: schedule.enabled,
              start_time: convertTimeStringToDate(schedule.start_time),
              end_time: convertTimeStringToDate(schedule.end_time)
            };
          }
        });
      } catch (error) {
        console.error('Error loading work schedules:', error);
        // Fallback to old method if work schedules API fails
        if (employee.work_days && Array.isArray(employee.work_days)) {
          const dayMap = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
          employee.work_days.forEach(dayIndex => {
            if (dayIndex >= 1 && dayIndex <= 7) {
              const dayName = dayMap[dayIndex - 1];
              workSchedule[dayName] = {
                enabled: true,
                start_time: convertTimeStringToDate(employee.start_time || '08:00:00'),
                end_time: convertTimeStringToDate(employee.end_time || '17:00:00')
              };
            }
          });
        }
      }

      setFormData({
        employee_id: employee.employee_id,
        first_name: employee.first_name,
        last_name: employee.last_name,
        department: employee.department,
        position: employee.position,
        shift_type: employee.shift_type,
        work_schedule: workSchedule,
        status: employee.status,
      });
    } else {
      setEditingEmployee(null);
      setFormData({
        employee_id: '',
        first_name: '',
        last_name: '',
        department: '',
        position: '',
        shift_type: 'day',
        work_schedule: {
          monday: { enabled: false, start_time: null, end_time: null },
          tuesday: { enabled: false, start_time: null, end_time: null },
          wednesday: { enabled: false, start_time: null, end_time: null },
          thursday: { enabled: false, start_time: null, end_time: null },
          friday: { enabled: false, start_time: null, end_time: null },
          saturday: { enabled: false, start_time: null, end_time: null },
          sunday: { enabled: false, start_time: null, end_time: null },
        },
        status: 'active',
      });
    }
    setDialogOpen(true);
  };

  const handleOpenAvailabilityDialog = async (employee) => {
    setSelectedEmployee(employee);
    setAvailabilityData({
      start_date: new Date(),
      end_date: new Date(),
      start_time: null,
      end_time: null,
      status: 'available',
      reason: '',
      notes: '',
    });
    setAvailabilityDialogOpen(true);
    
    // Load existing availability entries
    try {
      setLoadingAvailability(true);
      const response = await apiService.employees.getAvailability(employee.id);
      setExistingAvailability(response.data);
    } catch (error) {
      console.error('Error loading availability:', error);
      toast.error('Failed to load existing availability');
    } finally {
      setLoadingAvailability(false);
    }
  };

  const handleSubmit = async () => {
    try {
      // Convert work_schedule to the new format for the work_schedules table
      const dayMap = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
      const workSchedules = [];
      const workDays = [];
      
      // Process each day in the work schedule
      Object.entries(formData.work_schedule).forEach(([day, schedule]) => {
        const dayIndex = dayMap.indexOf(day) + 1;
        
        if (schedule.enabled) {
          workDays.push(dayIndex);
          
          // Convert Date objects to time strings if needed
          const startTime = convertDateToTimeString(schedule.start_time) || '08:00:00';
          const endTime = convertDateToTimeString(schedule.end_time) || '17:00:00';
          
          workSchedules.push({
            day_of_week: dayIndex,
            start_time: startTime,
            end_time: endTime,
            enabled: true
          });
        }
      });
      
      // Prepare basic employee data (without work schedule details)
      const submitData = {
        ...formData,
        work_days: workDays,
        start_time: '08:00:00', // Keep for backward compatibility
        end_time: '17:00:00',   // Keep for backward compatibility
      };
      
      // Remove work_schedule from submit data as it's not in the database
      delete submitData.work_schedule;
      
      if (editingEmployee) {
        // Update employee basic info
        await apiService.employees.update(editingEmployee.id, submitData);
        
        // Update work schedules separately
        await apiService.employees.updateWorkSchedules(editingEmployee.id, { work_schedules: workSchedules });
        
        toast.success('Employee updated successfully');
      } else {
        // Create new employee
        const newEmployee = await apiService.employees.create(submitData);
        
        // Add work schedules for the new employee
        if (workSchedules.length > 0) {
          await apiService.employees.updateWorkSchedules(newEmployee.data.id, { work_schedules: workSchedules });
        }
        
        toast.success('Employee created successfully');
      }
      setDialogOpen(false);
      fetchEmployees();
    } catch (error) {
      console.error('Error saving employee:', error);
      toast.error('Failed to save employee');
    }
  };

  const handleAvailabilitySubmit = async () => {
    try {
      // Create multiple availability entries for the date range
      const startDate = new Date(availabilityData.start_date);
      const endDate = new Date(availabilityData.end_date);
      
      // Generate all dates in the range
      const dates = [];
      const currentDate = new Date(startDate);
      while (currentDate <= endDate) {
        dates.push(new Date(currentDate));
        currentDate.setDate(currentDate.getDate() + 1);
      }
      
      // Create availability entries for each date
      const promises = dates.map(date => {
        const entryData = {
          ...availabilityData,
          date: date.toISOString().split('T')[0], // Format as YYYY-MM-DD
        };
        return apiService.employees.addAvailability(selectedEmployee.id, entryData);
      });
      
      await Promise.all(promises);
      toast.success(`Availability updated for ${dates.length} day${dates.length > 1 ? 's' : ''}`);
      
      // Refresh the availability list
      const response = await apiService.employees.getAvailability(selectedEmployee.id);
      setExistingAvailability(response.data);
    } catch (error) {
      console.error('Error updating availability:', error);
      toast.error('Failed to update availability');
    }
  };

  const handleDeleteAvailability = async (availabilityId) => {
    if (window.confirm('Are you sure you want to delete this availability entry?')) {
      try {
        await apiService.employees.deleteAvailability(availabilityId);
        toast.success('Availability entry deleted');
        
        // Refresh the availability list
        const response = await apiService.employees.getAvailability(selectedEmployee.id);
        setExistingAvailability(response.data);
      } catch (error) {
        console.error('Error deleting availability:', error);
        toast.error('Failed to delete availability entry');
      }
    }
  };

  const handleDelete = async (employee) => {
    if (window.confirm(`Are you sure you want to delete ${employee.first_name} ${employee.last_name}?`)) {
      try {
        await apiService.employees.delete(employee.id);
        toast.success('Employee deleted successfully');
        fetchEmployees();
      } catch (error) {
        console.error('Error deleting employee:', error);
        toast.error('Failed to delete employee');
      }
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'active':
        return 'success';
      case 'inactive':
        return 'error';
      default:
        return 'default';
    }
  };



  const getWorkDaysText = (workDays) => {
    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    return workDays.map(day => dayNames[day - 1]).join(', ');
  };

  const handleWorkScheduleChange = (day, field, value) => {
    setFormData(prev => ({
      ...prev,
      work_schedule: {
        ...prev.work_schedule,
        [day]: {
          ...prev.work_schedule[day],
          [field]: value
        }
      }
    }));
  };

  const formatTimeForDisplay = (timeString) => {
    if (!timeString) return '';
    const [hours, minutes] = timeString.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  const EmployeeCard = ({ employee }) => {
    const [workSchedules, setWorkSchedules] = useState([]);
    const [loadingSchedules, setLoadingSchedules] = useState(false);

    // Load work schedules for this employee
    useEffect(() => {
      const loadWorkSchedules = async () => {
        try {
          setLoadingSchedules(true);
          const response = await apiService.employees.getWorkSchedules(employee.id);
          setWorkSchedules(response.data);
        } catch (error) {
          console.error('Error loading work schedules:', error);
          // If work schedules fail to load, we'll show the old format
        } finally {
          setLoadingSchedules(false);
        }
      };

      loadWorkSchedules();
    }, [employee.id]);

    const getWorkScheduleText = () => {
      if (loadingSchedules) return 'Loading...';
      
      if (workSchedules.length > 0) {
        const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        return workSchedules
          .filter(schedule => schedule.enabled)
          .map(schedule => {
            const dayName = dayNames[schedule.day_of_week - 1];
            const startTime = formatTimeForDisplay(schedule.start_time);
            const endTime = formatTimeForDisplay(schedule.end_time);
            return `${dayName}: ${startTime}-${endTime}`;
          })
          .join(', ');
      }
      
      // Fallback to old format
      return `${formatTimeForDisplay(employee.start_time)} - ${formatTimeForDisplay(employee.end_time)}`;
    };

    return (
      <Card sx={{ height: '100%' }}>
        <CardContent>
          <Box display="flex" alignItems="center" mb={2}>
            <Avatar sx={{ mr: 2, bgcolor: 'primary.main' }}>
              {employee.first_name.charAt(0)}{employee.last_name.charAt(0)}
            </Avatar>
            <Box flex={1}>
              <Typography variant="h6" component="div">
                {employee.first_name} {employee.last_name}
              </Typography>
              <Typography variant="body2" color="textSecondary">
                {employee.position} • {employee.department}
              </Typography>
            </Box>
            <Box>
              <Chip
                label={employee.status}
                size="small"
                color={getStatusColor(employee.status)}
              />
            </Box>
          </Box>

          <Box mb={2}>
            <Typography variant="body2" display="flex" alignItems="center" mb={1}>
              <PersonIcon sx={{ mr: 1, fontSize: 16 }} />
              ID: {employee.employee_id}
            </Typography>
          </Box>

          <Divider sx={{ my: 2 }} />

          <Box mb={2}>
            <Typography variant="body2" gutterBottom>
              <strong>Shift:</strong> {employee.shift_type.charAt(0).toUpperCase() + employee.shift_type.slice(1)}
            </Typography>
            <Typography variant="body2" gutterBottom>
              <strong>Work Days:</strong> {getWorkDaysText(employee.work_days)}
            </Typography>
            <Typography variant="body2" gutterBottom>
              <strong>Hours:</strong> {getWorkScheduleText()}
            </Typography>
          </Box>

          <Box display="flex" justifyContent="space-between" alignItems="center">
            <Typography variant="body2" color="textSecondary">
              {employee.active_schedules || 0} active schedules
            </Typography>
            <Box>
              <Tooltip title="Edit Employee">
                <IconButton size="small" onClick={() => handleOpenDialog(employee)}>
                  <EditIcon />
                </IconButton>
              </Tooltip>
              <Tooltip title="Manage Availability">
                <IconButton size="small" onClick={() => handleOpenAvailabilityDialog(employee)}>
                  <ScheduleIcon />
                </IconButton>
              </Tooltip>
              <Tooltip title="Delete Employee">
                <IconButton size="small" onClick={() => handleDelete(employee)}>
                  <DeleteIcon />
                </IconButton>
              </Tooltip>
            </Box>
          </Box>
        </CardContent>
      </Card>
    );
  };

  if (loading) {
    return (
      <Box>
        <LinearProgress />
        <Typography variant="h6" sx={{ mt: 2 }}>
          Loading employees...
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
            Employee Directory
          </Typography>
          <Typography variant="subtitle1" color="text.secondary">
            Manage workforce and availability schedules
          </Typography>
        </Box>
                 <Box sx={{ display: 'flex', gap: 2 }}>
           <Button
             variant="outlined"
             startIcon={<VisibilityIcon />}
             onClick={() => navigate('/operator-schedule')}
           >
             View Schedule
           </Button>
           <Button
             variant="contained"
             startIcon={<AddIcon />}
             onClick={() => handleOpenDialog()}
           >
             Add Employee
           </Button>
         </Box>
      </Box>

      <Grid container spacing={3}>
        {employees.map((employee) => (
          <Grid item xs={12} sm={6} md={4} lg={3} key={employee.id}>
            <EmployeeCard employee={employee} />
          </Grid>
        ))}
      </Grid>

      {/* Employee Form Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          {editingEmployee ? 'Edit Employee' : 'Add New Employee'}
        </DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Employee ID"
                value={formData.employee_id}
                onChange={(e) => setFormData({ ...formData, employee_id: e.target.value })}
                required
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="First Name"
                value={formData.first_name}
                onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                required
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Last Name"
                value={formData.last_name}
                onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                required
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Department</InputLabel>
                <Select
                  value={formData.department}
                  onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                >
                  {departments.map((dept) => (
                    <MenuItem key={dept} value={dept}>{dept}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Position</InputLabel>
                <Select
                  value={formData.position}
                  onChange={(e) => setFormData({ ...formData, position: e.target.value })}
                >
                  {positions.map((pos) => (
                    <MenuItem key={pos} value={pos}>{pos}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Shift Type</InputLabel>
                <Select
                  value={formData.shift_type}
                  onChange={(e) => setFormData({ ...formData, shift_type: e.target.value })}
                >
                  {shiftTypes.map((shift) => (
                    <MenuItem key={shift} value={shift}>
                      {shift.charAt(0).toUpperCase() + shift.slice(1)}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            
            {/* Work Schedule Section */}
            <Grid item xs={12}>
              <Typography variant="h6" gutterBottom sx={{ mt: 2, mb: 1 }}>
                Work Schedule
              </Typography>
              <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
                Select which days the employee works and set their hours for each day
              </Typography>
            </Grid>
            
            {Object.entries(formData.work_schedule).map(([day, schedule]) => (
              <Grid item xs={12} key={day}>
                <Box sx={{ 
                  border: '1px solid', 
                  borderColor: 'divider', 
                  borderRadius: 1, 
                  p: 2,
                  backgroundColor: schedule.enabled ? 'action.hover' : 'background.paper'
                }}>
                  <Grid container spacing={2} alignItems="center">
                    <Grid item xs={12} sm={2}>
                      <FormControlLabel
                        control={
                          <Switch
                            checked={schedule.enabled}
                            onChange={(e) => handleWorkScheduleChange(day, 'enabled', e.target.checked)}
                          />
                        }
                        label={day.charAt(0).toUpperCase() + day.slice(1)}
                      />
                    </Grid>
                    <Grid item xs={12} sm={5}>
                      <TimePicker
                        label="Start Time"
                        value={schedule.start_time}
                        onChange={(time) => handleWorkScheduleChange(day, 'start_time', time)}
                        renderInput={(params) => <TextField {...params} fullWidth />}
                        disabled={!schedule.enabled}
                      />
                    </Grid>
                    <Grid item xs={12} sm={5}>
                      <TimePicker
                        label="End Time"
                        value={schedule.end_time}
                        onChange={(time) => handleWorkScheduleChange(day, 'end_time', time)}
                        renderInput={(params) => <TextField {...params} fullWidth />}
                        disabled={!schedule.enabled}
                      />
                    </Grid>
                  </Grid>
                </Box>
              </Grid>
            ))}
            
            <Grid item xs={12}>
              <FormControlLabel
                control={
                  <Switch
                    checked={formData.status === 'active'}
                    onChange={(e) => setFormData({ 
                      ...formData, 
                      status: e.target.checked ? 'active' : 'inactive' 
                    })}
                  />
                }
                label="Active Employee"
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleSubmit} variant="contained">
            {editingEmployee ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Availability Dialog */}
      <Dialog open={availabilityDialogOpen} onClose={() => setAvailabilityDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          Manage Availability - {selectedEmployee?.first_name} {selectedEmployee?.last_name}
        </DialogTitle>
        <DialogContent>
          <Grid container spacing={3}>
                        <Grid item xs={12}>
              <Typography variant="h6" gutterBottom>
                Add New Availability
              </Typography>
            </Grid>
            <Grid item xs={12} sm={6}>
              <DatePicker
                label="Start Date"
                value={availabilityData.start_date}
                onChange={(date) => setAvailabilityData({ ...availabilityData, start_date: date })}
                renderInput={(params) => <TextField {...params} fullWidth />}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <DatePicker
                label="End Date"
                value={availabilityData.end_date}
                onChange={(date) => setAvailabilityData({ ...availabilityData, end_date: date })}
                renderInput={(params) => <TextField {...params} fullWidth />}
                minDate={availabilityData.start_date}
              />
            </Grid>
            <Grid item xs={12}>
              <Typography variant="body2" color="textSecondary">
                {availabilityData.start_date && availabilityData.end_date ? 
                  `Selected: ${Math.ceil((availabilityData.end_date - availabilityData.start_date) / (1000 * 60 * 60 * 24)) + 1} day${Math.ceil((availabilityData.end_date - availabilityData.start_date) / (1000 * 60 * 60 * 24)) + 1 > 1 ? 's' : ''}` : 
                  'Select start and end dates'
                }
              </Typography>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TimePicker
                label="Start Time"
                value={availabilityData.start_time}
                onChange={(time) => setAvailabilityData({ ...availabilityData, start_time: time })}
                renderInput={(params) => <TextField {...params} fullWidth />}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TimePicker
                label="End Time"
                value={availabilityData.end_time}
                onChange={(time) => setAvailabilityData({ ...availabilityData, end_time: time })}
                renderInput={(params) => <TextField {...params} fullWidth />}
              />
            </Grid>
            <Grid item xs={12}>
              <FormControl fullWidth>
                <InputLabel>Status</InputLabel>
                <Select
                  value={availabilityData.status}
                  onChange={(e) => setAvailabilityData({ ...availabilityData, status: e.target.value })}
                >
                  {availabilityStatuses.map((status) => (
                    <MenuItem key={status} value={status}>
                      {status.charAt(0).toUpperCase() + status.slice(1)}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Reason"
                value={availabilityData.reason}
                onChange={(e) => setAvailabilityData({ ...availabilityData, reason: e.target.value })}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Notes"
                multiline
                rows={3}
                value={availabilityData.notes}
                onChange={(e) => setAvailabilityData({ ...availabilityData, notes: e.target.value })}
              />
            </Grid>
          </Grid>

          {/* Existing Availability Section */}
          <Box sx={{ mt: 4 }}>
            <Typography variant="h6" gutterBottom>
              Existing Availability Entries
            </Typography>
            {loadingAvailability ? (
              <LinearProgress />
            ) : existingAvailability.length > 0 ? (
              <Grid container spacing={2}>
                {existingAvailability.map((entry) => (
                  <Grid item xs={12} key={entry.id}>
                    <Card variant="outlined">
                      <CardContent sx={{ py: 1 }}>
                        <Box display="flex" justifyContent="space-between" alignItems="center">
                          <Box>
                            <Typography variant="body2">
                              <strong>{format(parseISO(entry.date), 'MMM dd, yyyy')}</strong>
                              {entry.start_time && entry.end_time && (
                                <span> • {formatTimeForDisplay(entry.start_time)} - {formatTimeForDisplay(entry.end_time)}</span>
                              )}
                            </Typography>
                            <Typography variant="body2" color="textSecondary">
                              <Chip 
                                label={entry.status} 
                                size="small" 
                                color={entry.status === 'available' ? 'success' : 'warning'}
                                sx={{ mr: 1 }}
                              />
                              {entry.reason && ` • ${entry.reason}`}
                            </Typography>
                            {entry.notes && (
                              <Typography variant="caption" color="textSecondary">
                                {entry.notes}
                              </Typography>
                            )}
                          </Box>
                          <IconButton 
                            size="small" 
                            onClick={() => handleDeleteAvailability(entry.id)}
                            color="error"
                          >
                            <DeleteIcon />
                          </IconButton>
                        </Box>
                      </CardContent>
                    </Card>
                  </Grid>
                ))}
              </Grid>
            ) : (
              <Typography variant="body2" color="textSecondary">
                No availability entries found.
              </Typography>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAvailabilityDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleAvailabilitySubmit} variant="contained">
            Save Availability
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default EmployeeDirectory;

