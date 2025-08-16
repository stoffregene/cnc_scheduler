import React, { useState, useEffect } from 'react';
import {
  Box,
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
  Divider,
} from '@mui/material';
import {
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
  Today as TodayIcon,
  ViewWeek as ViewWeekIcon,
  ViewDay as ViewDayIcon,
  Schedule as ScheduleIcon,
  Build as BuildIcon,
  ClearAll as ClearAllIcon,
  Lock as LockIcon,
} from '@mui/icons-material';
import { format, addDays, startOfWeek, startOfDay, parseISO, isSameDay } from 'date-fns';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import toast from 'react-hot-toast';

import { apiService } from '../services/apiService';

// Manual Reschedule Controls Component
const ManualRescheduleControls = ({ selectedSlot, onReschedule, machines, machineGroups }) => {
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedMachine, setSelectedMachine] = useState('');
  const [loading, setLoading] = useState(false);
  const [availableMachines, setAvailableMachines] = useState([]);
  const [availableGroups, setAvailableGroups] = useState([]);

  // No need to fetch machine groups locally - passed as prop

  useEffect(() => {
    // Filter machines and groups that can perform this operation
    if (machines && selectedSlot) {
      const isInspectOperation = selectedSlot.operation_name?.toLowerCase().includes('inspect');
      
      let suitableMachines;
      if (isInspectOperation) {
        // INSPECT operations can only go to INSPECT machines
        suitableMachines = machines.filter(m => 
          m.status === 'active' && 
          m.name?.toLowerCase().includes('inspect')
        );
      } else {
        // Production operations cannot go to INSPECT machines
        suitableMachines = machines.filter(m => 
          m.status === 'active' && 
          !m.name?.toLowerCase().includes('inspect')
        );
      }
      
      setAvailableMachines(suitableMachines);
      
      // Filter machine groups that have machines suitable for this operation
      if (machineGroups && machineGroups.length > 0) {
        const suitableGroups = machineGroups.filter(group => {
          const groupMachines = suitableMachines.filter(m => 
            m.groups && m.groups.some(g => g.id === group.id)
          );
          return groupMachines.length > 0;
        });
        setAvailableGroups(suitableGroups);
      }
      
      // Default to current machine if it's suitable
      if (suitableMachines.find(m => m.id === selectedSlot.machine_id)) {
        setSelectedMachine(selectedSlot.machine_id.toString());
      } else if (suitableMachines.length > 0) {
        setSelectedMachine(suitableMachines[0].id.toString());
      }
    }
  }, [machines, selectedSlot, machineGroups]);

  if (!selectedSlot || !machines || !machineGroups) return null;

  const currentDate = parseISO(selectedSlot.start_datetime);
  const currentMachine = machines?.find(m => m.id === selectedSlot.machine_id);

  const handleDateChange = (newDate) => {
    setSelectedDate(newDate);
  };

  const handleMachineChange = (event) => {
    console.log('🔧 Machine selection changed to:', event.target.value);
    setSelectedMachine(event.target.value);
  };

  const handleRescheduleClick = async () => {
    if (!selectedDate) {
      toast.error('Please select a date first');
      return;
    }

    // Validate the selected date
    if (!(selectedDate instanceof Date) || isNaN(selectedDate.getTime())) {
      toast.error('Invalid date selected. Please choose a valid date.');
      return;
    }

    setLoading(true);
    try {
      // Handle both machine and group selection
      const rescheduleOptions = {
        date: selectedDate
      };
      
      if (selectedMachine.startsWith('group-')) {
        // Machine group selected - extract group ID and let scheduler pick machine
        rescheduleOptions.machineGroupId = parseInt(selectedMachine.replace('group-', ''));
        console.log('🏭 Rescheduling to machine group:', rescheduleOptions.machineGroupId);
      } else {
        // Individual machine selected
        rescheduleOptions.machineId = selectedMachine ? parseInt(selectedMachine) : selectedSlot.machine_id;
        console.log('🔧 Rescheduling to specific machine:', rescheduleOptions.machineId);
      }
      
      await onReschedule(selectedSlot, rescheduleOptions);
      setSelectedDate(null);
      setSelectedMachine(selectedSlot.machine_id.toString());
    } catch (error) {
      console.error('Error in manual reschedule:', error);
      toast.error(`Reschedule failed: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const isUsingDifferentMachine = selectedMachine && parseInt(selectedMachine) !== selectedSlot.machine_id;
  const selectedMachineObj = availableMachines.find(m => m.id === parseInt(selectedMachine));

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Typography variant="body2" sx={{ color: '#e4e6eb' }}>
        Current: {format(currentDate, 'MMM d, yyyy h:mm a')} on {currentMachine?.name || 'Unknown machine'}
      </Typography>
      
      <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <DatePicker
          label="New Start Date"
          value={selectedDate}
          onChange={handleDateChange}
          disablePast
          sx={{ minWidth: 200 }}
        />
        
        <FormControl sx={{ minWidth: 200 }} size="small">
          <InputLabel>Machine/Group</InputLabel>
          <Select
            value={selectedMachine}
            label="Machine/Group"
            onChange={handleMachineChange}
          >
            {/* Machine Groups Section - Always render available groups */}
            <MenuItem disabled sx={{ fontWeight: 'bold', bgcolor: 'action.hover' }}>
              Machine Groups (Auto-Select) - {availableGroups.length} available
            </MenuItem>
            {availableGroups.map((group) => (
              <MenuItem 
                key={`group-${group.id}`} 
                value={`group-${group.id}`} 
                sx={{ flexDirection: 'column', alignItems: 'flex-start' }}
              >
                <Typography variant="body2" color="primary">
                  🏭 {group.name}
                </Typography>
                <Typography variant="caption" sx={{ color: '#9ca3af' }}>
                  {group.description} ({group.machine_count} machines)
                </Typography>
              </MenuItem>
            ))}
            {availableGroups.length > 0 && <Divider />}
            
            {/* Show message when no groups are available */}
            {availableGroups.length === 0 && (
              <MenuItem disabled sx={{ fontWeight: 'bold', bgcolor: 'warning.light', color: 'warning.dark' }}>
                ⚠️ No compatible machine groups found for {selectedSlot.operation_name}
              </MenuItem>
            )}
            
            {/* Individual Machines Section */}
            <MenuItem disabled sx={{ fontWeight: 'bold', bgcolor: 'action.hover' }}>
              Specific Machines
            </MenuItem>
            {availableMachines.map((machine) => (
              <MenuItem key={machine.id} value={machine.id.toString()} sx={{ flexDirection: 'column', alignItems: 'flex-start' }}>
                <Typography variant="body2">
                  🔧 {machine.name}
                </Typography>
                <Typography variant="caption" sx={{ color: '#9ca3af' }}>
                  {machine.model}
                </Typography>
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        
        <Button
          variant="contained"
          color="secondary"
          onClick={handleRescheduleClick}
          disabled={!selectedDate || loading}
          size="small"
          sx={{ 
            alignSelf: 'center',
            color: '#e4e6eb',
            '&:disabled': {
              color: '#6b7280'
            }
          }}
        >
          {loading ? 'Rescheduling...' : isUsingDifferentMachine ? 'Move & Reschedule' : 'Reschedule Operation'}
        </Button>
      </Box>
      
      {selectedDate && (
        <Box>
          <Typography variant="caption" sx={{ color: '#3b82f6' }}>
            ⚡ This will move the operation to {format(selectedDate, 'MMM d, yyyy')} 
            {isUsingDifferentMachine && selectedMachineObj && ` on ${selectedMachineObj.name}`} 
            and automatically reschedule all subsequent operations.
          </Typography>
          {isUsingDifferentMachine && (
            <Typography variant="caption" sx={{ color: '#f59e0b', display: 'block', mt: 0.5 }}>
              🔄 Machine change: The system will automatically assign a qualified operator for the new machine.
            </Typography>
          )}
        </Box>
      )}
    </Box>
  );
};

// Reschedule Summary Modal Component
const RescheduleSummaryModal = ({ open, onClose, summary }) => {
  if (!summary) return null;

  return (
    <Dialog 
      open={open} 
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: { 
          borderRadius: 2,
          minHeight: '300px'
        }
      }}
    >
      <DialogTitle sx={{ 
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        color: 'white',
        display: 'flex',
        alignItems: 'center',
        gap: 1
      }}>
        <ScheduleIcon />
        Manual Reschedule Summary
      </DialogTitle>
      
      <DialogContent sx={{ pt: 3 }}>
        <Typography variant="h6" gutterBottom color="success.main">
          ✅ Primary Operation Moved
        </Typography>
        
        <Card sx={{ mb: 3, p: 2, backgroundColor: 'success.50' }}>
          <Typography variant="subtitle1" fontWeight="bold">
            {summary.primaryOperation.operation}
          </Typography>
          <Typography variant="body2" sx={{ color: '#e4e6eb' }}>
            <strong>From:</strong> {format(new Date(summary.primaryOperation.from), 'MMM d, yyyy h:mm a')}
          </Typography>
          <Typography variant="body2" sx={{ color: '#e4e6eb' }}>
            <strong>To:</strong> {format(new Date(summary.primaryOperation.to), 'MMM d, yyyy h:mm a')}
          </Typography>
          <Typography variant="body2" sx={{ color: '#e4e6eb' }}>
            <strong>Duration:</strong> {summary.primaryOperation.duration} minutes
            {summary.primaryOperation.chunks > 1 && ` (${summary.primaryOperation.chunks} chunks)`}
          </Typography>
          {summary.primaryOperation.machineChange && (
            <Typography variant="body2" color="warning.main" sx={{ mt: 1 }}>
              <strong>Machine changed:</strong> {summary.primaryOperation.machineChange.from} → {summary.primaryOperation.machineChange.to}
            </Typography>
          )}
        </Card>

        {summary.subsequentOperations && summary.subsequentOperations.length > 0 && (
          <>
            <Typography variant="h6" gutterBottom color="info.main">
              🔄 Subsequent Operations Rescheduled
            </Typography>
            
            {summary.subsequentOperations.map((op, index) => (
              <Card key={index} sx={{ mb: 2, p: 2, backgroundColor: 'info.50' }}>
                <Typography variant="subtitle2" fontWeight="bold">
                  {op.operation_name} (Sequence {op.sequence_order})
                </Typography>
                <Typography variant="body2" sx={{ color: '#9ca3af' }}>
                  Automatically rescheduled by system after {summary.primaryOperation.operation}
                </Typography>
              </Card>
            ))}
          </>
        )}

        <Box sx={{ mt: 3, p: 2, backgroundColor: 'grey.100', borderRadius: 1 }}>
          <Typography variant="body2" sx={{ color: '#e4e6eb' }}>
            <strong>Total operations affected:</strong> {1 + (summary.subsequentOperations?.length || 0)}
          </Typography>
          <Typography variant="body2" sx={{ color: '#e4e6eb' }}>
            <strong>Reschedule method:</strong> Manual with automatic trickle-down
          </Typography>
        </Box>
      </DialogContent>

      <DialogActions sx={{ p: 2 }}>
        <Button onClick={onClose} variant="contained" color="primary">
          Got it
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// Schedule Slot Component (simplified, no drag functionality)
const ScheduleSlot = ({ slot, position, color, children, onClick }) => {
  return (
    <Box
      onClick={onClick}
      sx={{
        position: 'absolute',
        left: '2px',
        right: '2px',
        top: position.top,
        height: position.height,
        backgroundColor: color,
        borderRadius: '4px',
        border: position.isShort ? '3px solid rgba(255,255,255,0.8)' : '1px solid rgba(255,255,255,0.3)',
        cursor: 'pointer',
        overflow: 'hidden', // Keep contained for proper hover detection
        boxShadow: position.isShort ? '0 4px 8px rgba(0,0,0,0.5)' : '0 2px 4px rgba(0,0,0,0.2)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '2px 3px',
        textAlign: 'center',
        minHeight: '20px',
        zIndex: 1, // Lower z-index to not interfere with tooltip
        // Ensure good text contrast
        '& .MuiTypography-root': {
          color: 'white !important',
          textShadow: '2px 2px 4px rgba(0,0,0,0.9)',
          fontWeight: 'bold !important',
          lineHeight: '1.1 !important'
        },
        '&:hover': {
          opacity: 0.9,
          transform: 'scale(1.02)',
          boxShadow: '0 6px 20px rgba(0,0,0,0.5)',
          border: '2px solid rgba(0, 212, 255, 0.8)'
        },
        transition: 'all 0.2s ease-in-out',
        cursor: 'pointer'
      }}
    >
      {children}
    </Box>
  );
};

// Schedule Day Zone Component (no drop functionality)
const ScheduleDayZone = ({ dayIndex, children }) => {
  return (
    <Box
      sx={{
        flex: 1,
        position: 'relative',
        borderRight: dayIndex < 6 ? '1px solid #e0e0e0' : 'none',
        backgroundColor: isSameDay(new Date(), new Date()) ? '#f8fcff' : 'transparent',
        minHeight: '80px',
      }}
    >
      {children}
    </Box>
  );
};







const ScheduleView = () => {
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState('week'); // day, week, month
  const [scheduleSlots, setScheduleSlots] = useState([]);
  const [machines, setMachines] = useState([]);
  const [machineGroups, setMachineGroups] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [rescheduleSummary, setRescheduleSummary] = useState(null);
  const [summaryModalOpen, setSummaryModalOpen] = useState(false);

  useEffect(() => {
    fetchScheduleData();
    fetchMachines();
    fetchMachineGroups();
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

  const fetchMachineGroups = async () => {
    try {
      const response = await apiService.get('/api/machines/groups/all');
      setMachineGroups(response.data);
    } catch (error) {
      console.error('Error fetching machine groups:', error);
    }
  };

  const handleUnscheduleAll = async () => {
    const confirmed = window.confirm(
      '⚠️ This will remove ALL scheduled operations from the calendar. This action cannot be undone. Are you sure?'
    );
    
    if (!confirmed) return;
    
    try {
      setLoading(true);
      toast.loading('Unscheduling all jobs...', { id: 'unschedule-all' });
      
      const response = await apiService.delete('/api/scheduling/unschedule-all');
      
      // Refresh the schedule data
      await fetchScheduleData();
      
      toast.success(
        `✅ ${response.data.message}\n📊 ${response.data.totalSlotsRemoved} schedule slots removed\n🔄 ${response.data.jobsReset} jobs reset`, 
        { id: 'unschedule-all', duration: 5000 }
      );
      
      console.log('Unschedule all response:', response.data);
      
    } catch (error) {
      console.error('Error unscheduling all jobs:', error);
      toast.error('Failed to unschedule all jobs', { id: 'unschedule-all' });
    } finally {
      setLoading(false);
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
    
    // Set much larger minimum height for visibility (equivalent to ~2 hours)
    const minHeight = (2 / 16) * 100; // 2 hours minimum for visibility
    const height = Math.max(minHeight, actualHeight);
    
    // Duration in minutes for conditional styling
    const durationMinutes = slot.duration_minutes || ((endHour - startHour) * 60);
    
    return {
      top: `${Math.max(0, startPosition)}%`,
      height: `${height}%`,
      actualHeight: actualHeight,
      isShort: durationMinutes <= 180, // 3 hours or less
      isVeryShort: durationMinutes <= 120, // 2 hours or less
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

  const handleUnscheduleJob = async (jobId, jobNumber) => {
    if (!window.confirm(`Are you sure you want to unschedule job ${jobNumber}?\n\nThis will remove all schedule slots and set the job back to pending status.`)) {
      return;
    }
    
    try {
      const response = await apiService.delete(`/api/scheduling/unschedule-job/${jobId}`);
      toast.success(`Job ${jobNumber} has been unscheduled successfully`);
      setEditModalOpen(false);
      fetchScheduleData();
    } catch (error) {
      console.error('Error unscheduling job:', error);
      toast.error(`Failed to unschedule job ${jobNumber}`);
    }
  };

  const handleRescheduleJob = async (jobId, jobNumber) => {
    if (!window.confirm(`Reschedule job ${jobNumber}?\n\nThis will automatically place all operations on their correct machines with optimal timing.`)) {
      return;
    }
    
    try {
      const response = await apiService.post(`/api/scheduling/reschedule-job/${jobId}`);
      toast.success(`Job ${jobNumber} has been rescheduled successfully`);
      setEditModalOpen(false);
      fetchScheduleData();
    } catch (error) {
      console.error('Error rescheduling job:', error);
      toast.error(`Failed to reschedule job ${jobNumber}`);
    }
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

  // Manual reschedule operation to specific date with trickle-down effect
  const handleManualReschedule = async (selectedSlot, rescheduleOptionsOrDate) => {
    try {
      // Handle both old (date only) and new (options object) parameter formats
      let newStartDate, targetMachineId, targetMachineGroupId;
      
      if (rescheduleOptionsOrDate && typeof rescheduleOptionsOrDate === 'object' && rescheduleOptionsOrDate.date) {
        // New format: options object with date and machineId/machineGroupId
        newStartDate = rescheduleOptionsOrDate.date;
        targetMachineId = rescheduleOptionsOrDate.machineId;
        targetMachineGroupId = rescheduleOptionsOrDate.machineGroupId;
      } else {
        // Old format: date only (backward compatibility)
        newStartDate = rescheduleOptionsOrDate;
        targetMachineId = selectedSlot.machine_id; // Keep current machine
      }
      
      // Validate the new start date
      if (!newStartDate || !(newStartDate instanceof Date) || isNaN(newStartDate.getTime())) {
        throw new Error('Invalid date provided for rescheduling');
      }
      
      // Fix timezone issue by creating a proper local date 
      const localDate = new Date(newStartDate.getFullYear(), newStartDate.getMonth(), newStartDate.getDate());
      const dayOfWeek = localDate.getDay();
      const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dayOfWeek];
      
      const machineChange = targetMachineId !== selectedSlot.machine_id;
      const targetMachine = machines.find(m => m.id === targetMachineId);
      const isGroupReschedule = !!targetMachineGroupId;
      
      let rescheduleDescription;
      if (isGroupReschedule) {
        const targetGroup = machineGroups.find(g => g.id === targetMachineGroupId);
        rescheduleDescription = `🗓️ Manual reschedule: Moving entire ${selectedSlot.operation_name} operation from ${selectedSlot.start_datetime} to ${localDate.toDateString()} (${dayName}) using machine group ${targetGroup?.name || targetMachineGroupId}`;
      } else {
        rescheduleDescription = `🗓️ Manual reschedule: Moving entire ${selectedSlot.operation_name} operation from ${selectedSlot.start_datetime} to ${localDate.toDateString()} (${dayName})${machineChange ? ` on ${targetMachine?.name}` : ''}`;
      }
      console.log(rescheduleDescription);
      
      // Step 1: Get all schedule slots for this job to find ALL chunks of this operation
      const slotsResponse = await apiService.get(`/api/scheduling/slots`, { params: { job_id: selectedSlot.job_id } });
      const allJobSlots = slotsResponse.data;
      
      // Find ALL chunks/slots that belong to the same operation (job_routing_id)
      const operationSlots = allJobSlots.filter(slot => slot.job_routing_id === selectedSlot.job_routing_id);
      console.log(`Found ${operationSlots.length} chunks for operation ${selectedSlot.operation_name}`);
      
      // Step 2: Get job routings to understand the operation sequence
      const routingsResponse = await apiService.get(`/api/jobs/${selectedSlot.job_id}/routings`);
      const jobRoutings = routingsResponse.data;
      
      const currentOperation = jobRoutings.find(r => r.id === selectedSlot.job_routing_id);
      if (!currentOperation) {
        throw new Error('Could not find operation in job routings');
      }
      
      // Step 3: Decide whether to do full reschedule or partial reschedule based on operation sequence
      const isFirstOperation = currentOperation.sequence_order === 1;
      
      if (isFirstOperation) {
        // If rescheduling the first operation (SAW), do full job reschedule
        console.log(`🗑️ Rescheduling FIRST operation - clearing entire job schedule to rebuild all operations...`);
        for (const slot of allJobSlots) {
          await apiService.delete(`/api/scheduling/slots/${slot.id}`);
        }
      } else {
        // If rescheduling a later operation (HMC, INSPECT), only clear current and subsequent operations
        console.log(`🗑️ Rescheduling LATER operation - only clearing current and subsequent operations...`);
        
        // Find operations at this sequence order and later
        const operationsToReschedule = jobRoutings.filter(routing => 
          routing.sequence_order >= currentOperation.sequence_order
        );
        
        console.log(`Operations to reschedule (sequence ${currentOperation.sequence_order}+):`, operationsToReschedule.map(op => op.operation_name));
        
        // Delete slots for current and subsequent operations only
        for (const op of operationsToReschedule) {
          const opSlots = allJobSlots.filter(slot => slot.job_routing_id === op.id);
          console.log(`🗑️ Deleting ${opSlots.length} slots for operation ${op.operation_name}`);
          for (const slot of opSlots) {
            await apiService.delete(`/api/scheduling/slots/${slot.id}`);
          }
        }
      }
      
      // Step 4: Different approach based on operation sequence
      console.log(`📅 ${isFirstOperation ? 'Full job reschedule' : 'Partial reschedule'} starting ${format(localDate, 'MMM d, yyyy')}`);
      
      // Validate that the employee works on the target date
      const employeeId = selectedSlot.employee_id;
      
      // Step 5: Employee validation
      if (employeeId) {
        try {
          // Get employee's weekly schedule pattern to validate they work on target date
          const workHoursResponse = await apiService.get(`/api/employees/${employeeId}/work-schedules`);
          
          if (workHoursResponse.data && workHoursResponse.data.length > 0) {
            const targetDayOfWeek = dayOfWeek;
            const workingDays = workHoursResponse.data.filter(day => day.enabled);
            const targetDaySchedule = workingDays.find(day => day.day_of_week === targetDayOfWeek);
            
            console.log(`🗓️ Target date is day ${targetDayOfWeek} (${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][targetDayOfWeek]})`);
            console.log(`👤 Employee ${employeeId} working days:`, workingDays.map(d => d.day_of_week));
            
            if (!targetDaySchedule) {
              const workingDayNames = workingDays.map(d => ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d.day_of_week]);
              throw new Error(`Employee does not work on ${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][targetDayOfWeek]}s. They work on: ${workingDayNames.join(', ')}`);
            }
            
            console.log(`📋 Employee ${employeeId} works ${targetDaySchedule.start_time}-${targetDaySchedule.end_time} on ${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][targetDayOfWeek]}s`);
          }
        } catch (error) {
          console.error('Error validating employee work schedule:', error);
          throw error;
        }
      }
      
      // Step 6: Handle machine change if needed
      if (machineChange || isGroupReschedule) {
        if (isGroupReschedule) {
          const targetGroup = machineGroups.find(g => g.id === targetMachineGroupId);
          console.log(`🏭 Machine group change detected: switching to group ${targetGroup?.name}`);
          
          try {
            // Update the job routing to use the machine group (let scheduler pick specific machine)
            await apiService.put(`/api/jobs/${selectedSlot.job_id}/routings/${currentOperation.id}`, {
              machine_id: null, // Clear specific machine assignment
              machine_group_id: targetMachineGroupId // Set group assignment
            });
            console.log(`✅ Updated routing ${currentOperation.operation_name} to use machine group ${targetGroup?.name}`);
          } catch (error) {
            console.error('Error updating job routing machine group:', error);
            throw new Error(`Failed to change machine group assignment: ${error.message}`);
          }
        } else if (machineChange) {
          console.log(`🔧 Machine change detected: ${selectedSlot.machine_name} → ${targetMachine?.name}`);
          
          try {
            // Update the job routing to use the new machine
            await apiService.put(`/api/jobs/${selectedSlot.job_id}/routings/${currentOperation.id}`, {
              machine_id: targetMachineId,
              machine_group_id: null // Clear group assignment when specific machine is selected
            });
            console.log(`✅ Updated routing ${currentOperation.operation_name} to use machine ${targetMachine?.name}`);
          } catch (error) {
            console.error('Error updating job routing machine:', error);
            throw new Error(`Failed to change machine assignment: ${error.message}`);
          }
        }
      }
      
      // Step 7: Do full job reschedule to rebuild all operations properly
      console.log(`🔄 Doing full job reschedule to rebuild all operations starting from ${format(localDate, 'MMM d, yyyy')}...`);
      
      try {
        // Update the job's start date (keeping promised date intact)
        await apiService.put(`/api/jobs/${selectedSlot.job_id}`, {
          start_date: localDate.toISOString()
        });
        
        // Choose reschedule approach based on operation sequence
        let rescheduleResponse;
        
        if (isFirstOperation) {
          // Full job reschedule for first operation (moves entire job)
          console.log(`🔄 Full job reschedule from start date: ${format(localDate, 'MMM d, yyyy')}`);
          rescheduleResponse = await apiService.post(`/api/scheduling/reschedule-job/${selectedSlot.job_id}`, {
            force_start_date: localDate.toISOString()
          });
        } else {
          // Partial reschedule for later operations (only subsequent operations)
          console.log(`🔄 Partial reschedule from current operation: ${format(localDate, 'MMM d, yyyy')}`);
          rescheduleResponse = await apiService.post(`/api/scheduling/reschedule-job/${selectedSlot.job_id}`, { 
            force_start_date: localDate.toISOString(), // Use the target date
            partial: true, // Indicate this is a partial reschedule
            startFromOperation: selectedSlot.sequence_order // Start from this operation
          });
        }
        console.log(`✅ Reschedule successful:`, rescheduleResponse.data);
        
        if (rescheduleResponse.data && rescheduleResponse.data.scheduled_operations) {
          console.log(`📊 Operations rescheduled by system:`);
          rescheduleResponse.data.scheduled_operations.forEach(op => {
            console.log(`   ${op.operation_name}: ${op.scheduled ? '✅ scheduled' : '❌ failed'}`);
            if (op.schedule_slots && op.schedule_slots.length > 0) {
              op.schedule_slots.forEach(slot => {
                console.log(`     ${slot.start_datetime} to ${slot.end_datetime}`);
              });
            }
          });
        }
        
        // Create summary data for the modal
        const subsequentOperations = jobRoutings.filter(routing => 
          routing.sequence_order > currentOperation.sequence_order
        );
        
        const summaryData = {
          primaryOperation: {
            operation: selectedSlot.operation_name,
            from: selectedSlot.start_datetime,
            to: localDate.toISOString(),
            duration: rescheduleResponse.data.scheduled_operations?.find(op => op.operation_name === selectedSlot.operation_name)?.schedule_slots?.reduce((sum, slot) => sum + (slot.duration_minutes || 0), 0) || 'System determined',
            chunks: rescheduleResponse.data.scheduled_operations?.find(op => op.operation_name === selectedSlot.operation_name)?.schedule_slots?.length || 1,
            machineChange: machineChange ? {
              from: selectedSlot.machine_name,
              to: targetMachine?.name
            } : null
          },
          subsequentOperations: subsequentOperations
        };
        
        // Show success toast and summary modal
        const machineChangeText = machineChange ? ` on ${targetMachine?.name}` : '';
        const successMessage = isFirstOperation ? 
          `✅ Entire job rescheduled starting ${format(localDate, 'MMM d')}${machineChangeText} • All operations rebuilt` :
          `✅ ${selectedSlot.operation_name} moved to ${format(localDate, 'MMM d')}${machineChangeText} • Subsequent operations rescheduled`;
        toast.success(successMessage);
        setRescheduleSummary(summaryData);
        setSummaryModalOpen(true);
        
      } catch (rescheduleError) {
        console.error('❌ Reschedule failed:', rescheduleError);
        throw new Error(`Failed to reschedule: ${rescheduleError.response?.data?.error || rescheduleError.message || 'Unknown error'}`);
      }
      setEditModalOpen(false);
      fetchScheduleData();
      
    } catch (error) {
      console.error('Error in manual reschedule:', error);
      toast.error(`Failed to reschedule operation: ${error.message}`);
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
          Visual scheduling with manual rescheduling controls
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
            <Tooltip title="Remove all scheduled operations (for testing)">
              <Button
                variant="outlined"
                color="error"
                size="small"
                startIcon={<ClearAllIcon />}
                onClick={handleUnscheduleAll}
                disabled={loading}
                sx={{ mr: 1 }}
              >
                Unschedule All
              </Button>
            </Tooltip>
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
                <MenuItem value="month">
                  <Box display="flex" alignItems="center" gap={1}>
                    <ScheduleIcon fontSize="small" />
                    Month
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
            <Box sx={{ minWidth: viewMode === 'day' ? '800px' : viewMode === 'month' ? '2000px' : '1400px' }}>
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
                <Box key={machine.id} display="flex" sx={{ borderBottom: '1px solid #e0e0e0', minHeight: viewMode === 'month' ? '120px' : '150px' }}>
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
                      <ScheduleDayZone 
                        key={dayIndex}
                        dayIndex={dayIndex}
                      >
                        {daySlots.map((slot) => {
                          const position = getSlotPosition(slot);
                          const color = getSlotColor(slot);
                          
                          return (
                              <ScheduleSlot
                                key={slot.id}
                                slot={slot}
                                position={position}
                                color={color}
                                onClick={() => handleSlotClick(slot)}
                              >
                                <Tooltip
                                  title={`Job: ${slot.job_number} | Customer: ${slot.customer_name} | Part: ${slot.part_name} | Machine: ${slot.machine_name} | Operator: ${slot.employee_name} | Duration: ${(position.durationMinutes / 60).toFixed(1)}h`}
                                  arrow
                                  placement="top"
                                  enterDelay={0}
                                  leaveDelay={200}
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
                                  {/* Show duration indicator for artificially enlarged blocks */}
                                  {position.actualHeight < (2 / 16) * 100 && (
                                    <Box 
                                      sx={{ 
                                        position: 'absolute', 
                                        top: 2, 
                                        right: 2, 
                                        backgroundColor: 'rgba(255,255,255,0.3)', 
                                        borderRadius: '2px', 
                                        px: 0.5, 
                                        fontSize: '8px' 
                                      }}
                                    >
                                      {Math.round(position.durationMinutes)}min
                                    </Box>
                                  )}
                                  
                                  {position.isVeryShort ? (
                                    // Very short operations: show minimal info, centered
                                    <Box sx={{ textAlign: 'center', width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
                                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, justifyContent: 'center' }}>
                                        {slot.locked && (
                                          <LockIcon sx={{ fontSize: position.height < 25 ? '10px' : '12px', color: 'rgba(255,255,255,0.9)' }} />
                                        )}
                                        <Typography 
                                          variant="caption" 
                                          sx={{ 
                                            fontSize: position.height < 25 ? '10px' : position.height < 35 ? '11px' : '12px',
                                            fontWeight: 'bold',
                                            color: 'white',
                                            textShadow: '2px 2px 4px rgba(0,0,0,0.9)',
                                            wordWrap: 'break-word',
                                            hyphens: 'auto',
                                            lineHeight: 1.1,
                                            maxWidth: '100%'
                                          }}
                                        >
                                          {slot.job_number}
                                        </Typography>
                                      </Box>
                                      {position.height > 20 && (
                                        <Typography 
                                          variant="caption" 
                                          sx={{ 
                                            fontSize: position.height < 25 ? '8px' : position.height < 35 ? '9px' : '10px',
                                            color: 'rgba(255,255,255,0.95)',
                                            textShadow: '1px 1px 2px rgba(0,0,0,0.8)',
                                            wordWrap: 'break-word',
                                            lineHeight: 1.1,
                                            maxWidth: '100%'
                                          }}
                                        >
                                          {Math.round(position.durationMinutes)}min
                                        </Typography>
                                      )}
                                    </Box>
                                  ) : position.isShort ? (
                                    // Short operations: show compact info
                                    <Box sx={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 0.5 }}>
                                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, justifyContent: 'center' }}>
                                        {slot.locked && (
                                          <LockIcon sx={{ fontSize: position.height < 30 ? '11px' : '13px', color: 'rgba(255,255,255,0.9)' }} />
                                        )}
                                        <Typography 
                                          variant="caption" 
                                          sx={{ 
                                            fontSize: position.height < 30 ? '11px' : position.height < 45 ? '12px' : '13px',
                                            fontWeight: 'bold',
                                            color: 'white',
                                            textShadow: '2px 2px 4px rgba(0,0,0,0.9)',
                                            wordWrap: 'break-word',
                                            hyphens: 'auto',
                                            lineHeight: 1.1,
                                            maxWidth: '100%'
                                          }}
                                        >
                                          {slot.job_number}
                                        </Typography>
                                      </Box>
                                      {position.height > 30 && (
                                        <Typography 
                                          variant="caption" 
                                          sx={{ 
                                            fontSize: position.height < 40 ? '9px' : position.height < 50 ? '10px' : '11px',
                                            color: 'rgba(255,255,255,0.95)',
                                            textShadow: '1px 1px 2px rgba(0,0,0,0.8)',
                                            wordWrap: 'break-word',
                                            lineHeight: 1.1,
                                            maxWidth: '100%'
                                          }}
                                        >
                                          {slot.operation_name || slot.machine_name}
                                        </Typography>
                                      )}
                                    </Box>
                                  ) : (
                                    // Normal operations: show full info with dynamic sizing
                                    <Box sx={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 0.5 }}>
                                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, justifyContent: 'center' }}>
                                        {slot.locked && (
                                          <LockIcon sx={{ fontSize: position.height < 40 ? '12px' : '14px', color: 'rgba(255,255,255,0.9)' }} />
                                        )}
                                        <Typography 
                                          variant="caption" 
                                          sx={{ 
                                            fontSize: position.height < 40 ? '12px' : position.height < 60 ? '13px' : '14px',
                                            fontWeight: 'bold',
                                            color: 'white',
                                            textShadow: '2px 2px 4px rgba(0,0,0,0.9)',
                                            wordWrap: 'break-word',
                                            hyphens: 'auto',
                                            lineHeight: 1.1,
                                            maxWidth: '100%'
                                          }}
                                        >
                                          {slot.job_number}
                                        </Typography>
                                      </Box>
                                      {position.height > 35 && (
                                        <Typography 
                                          variant="caption" 
                                          sx={{ 
                                            fontSize: position.height < 50 ? '10px' : position.height < 70 ? '11px' : '12px',
                                            color: 'rgba(255,255,255,0.95)',
                                            textShadow: '1px 1px 2px rgba(0,0,0,0.8)',
                                            wordWrap: 'break-word',
                                            lineHeight: 1.1,
                                            maxWidth: '100%'
                                          }}
                                        >
                                          {slot.operation_name || slot.machine_name}
                                        </Typography>
                                      )}
                                      {position.height > 55 && (
                                        <Typography 
                                          variant="caption" 
                                          sx={{ 
                                            fontSize: position.height < 70 ? '9px' : '10px',
                                            color: 'rgba(255,255,255,0.9)',
                                            textShadow: '1px 1px 2px rgba(0,0,0,0.8)',
                                            wordWrap: 'break-word',
                                            lineHeight: 1.1,
                                            maxWidth: '100%'
                                          }}
                                        >
                                          {format(parseISO(slot.start_datetime), 'h:mm a')}
                                        </Typography>
                                      )}
                                    </Box>
                                  )}
                                  </Box>
                                </Tooltip>
                              </ScheduleSlot>
                          );
                        })}
                      </ScheduleDayZone>
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
      <Dialog 
        open={editModalOpen} 
        onClose={() => setEditModalOpen(false)} 
        maxWidth="sm" 
        fullWidth
        PaperProps={{
          sx: {
            backgroundColor: '#1a2030',
            color: '#e4e6eb'
          }
        }}
      >
        <DialogTitle sx={{ backgroundColor: '#1a2030', color: '#e4e6eb', borderBottom: '1px solid #374151' }}>
          Job Schedule Management
        </DialogTitle>
        <DialogContent sx={{ backgroundColor: '#1a2030', color: '#e4e6eb' }}>
          {selectedSlot && (
            <Box sx={{ pt: 1 }}>
              <Typography variant="h6" gutterBottom sx={{ color: '#00d4ff' }}>
                Job: {selectedSlot.job_number} - {selectedSlot.operation_name}
              </Typography>
              <Typography variant="body2" gutterBottom sx={{ color: '#e4e6eb' }}>
                Customer: {selectedSlot.customer_name}
              </Typography>
              <Typography variant="body2" gutterBottom sx={{ color: '#e4e6eb' }}>
                Part: {selectedSlot.part_name}
              </Typography>
              <Typography variant="body2" gutterBottom sx={{ color: '#e4e6eb' }}>
                Machine: {selectedSlot.machine_name}
              </Typography>
              <Typography variant="body2" gutterBottom sx={{ color: '#e4e6eb' }}>
                Operator: {selectedSlot.employee_name || 'None (INSPECT operation)'}
              </Typography>
              <Typography variant="body2" gutterBottom sx={{ color: '#e4e6eb' }}>
                Time: {format(parseISO(selectedSlot.start_datetime), 'MMM d, yyyy h:mm a')} - {format(parseISO(selectedSlot.end_datetime), 'h:mm a')}
              </Typography>
              <Typography variant="body2" gutterBottom sx={{ color: '#e4e6eb' }}>
                Duration: {(selectedSlot.duration_minutes / 60).toFixed(1)}h
              </Typography>
              {selectedSlot.notes && (
                <Typography variant="body2" gutterBottom sx={{ color: '#e4e6eb' }}>
                  Notes: {selectedSlot.notes}
                </Typography>
              )}
              
              <Box sx={{ mt: 3, p: 2, backgroundColor: 'rgba(255, 255, 255, 0.05)', borderRadius: 1, border: '1px solid #374151' }}>
                <Typography variant="subtitle2" gutterBottom sx={{ color: '#e4e6eb' }}>
                  Schedule Management Actions:
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
                  <Button 
                    variant="outlined" 
                    color="warning"
                    onClick={() => handleUnscheduleJob(selectedSlot.job_id, selectedSlot.job_number)}
                    size="small"
                  >
                    Unschedule Job
                  </Button>
                </Box>
                
                <Divider sx={{ my: 2 }} />
                
                <Typography variant="subtitle2" gutterBottom sx={{ color: '#e4e6eb' }}>
                  Manual Reschedule Operation:
                </Typography>
                <Typography variant="caption" sx={{ color: '#9ca3af', mb: 2, display: 'block' }}>
                  Move this operation to a specific date. All subsequent operations will be rescheduled automatically.
                </Typography>
                <ManualRescheduleControls 
                  selectedSlot={selectedSlot}
                  onReschedule={handleManualReschedule}
                  machines={machines}
                  machineGroups={machineGroups}
                />
                
                <Divider sx={{ my: 2 }} />
                
                <Typography variant="caption" sx={{ color: '#9ca3af', display: 'block' }}>
                  Full reschedule removes all schedule slots and places operations on correct machines automatically.
                </Typography>
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ backgroundColor: '#1a2030', borderTop: '1px solid #374151' }}>
          <Button onClick={() => setEditModalOpen(false)} sx={{ color: '#e4e6eb' }}>
            Close
          </Button>
        </DialogActions>
      </Dialog>

      {/* Reschedule Summary Modal */}
      <RescheduleSummaryModal 
        open={summaryModalOpen}
        onClose={() => setSummaryModalOpen(false)}
        summary={rescheduleSummary}
      />

    </Box>
  );
};

export default ScheduleView;
