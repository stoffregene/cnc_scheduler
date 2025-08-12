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
  Paper,
  Divider,
} from '@mui/material';
import {
  Build as BuildIcon,
  Schedule as ScheduleIcon,
  Person as PersonIcon,
  Assignment as AssignmentIcon,
  Today as TodayIcon,
} from '@mui/icons-material';
import { format, parseISO, addDays } from 'date-fns';
import toast from 'react-hot-toast';

import { apiService } from '../services/apiService';

const MachineQueues = () => {
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [machineWorkloads, setMachineWorkloads] = useState([]);
  const [selectedTimeframe, setSelectedTimeframe] = useState('today');

  useEffect(() => {
    fetchMachineWorkloads();
  }, [currentDate, selectedTimeframe]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchMachineWorkloads = async () => {
    try {
      setLoading(true);
      const targetDate = selectedTimeframe === 'today' 
        ? format(currentDate, 'yyyy-MM-dd')
        : format(addDays(currentDate, 1), 'yyyy-MM-dd');

      const response = await apiService.get('/api/scheduling/machine-workload', {
        params: { date: targetDate }
      });
      
      setMachineWorkloads(response.data);
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

  const MachineColumn = ({ machine }) => {
    const utilization = calculateUtilization(machine.total_minutes);
    const utilizationColor = getUtilizationColor(utilization);
    
    return (
      <Paper sx={{ p: 2, height: 'fit-content', minHeight: '400px' }}>
        {/* Machine Header */}
        <Box mb={2}>
          <Box display="flex" alignItems="center" gap={1} mb={1}>
            <Avatar sx={{ bgcolor: 'primary.main', width: 32, height: 32 }}>
              <BuildIcon fontSize="small" />
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
        
        {/* Controls */}
        <Box display="flex" justifyContent="space-between" alignItems="center" sx={{ mt: 2 }}>
          <Box display="flex" gap={2} alignItems="center">
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel>Timeframe</InputLabel>
              <Select
                value={selectedTimeframe}
                label="Timeframe"
                onChange={(e) => setSelectedTimeframe(e.target.value)}
              >
                <MenuItem value="today">Today</MenuItem>
                <MenuItem value="tomorrow">Tomorrow</MenuItem>
                <MenuItem value="week">This Week</MenuItem>
              </Select>
            </FormControl>
            
            <Button
              variant="outlined"
              startIcon={<TodayIcon />}
              onClick={() => setCurrentDate(new Date())}
            >
              Today
            </Button>
            
            <Button
              variant="contained"
              onClick={fetchMachineWorkloads}
            >
              Refresh
            </Button>
          </Box>
          
          <Typography variant="body2" color="text.secondary">
            {format(currentDate, 'EEEE, MMMM d, yyyy')}
          </Typography>
        </Box>
      </Box>

      {/* Machine Queue Grid */}
      <Grid container spacing={2}>
        {machineWorkloads.map((machine) => (
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
    </Box>
  );
};

export default MachineQueues;