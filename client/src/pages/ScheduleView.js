import React, { useState, useEffect, useCallback } from 'react';
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
  Snackbar,
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
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
  useDraggable,
  useDroppable,
} from '@dnd-kit/core';
import {
  restrictToWindowEdges,
  restrictToVerticalAxis,
} from '@dnd-kit/modifiers';

import { apiService } from '../services/apiService';

// Draggable Schedule Slot Component
const DraggableSlot = ({ slot, position, color, children, onClick }) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: slot.id,
  });

  const style = transform ? {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
    opacity: isDragging ? 0.5 : 1,
  } : undefined;

  return (
    <Box
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
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
        cursor: isDragging ? 'grabbing' : 'grab',
        overflow: 'hidden',
        boxShadow: position.isShort ? '0 4px 8px rgba(0,0,0,0.5)' : 'none',
        '&:hover': {
          opacity: 0.8,
          transform: 'scale(1.02)',
          boxShadow: '0 4px 8px rgba(0,0,0,0.4)'
        },
        transition: 'all 0.2s ease'
      }}
    >
      {children}
    </Box>
  );
};

// Droppable Zone Component
const DroppableZone = ({ machineId, dayIndex, isOver, children }) => {
  const { isOver: isOverDroppable, setNodeRef } = useDroppable({
    id: `${machineId}-${dayIndex}`,
  });

  return (
    <Box
      ref={setNodeRef}
      sx={{
        flex: 1,
        position: 'relative',
        borderRight: dayIndex < 6 ? '1px solid #e0e0e0' : 'none',
        backgroundColor: isOverDroppable 
          ? 'rgba(33, 150, 243, 0.1)' 
          : isSameDay(new Date(), new Date()) ? '#f8fcff' : 'transparent',
        minHeight: '80px',
        border: isOverDroppable ? '2px dashed #2196f3' : 'none',
      }}
    >
      {children}
    </Box>
  );
};

// Validate operation sequence to prevent out-of-order scheduling
const validateOperationSequence = async (draggedSlot, targetDay) => {
  try {
    // Get all operations for this job with their sequence orders
    const response = await apiService.get(`/api/jobs/${draggedSlot.job_id}/routings`);
    const jobRoutings = response.data;
    
    // Find the current operation being dragged
    const currentOperation = jobRoutings.find(r => r.id === draggedSlot.job_routing_id);
    if (!currentOperation) {
      return { isValid: false, message: 'Unable to find operation details for sequence validation' };
    }
    
    // Get all currently scheduled slots for this job
    const scheduledResponse = await apiService.get('/api/scheduling/slots', {
      params: { job_id: draggedSlot.job_id }
    });
    const jobSlots = scheduledResponse.data;
    
    // Check for sequence violations
    const targetDateTime = new Date(targetDay);
    
    // Find all operations with lower sequence order (should be scheduled before)
    const prerequisiteOps = jobRoutings.filter(r => r.sequence_order < currentOperation.sequence_order);
    const subsequentOps = jobRoutings.filter(r => r.sequence_order > currentOperation.sequence_order);
    
    // Check if any prerequisite operations are scheduled AFTER the target time
    for (const prereqOp of prerequisiteOps) {
      const prereqSlot = jobSlots.find(s => s.job_routing_id === prereqOp.id && s.id !== draggedSlot.id);
      if (prereqSlot) {
        const prereqStart = new Date(prereqSlot.start_datetime);
        if (prereqStart > targetDateTime) {
          return {
            isValid: false,
            message: `Cannot schedule ${currentOperation.operation_name} (sequence ${currentOperation.sequence_order}) before ${prereqOp.operation_name} (sequence ${prereqOp.sequence_order}). Prerequisites must be completed first.`
          };
        }
      }
    }
    
    // Check if any subsequent operations are scheduled BEFORE the target time
    for (const subOp of subsequentOps) {
      const subSlot = jobSlots.find(s => s.job_routing_id === subOp.id && s.id !== draggedSlot.id);
      if (subSlot) {
        const subStart = new Date(subSlot.start_datetime);
        if (subStart < targetDateTime) {
          return {
            isValid: false,
            message: `Cannot schedule ${currentOperation.operation_name} (sequence ${currentOperation.sequence_order}) after ${subOp.operation_name} (sequence ${subOp.sequence_order}). Operations must maintain proper sequence order.`
          };
        }
      }
    }
    
    return { isValid: true, message: 'Sequence validation passed' };
    
  } catch (error) {
    console.error('Error validating operation sequence:', error);
    return { isValid: false, message: 'Unable to validate operation sequence due to error' };
  }
};

