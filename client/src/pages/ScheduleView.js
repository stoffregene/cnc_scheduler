import React, { useState, useEffect } from 'react';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Tooltip,
  Alert,
} from '@mui/material';
import {
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
  Today as TodayIcon,
  ViewWeek as ViewWeekIcon,
  ViewDay as ViewDayIcon,
  Edit as EditIcon,
  Schedule as ScheduleIcon,
  Person as PersonIcon,
  Build as BuildIcon,
} from '@mui/icons-material';
import { format, addDays, startOfWeek, startOfDay, parseISO, isSameDay } from 'date-fns';
import toast from 'react-hot-toast';

import { apiService } from '../services/apiService';

const ScheduleView = () => {
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState('week'); // day, week, month
  const [scheduleSlots, setScheduleSlots] = useState([]);
  const [machines, setMachines] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [editModalOpen, setEditModalOpen] = useState(false);

  useEffect(() => {
    fetchScheduleData();
    fetchMachines();
  }, [currentDate, viewMode]);

  const fetchScheduleData = async () => {
    try {
      setLoading(true);
      const startDate = getViewStartDate();
      const endDate = getViewEndDate();
      
      const response = await apiService.get('/api/scheduling/slots', {
        params: {
          start_date: format(startDate, 'yyyy-MM-dd'),
          end_date: format(endDate, 'yyyy-MM-dd')
        }
      });
      
      setScheduleSlots(response.data);
    } catch (error) {
      console.error('Error fetching schedule data:', error);
      toast.error('Failed to load schedule data');
    } finally {
      setLoading(false);
    }
  };

  const fetchMachines = async () => {
    try {
      const response = await apiService.get('/api/machines');
      setMachines(response.data);
    } catch (error) {
      console.error('Error fetching machines:', error);
    }
  };

  const getViewStartDate = () => {
    switch (viewMode) {
      case 'day':
        return startOfDay(currentDate);
      case 'week':
        return startOfWeek(currentDate, { weekStartsOn: 1 }); // Monday
      case 'month':
        const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
        return startOfWeek(startOfMonth, { weekStartsOn: 1 });
      default:
        return startOfDay(currentDate);
    }
  };

  const getViewEndDate = () => {
    const startDate = getViewStartDate();
    switch (viewMode) {
      case 'day':
        return addDays(startDate, 1);
      case 'week':
        return addDays(startDate, 7);
      case 'month':
        return addDays(startDate, 42); // 6 weeks to cover full month view
      default:
        return addDays(startDate, 1);
    }
  };

  const getDaysInView = () => {
    const startDate = getViewStartDate();
    const endDate = getViewEndDate();
    const days = [];
    let currentDay = new Date(startDate);
    
    while (currentDay < endDate) {
      days.push(new Date(currentDay));
      currentDay = addDays(currentDay, 1);
    }
    
    return days;
  };

  const getTimeSlots = () => {
    const slots = [];
    for (let hour = 6; hour < 22; hour++) {
      for (let minute = 0; minute < 60; minute += 15) {
        slots.push({ hour, minute, time: `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}` });
      }
    }
    return slots;
  };

  const getSlotPosition = (slot) => {
    const startTime = parseISO(slot.start_datetime);
    const endTime = parseISO(slot.end_datetime);
    
    const startHour = startTime.getHours() + startTime.getMinutes() / 60;
    const endHour = endTime.getHours() + endTime.getMinutes() / 60;
    
    // Calculate position within 6 AM - 10 PM range (16 hours)
    const startPosition = ((startHour - 6) / 16) * 100;
    const actualHeight = ((endHour - startHour) / 16) * 100;
    
    // Set minimum height for visibility (equivalent to ~30 minutes)
    const minHeight = (0.5 / 16) * 100; // 0.5 hours = 30 minutes
    const height = Math.max(minHeight, actualHeight);
    
    // Duration in minutes for conditional styling
    const durationMinutes = slot.duration_minutes || ((endHour - startHour) * 60);
    
    return {
      top: `${Math.max(0, startPosition)}%`,
      height: `${height}%`,
      actualHeight: actualHeight,
      isShort: durationMinutes <= 90, // 1.5 hours or less
      isVeryShort: durationMinutes <= 60, // 1 hour or less
      durationMinutes
    };
  };

  const getSlotColor = (slot) => {
    const colors = {
      'scheduled': '#2196f3',
      'in_progress': '#ff9800',
      'completed': '#4caf50',
      'cancelled': '#f44336'
    };
    return colors[slot.status] || '#9e9e9e';
  };

  const navigateDate = (direction) => {
    const increment = viewMode === 'day' ? 1 : viewMode === 'week' ? 7 : 30;
    setCurrentDate(prevDate => addDays(prevDate, direction === 'next' ? increment : -increment));
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  const handleSlotClick = (slot) => {
    setSelectedSlot(slot);
    setEditModalOpen(true);
  };

  const handleSlotEdit = async (updatedSlot) => {
    try {
      await apiService.put(`/api/scheduling/slots/${selectedSlot.id}`, updatedSlot);
      toast.success('Schedule updated successfully');
      setEditModalOpen(false);
      fetchScheduleData();
    } catch (error) {
      console.error('Error updating slot:', error);
      toast.error('Failed to update schedule');
    }
  };

  const formatViewTitle = () => {
    switch (viewMode) {
      case 'day':
        return format(currentDate, 'EEEE, MMMM d, yyyy');
      case 'week':
        const weekStart = getViewStartDate();
        const weekEnd = addDays(weekStart, 6);
        return `${format(weekStart, 'MMM d')} - ${format(weekEnd, 'MMM d, yyyy')}`;
      case 'month':
        return format(currentDate, 'MMMM yyyy');
      default:
        return '';
    }
  };

  const activeMachines = machines.filter(m => m.status === 'active');
  const daysInView = getDaysInView();

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" height="400px">
        <Typography>Loading schedule...</Typography>
      </Box>
    );
  }

  return (
    <Box>
      {/* Header */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" gutterBottom>
          Production Schedule
        </Typography>
        <Typography variant="subtitle1" color="text.secondary" gutterBottom>
          Visual scheduling with drag-and-drop manual overrides
        </Typography>
        
        {/* Navigation Controls */}
        <Box display="flex" justifyContent="space-between" alignItems="center" sx={{ mt: 2 }}>
          <Box display="flex" alignItems="center" gap={1}>
            <IconButton onClick={() => navigateDate('prev')}>
              <ChevronLeftIcon />
            </IconButton>
            <IconButton onClick={goToToday}>
              <TodayIcon />
            </IconButton>
            <IconButton onClick={() => navigateDate('next')}>
              <ChevronRightIcon />
            </IconButton>
            <Typography variant="h6" sx={{ ml: 2, minWidth: '200px' }}>
              {formatViewTitle()}
            </Typography>
          </Box>
          
          <Box display="flex" gap={1}>
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel>View</InputLabel>
              <Select
                value={viewMode}
                label="View"
                onChange={(e) => setViewMode(e.target.value)}
              >
                <MenuItem value="day">
                  <Box display="flex" alignItems="center" gap={1}>
                    <ViewDayIcon fontSize="small" />
                    Day
                  </Box>
                </MenuItem>
                <MenuItem value="week">
                  <Box display="flex" alignItems="center" gap={1}>
                    <ViewWeekIcon fontSize="small" />
                    Week
                  </Box>
                </MenuItem>
              </Select>
            </FormControl>
          </Box>
        </Box>
      </Box>

      {/* Schedule Grid */}
      <Card>
        <CardContent sx={{ p: 1 }}>
          <Box sx={{ overflowX: 'auto' }}>
            <Box sx={{ minWidth: viewMode === 'day' ? '800px' : '1400px' }}>
              {/* Header Row */}
              <Box display="flex" sx={{ borderBottom: '2px solid #e0e0e0' }}>
                <Box sx={{ width: '150px', p: 1, fontWeight: 'bold', borderRight: '1px solid #e0e0e0' }}>
                  Machine
                </Box>
                {daysInView.map((day, index) => (
                  <Box 
                    key={index}
                    sx={{ 
                      flex: 1, 
                      p: 1, 
                      textAlign: 'center', 
                      fontWeight: 'bold',
                      borderRight: index < daysInView.length - 1 ? '1px solid #e0e0e0' : 'none',
                      backgroundColor: isSameDay(day, new Date()) ? '#e3f2fd' : 'transparent'
                    }}
                  >
                    <Typography variant="subtitle2">
                      {format(day, 'EEE')}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {format(day, 'MMM d')}
                    </Typography>
                  </Box>
                ))}
              </Box>

              {/* Machine Rows */}
              {activeMachines.map((machine) => (
                <Box key={machine.id} display="flex" sx={{ borderBottom: '1px solid #e0e0e0', minHeight: '80px' }}>
                  <Box 
                    sx={{ 
                      width: '150px', 
                      p: 1, 
                      borderRight: '1px solid #e0e0e0',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'center'
                    }}
                  >
                    <Box display="flex" alignItems="center" gap={1}>
                      <BuildIcon fontSize="small" color="primary" />
                      <Typography variant="body2" fontWeight="bold">
                        {machine.name}
                      </Typography>
                    </Box>
                    <Typography variant="caption" color="text.secondary">
                      {machine.model}
                    </Typography>
                  </Box>
                  
                  {daysInView.map((day, dayIndex) => {
                    const daySlots = scheduleSlots.filter(slot => 
                      slot.machine_id === machine.id && 
                      isSameDay(parseISO(slot.start_datetime), day)
                    );
                    
                    return (
                      <Box 
                        key={dayIndex}
                        sx={{ 
                          flex: 1, 
                          position: 'relative',
                          borderRight: dayIndex < daysInView.length - 1 ? '1px solid #e0e0e0' : 'none',
                          backgroundColor: isSameDay(day, new Date()) ? '#f8fcff' : 'transparent',
                          minHeight: '80px'
                        }}
                      >
                        {daySlots.map((slot) => {
                          const position = getSlotPosition(slot);
                          const color = getSlotColor(slot);
                          
                          return (
                            <Tooltip
                              key={slot.id}
                              title={
                                <Box>
                                  <Typography variant="body2" fontWeight="bold">
                                    {slot.job_number} - {slot.operation_name}
                                  </Typography>
                                  <Typography variant="caption">
                                    {slot.customer_name} • {slot.part_name}
                                  </Typography>
                                  <br />
                                  <Typography variant="caption">
                                    {format(parseISO(slot.start_datetime), 'h:mm a')} - {format(parseISO(slot.end_datetime), 'h:mm a')}
                                  </Typography>
                                  <br />
                                  <Typography variant="caption">
                                    Operator: {slot.employee_name}
                                  </Typography>
                                  <br />
                                  <Typography variant="caption">
                                    Duration: {Math.round(position.durationMinutes)} minutes
                                  </Typography>
                                  {slot.notes && (
                                    <>
                                      <br />
                                      <Typography variant="caption" style={{ fontStyle: 'italic' }}>
                                        {slot.notes}
                                      </Typography>
                                    </>
                                  )}
                                </Box>
                              }
                            >
                              <Box
                                onClick={() => handleSlotClick(slot)}
                                sx={{
                                  position: 'absolute',
                                  left: '2px',
                                  right: '2px',
                                  top: position.top,
                                  height: position.height,
                                  backgroundColor: color,
                                  borderRadius: '4px',
                                  border: position.isShort ? '2px solid rgba(255,255,255,0.6)' : '1px solid rgba(255,255,255,0.3)',
                                  cursor: 'pointer',
                                  overflow: 'hidden',
                                  boxShadow: position.isShort ? '0 2px 4px rgba(0,0,0,0.3)' : 'none',
                                  '&:hover': {
                                    opacity: 0.8,
                                    transform: 'scale(1.02)',
                                    boxShadow: '0 4px 8px rgba(0,0,0,0.4)'
                                  },
                                  transition: 'all 0.2s ease'
                                }}
                              >
                                <Box 
                                  sx={{ 
                                    p: position.isVeryShort ? 0.25 : 0.5, 
                                    color: 'white', 
                                    fontSize: position.isVeryShort ? '10px' : '11px',
                                    lineHeight: position.isVeryShort ? '1.1' : '1.2',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    height: '100%',
                                    justifyContent: position.isVeryShort ? 'center' : 'flex-start'
                                  }}
                                >
                                  {position.isVeryShort ? (
                                    // Very short operations: show minimal info, centered
                                    <Box sx={{ textAlign: 'center' }}>
                                      <Typography 
                                        variant="caption" 
                                        display="block" 
                                        fontWeight="bold" 
                                        noWrap
                                        sx={{ fontSize: 'inherit', lineHeight: 'inherit' }}
                                      >
                                        {slot.job_number}
                                      </Typography>
                                      <Typography 
                                        variant="caption" 
                                        display="block" 
                                        noWrap
                                        sx={{ fontSize: '9px', opacity: 0.9 }}
                                      >
                                        {Math.round(position.durationMinutes)}min
                                      </Typography>
                                    </Box>
                                  ) : position.isShort ? (
                                    // Short operations: show compact info
                                    <>
                                      <Typography 
                                        variant="caption" 
                                        display="block" 
                                        fontWeight="bold" 
                                        noWrap
                                        sx={{ fontSize: 'inherit' }}
                                      >
                                        {slot.job_number}
                                      </Typography>
                                      <Typography 
                                        variant="caption" 
                                        display="block" 
                                        noWrap
                                        sx={{ fontSize: '10px' }}
                                      >
                                        {slot.operation_name}
                                      </Typography>
                                    </>
                                  ) : (
                                    // Normal operations: show full info
                                    <>
                                      <Typography variant="caption" display="block" fontWeight="bold" noWrap>
                                        {slot.job_number}
                                      </Typography>
                                      <Typography variant="caption" display="block" noWrap>
                                        {slot.operation_name}
                                      </Typography>
                                      <Typography variant="caption" display="block" noWrap>
                                        {format(parseISO(slot.start_datetime), 'h:mm a')}
                                      </Typography>
                                    </>
                                  )}
                                </Box>
                              </Box>
                            </Tooltip>
                          );
                        })}
                      </Box>
                    );
                  })}
                </Box>
              ))}
            </Box>
          </Box>
        </CardContent>
      </Card>

      {/* Time Scale Legend */}
      <Card sx={{ mt: 2 }}>
        <CardContent>
          <Box display="flex" alignItems="center" gap={2}>
            <Typography variant="subtitle2">Schedule Legend:</Typography>
            <Chip size="small" sx={{ backgroundColor: '#2196f3', color: 'white' }} label="Scheduled" />
            <Chip size="small" sx={{ backgroundColor: '#ff9800', color: 'white' }} label="In Progress" />
            <Chip size="small" sx={{ backgroundColor: '#4caf50', color: 'white' }} label="Completed" />
            <Chip size="small" sx={{ backgroundColor: '#f44336', color: 'white' }} label="Cancelled" />
            <Typography variant="caption" sx={{ ml: 2 }}>
              Operating Hours: 6:00 AM - 10:00 PM
            </Typography>
          </Box>
        </CardContent>
      </Card>

      {/* Edit Slot Modal */}
      <Dialog open={editModalOpen} onClose={() => setEditModalOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          Edit Schedule Slot
        </DialogTitle>
        <DialogContent>
          {selectedSlot && (
            <Box sx={{ pt: 1 }}>
              <Alert severity="info" sx={{ mb: 2 }}>
                Manual override functionality will be implemented in the next iteration.
                Currently showing slot details for reference.
              </Alert>
              
              <Typography variant="subtitle2" gutterBottom>
                Job: {selectedSlot.job_number} - {selectedSlot.operation_name}
              </Typography>
              <Typography variant="body2" gutterBottom>
                Customer: {selectedSlot.customer_name}
              </Typography>
              <Typography variant="body2" gutterBottom>
                Part: {selectedSlot.part_name}
              </Typography>
              <Typography variant="body2" gutterBottom>
                Machine: {selectedSlot.machine_name}
              </Typography>
              <Typography variant="body2" gutterBottom>
                Operator: {selectedSlot.employee_name}
              </Typography>
              <Typography variant="body2" gutterBottom>
                Time: {format(parseISO(selectedSlot.start_datetime), 'MMM d, yyyy h:mm a')} - {format(parseISO(selectedSlot.end_datetime), 'h:mm a')}
              </Typography>
              <Typography variant="body2" gutterBottom>
                Duration: {selectedSlot.duration_minutes} minutes
              </Typography>
              {selectedSlot.notes && (
                <Typography variant="body2" gutterBottom>
                  Notes: {selectedSlot.notes}
                </Typography>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditModalOpen(false)}>
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ScheduleView;