const ScheduleView = () => {
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState('week'); // day, week, month
  const [scheduleSlots, setScheduleSlots] = useState([]);
  const [machines, setMachines] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [draggedSlot, setDraggedSlot] = useState(null);
  const [dragOverZone, setDragOverZone] = useState(null);
  const [dragMessage, setDragMessage] = useState('');

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor)
  );

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

  // Drag and drop handlers
  const handleDragStart = useCallback((event) => {
    const { active } = event;
    const draggedSlot = scheduleSlots.find(slot => slot.id === parseInt(active.id));
    setDraggedSlot(draggedSlot);
    setDragMessage(`Moving ${draggedSlot?.job_number} - ${draggedSlot?.operation_name}`);
  }, [scheduleSlots]);

  const handleDragOver = useCallback((event) => {
    const { over } = event;
    if (over) {
      const [machineId, dayIndex] = over.id.toString().split('-');
      setDragOverZone({ machineId: parseInt(machineId), dayIndex: parseInt(dayIndex) });
    } else {
      setDragOverZone(null);
    }
  }, []);

  const handleDragEnd = useCallback(async (event) => {
    const { active, over } = event;
    
    setDraggedSlot(null);
    setDragOverZone(null);
    setDragMessage('');

    if (!over || !draggedSlot) return;

    const [targetMachineId, targetDayIndex] = over.id.toString().split('-');
    const currentDaysInView = getDaysInView();
    const targetDay = currentDaysInView[parseInt(targetDayIndex)];
    
    // Don't allow dropping on the same position
    if (
      parseInt(targetMachineId) === draggedSlot.machine_id && 
      isSameDay(parseISO(draggedSlot.start_datetime), targetDay)
    ) {
      return;
    }

    try {
      // Intelligent validation for operation-machine compatibility
      const targetMachine = machines.find(m => m.id === parseInt(targetMachineId));
      const isInspectOperation = draggedSlot.operation_name?.toLowerCase().includes('inspect');
      const isTargetInspectMachine = targetMachine?.name?.toLowerCase().includes('inspect');
      
      // Detect incompatible combinations
      const isIncompatibleMove = 
        (!isInspectOperation && isTargetInspectMachine && draggedSlot.duration_minutes > 0) || // Production op to INSPECT
        (isInspectOperation && !isTargetInspectMachine); // INSPECT op to production machine
      
      if (isIncompatibleMove) {
        const operationType = isInspectOperation ? 'INSPECT' : 'production';
        const machineType = isTargetInspectMachine ? 'INSPECT' : 'production';
        
        if (window.confirm(
          `⚠️ Invalid Assignment Detected!\n\n` +
          `You're trying to move a ${operationType} operation to a ${machineType} machine.\n` +
          `This will cause scheduling conflicts.\n\n` +
          `Would you like to unschedule and reschedule this entire job instead?\n` +
          `This will automatically place all operations on correct machines.`
        )) {
          // User chose to reschedule - call reschedule API
          try {
            const rescheduleResponse = await apiService.post(`/api/scheduling/reschedule-job/${draggedSlot.job_id}`);
            toast.success(`Job ${draggedSlot.job_number} has been rescheduled with correct machine assignments`);
            fetchScheduleData();
            return;
          } catch (error) {
            console.error('Error rescheduling job:', error);
            toast.error('Failed to reschedule job automatically');
          }
        } else {
          // User cancelled - don't proceed with invalid move
          toast.info('Move cancelled to prevent invalid assignment');
          return;
        }
      }

      // Sequence validation - prevent dragging operations out of order
      const sequenceValidationResult = await validateOperationSequence(draggedSlot, targetDay);
      if (!sequenceValidationResult.isValid) {
        if (window.confirm(
          `⚠️ Operation Sequence Violation!\n\n` +
          `${sequenceValidationResult.message}\n\n` +
          `Moving this operation could cause scheduling conflicts.\n\n` +
          `Would you like to unschedule and reschedule this entire job instead?\n` +
          `This will ensure all operations are scheduled in proper sequence.`
        )) {
          // User chose to reschedule - call reschedule API
          try {
            const rescheduleResponse = await apiService.post(`/api/scheduling/reschedule-job/${draggedSlot.job_id}`);
            toast.success(`Job ${draggedSlot.job_number} has been rescheduled in proper sequence`);
            fetchScheduleData();
            return;
          } catch (error) {
            console.error('Error rescheduling job:', error);
            toast.error('Failed to reschedule job automatically');
          }
        } else {
          // User cancelled - don't proceed with invalid sequence move
          toast.info('Move cancelled to maintain proper operation sequence');
          return;
        }
      }
      
      // Handle remaining validation for valid moves
      if (!draggedSlot.employee_id && !isInspectOperation && !isTargetInspectMachine) {
        console.error('Dragged slot has no employee assigned:', draggedSlot);
        toast.error(`Cannot move job ${draggedSlot.job_number} - no employee assigned. Please assign an employee first.`);
        return;
      }

      let newStartTime, newEndTime;
      
      // For INSPECT operations or when no employee is assigned, use simple placement
      if (isInspectOperation || !draggedSlot.employee_id) {
        console.log('INSPECT operation or no employee - using simple time placement');
        newStartTime = new Date(targetDay);
        newStartTime.setHours(6, 0, 0, 0);
        newEndTime = new Date(newStartTime.getTime() + (draggedSlot.duration_minutes * 60 * 1000));
      } else {
        // For operations requiring employees, find optimal slot
        console.log('Requesting optimal slot for:', {
          machine_id: parseInt(targetMachineId),
          employee_id: draggedSlot.employee_id,
          duration_minutes: draggedSlot.duration_minutes,
          start_date: targetDay.toISOString(),
          exclude_job_id: draggedSlot.job_id
        });
        
        // Find the best available time slot for this employee and machine on the target day
        const response = await apiService.get('/api/scheduling/available-slots', {
          params: {
            machine_id: parseInt(targetMachineId),
            employee_id: draggedSlot.employee_id,
            duration_minutes: draggedSlot.duration_minutes,
            start_date: targetDay.toISOString(),
            exclude_job_id: draggedSlot.job_id
          }
        });
        
        console.log('Available slots response:', response.data);

        if (response.data && response.data.length > 0) {
          // Use the earliest available slot
          const earliestSlot = response.data[0];
          newStartTime = new Date(earliestSlot.start_datetime);
          newEndTime = new Date(earliestSlot.end_datetime);
        } else {
          console.warn('No available slots found, using 6 AM fallback');
          // Fallback to 6 AM if no specific slots found
          newStartTime = new Date(targetDay);
          newStartTime.setHours(6, 0, 0, 0);
          newEndTime = new Date(newStartTime.getTime() + (draggedSlot.duration_minutes * 60 * 1000));
        }
      }

      // Determine employee assignment
      let employeeId = draggedSlot.employee_id;
      let employeeMessage = '';
      
      // If moving to a different machine, find a qualified operator
      if (parseInt(targetMachineId) !== draggedSlot.machine_id) {
        console.log(`Moving to different machine (${draggedSlot.machine_id} → ${targetMachineId}), checking operator requirements...`);
        
        // INSPECT operations don't need employee assignments
        if (isInspectOperation || targetMachine?.name?.toLowerCase().includes('inspect')) {
          employeeId = null;
          employeeMessage = ' (Moved to INSPECT - no operator required)';
          console.log('Moved to INSPECT operation - clearing employee assignment');
        } else {
          // For non-INSPECT operations, find qualified operator
          try {
            const operatorResponse = await apiService.get(`/api/machines/${targetMachineId}/operators`);
            if (operatorResponse.data && operatorResponse.data.length > 0) {
              // Use the most proficient available operator
              const bestOperator = operatorResponse.data[0];
              employeeId = bestOperator.employee_id;
              employeeMessage = ` (Reassigned to ${bestOperator.employee_name})`;
              console.log(`Reassigned to operator: ${bestOperator.employee_name}`);
            } else {
              console.warn(`No qualified operators found for machine ${targetMachineId}`);
              // Keep original employee if no qualified operators found
              employeeMessage = ' (Warning: Original operator may not be qualified for this machine)';
            }
          } catch (error) {
            console.error('Error finding qualified operator:', error);
            employeeMessage = ' (Warning: Could not verify operator qualification)';
          }
        }
      }

      const updatedSlot = {
        machine_id: parseInt(targetMachineId),
        employee_id: employeeId,
        start_datetime: newStartTime.toISOString(),
        end_datetime: newEndTime.toISOString(),
        notes: `${draggedSlot.notes || ''} (Moved manually)`.trim()
      };

      await apiService.put(`/api/scheduling/slots/${draggedSlot.id}`, updatedSlot);
      toast.success(`Moved ${draggedSlot.job_number} to ${machines.find(m => m.id === parseInt(targetMachineId))?.name} at ${format(newStartTime, 'h:mm a')}${employeeMessage}`);
      fetchScheduleData();
    } catch (error) {
      console.error('Error moving schedule slot:', error);
      toast.error('Failed to move schedule slot');
    }
  }, [draggedSlot, machines, currentDate, viewMode]); // eslint-disable-line react-hooks/exhaustive-deps

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
  const daysInView = getDaysInView(); // eslint-disable-line no-use-before-define

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" height="400px">
        <Typography>Loading schedule...</Typography>
      </Box>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      modifiers={[restrictToWindowEdges]}
    >
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
                      <DroppableZone 
                        key={dayIndex}
                        machineId={machine.id}
                        dayIndex={dayIndex}
                        isOver={dragOverZone?.machineId === machine.id && dragOverZone?.dayIndex === dayIndex}
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
                                  <br />
                                  <Typography variant="caption" sx={{ fontWeight: 'bold', color: '#4caf50' }}>
                                    💡 Drag to move between machines/days
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
                              <DraggableSlot
                                slot={slot}
                                position={position}
                                color={color}
                                onClick={() => handleSlotClick(slot)}
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
                                    <Box sx={{ textAlign: 'center', mt: 1 }}>
                                      <Typography 
                                        variant="caption" 
                                        display="block" 
                                        fontWeight="bold" 
                                        noWrap
                                        sx={{ fontSize: '12px', lineHeight: 'inherit' }}
                                      >
                                        {slot.job_number}
                                      </Typography>
                                      <Typography 
                                        variant="caption" 
                                        display="block" 
                                        noWrap
                                        sx={{ fontSize: '10px', opacity: 0.9, mt: 0.5 }}
                                      >
                                        {slot.operation_name}
                                      </Typography>
                                      <Typography 
                                        variant="caption" 
                                        display="block" 
                                        noWrap
                                        sx={{ fontSize: '10px', opacity: 0.8, mt: 0.5 }}
                                      >
                                        {Math.round(position.durationMinutes)} min
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
                              </DraggableSlot>
                            </Tooltip>
                          );
                        })}
                      </DroppableZone>
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
          Job Schedule Management
        </DialogTitle>
        <DialogContent>
          {selectedSlot && (
            <Box sx={{ pt: 1 }}>
              <Typography variant="h6" gutterBottom color="primary">
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
                Operator: {selectedSlot.employee_name || 'None (INSPECT operation)'}
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
              
              <Box sx={{ mt: 3, p: 2, backgroundColor: '#f5f5f5', borderRadius: 1 }}>
                <Typography variant="subtitle2" gutterBottom>
                  Schedule Management Actions:
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  <Button 
                    variant="outlined" 
                    color="warning"
                    onClick={() => handleUnscheduleJob(selectedSlot.job_id, selectedSlot.job_number)}
                    size="small"
                  >
                    Unschedule Job
                  </Button>
                  <Button 
                    variant="outlined" 
                    color="primary"
                    onClick={() => handleRescheduleJob(selectedSlot.job_id, selectedSlot.job_number)}
                    size="small"
                  >
                    Reschedule Job
                  </Button>
                </Box>
                <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                  Unschedule removes all schedule slots. Reschedule automatically places operations on correct machines.
                </Typography>
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditModalOpen(false)}>
            Close
          </Button>
        </DialogActions>
      </Dialog>

      {/* Drag Message */}
      <Snackbar 
        open={!!dragMessage} 
        message={dragMessage}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      />

      {/* Drag Overlay */}
      <DragOverlay>
        {draggedSlot && (
          <Box
            sx={{
              backgroundColor: getSlotColor(draggedSlot),
              borderRadius: '4px',
              border: '2px solid rgba(255,255,255,0.8)',
              p: 0.5,
              color: 'white',
              fontSize: '11px',
              minWidth: '120px',
              minHeight: '60px',
              boxShadow: '0 4px 8px rgba(0,0,0,0.3)',
              cursor: 'grabbing'
            }}
          >
            <Typography variant="caption" display="block" fontWeight="bold" noWrap>
              {draggedSlot.job_number}
            </Typography>
            <Typography variant="caption" display="block" noWrap>
              {draggedSlot.operation_name}
            </Typography>
            <Typography variant="caption" display="block" noWrap>
              {draggedSlot.duration_minutes} min
            </Typography>
          </Box>
        )}
      </DragOverlay>
      </Box>
    </DndContext>
  );
};

export default ScheduleView;
