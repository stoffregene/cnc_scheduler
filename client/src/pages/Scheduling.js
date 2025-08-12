import React, { useState, useEffect } from 'react';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  Button,
  List,
  ListItem,
  ListItemText,
  Chip,
  CircularProgress,
  Alert,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  LinearProgress,
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  Schedule as ScheduleIcon,
  Build as BuildIcon,
  Person as PersonIcon,
  PlayArrow as PlayArrowIcon,
  AutoMode as AutoModeIcon,
} from '@mui/icons-material';
import { format, parseISO } from 'date-fns';
import toast from 'react-hot-toast';

import { apiService } from '../services/apiService';

const Scheduling = () => {
  const [loading, setLoading] = useState(true);
  const [scheduling, setScheduling] = useState(false);
  const [jobs, setJobs] = useState([]);
  const [machineWorkload, setMachineWorkload] = useState([]);
  const [schedulingResults, setSchedulingResults] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [jobsResponse, workloadResponse] = await Promise.all([
        apiService.get('/api/jobs'),
        apiService.get('/api/scheduling/machine-workload')
      ]);
      
      setJobs(jobsResponse.data);
      setMachineWorkload(workloadResponse.data);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Failed to load scheduling data');
    } finally {
      setLoading(false);
    }
  };

  const handleAutoSchedule = async () => {
    try {
      setScheduling(true);
      const response = await apiService.post('/api/scheduling/auto-schedule');
      
      setSchedulingResults(response.data);
      
      if (response.data.successful > 0) {
        toast.success(`Successfully scheduled ${response.data.successful} jobs!`);
        fetchData(); // Refresh data
      }
      
      if (response.data.failed > 0) {
        toast.error(`Failed to schedule ${response.data.failed} jobs`);
      }
    } catch (error) {
      console.error('Error auto-scheduling:', error);
      toast.error('Auto-scheduling failed');
    } finally {
      setScheduling(false);
    }
  };

  const handleScheduleJob = async (jobId) => {
    try {
      const response = await apiService.post(`/api/scheduling/schedule-job/${jobId}`);
      toast.success(`Job scheduled successfully!`);
      fetchData(); // Refresh data
    } catch (error) {
      console.error('Error scheduling job:', error);
      toast.error(error.response?.data?.error || 'Failed to schedule job');
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'scheduled':
        return 'primary';
      case 'completed':
        return 'success';
      case 'in_progress':
        return 'warning';
      case 'cancelled':
        return 'error';
      case 'pending':
      default:
        return 'default';
    }
  };

  const pendingJobs = jobs.filter(job => job.status === 'pending');
  const scheduledJobs = jobs.filter(job => job.status === 'scheduled');

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" height="400px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" gutterBottom>
          Production Scheduling
        </Typography>
        <Typography variant="subtitle1" color="text.secondary">
          Lean 6S backward scheduling with 28-day lead time optimization
        </Typography>
      </Box>

      {/* Auto Schedule Controls */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box display="flex" justifyContent="space-between" alignItems="center">
            <Box>
              <Typography variant="h6" gutterBottom>
                Auto-Schedule All Pending Jobs
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {pendingJobs.length} jobs pending • {scheduledJobs.length} jobs scheduled
              </Typography>
            </Box>
            <Button
              variant="contained"
              startIcon={scheduling ? <CircularProgress size={20} /> : <AutoModeIcon />}
              onClick={handleAutoSchedule}
              disabled={scheduling || pendingJobs.length === 0}
              size="large"
            >
              {scheduling ? 'Scheduling...' : 'Auto-Schedule All'}
            </Button>
          </Box>
        </CardContent>
      </Card>

      {/* Scheduling Results */}
      {schedulingResults && (
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Scheduling Results
            </Typography>
            <Box display="flex" gap={2} mb={2}>
              <Chip 
                label={`${schedulingResults.successful} Successful`} 
                color="success" 
                variant="outlined" 
              />
              <Chip 
                label={`${schedulingResults.failed} Failed`} 
                color="error" 
                variant="outlined" 
              />
            </Box>
            <Accordion>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography>View Details</Typography>
              </AccordionSummary>
              <AccordionDetails>
                <List dense>
                  {schedulingResults.details.map((result, index) => (
                    <ListItem key={index}>
                      <ListItemText
                        primary={result.job_number}
                        secondary={result.success ? 
                          `Scheduled ${result.operations_scheduled} operations` : 
                          result.error
                        }
                      />
                      <Chip
                        size="small"
                        label={result.success ? 'Success' : 'Failed'}
                        color={result.success ? 'success' : 'error'}
                      />
                    </ListItem>
                  ))}
                </List>
              </AccordionDetails>
            </Accordion>
          </CardContent>
        </Card>
      )}

      <Grid container spacing={3}>
        {/* Pending Jobs */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Pending Jobs ({pendingJobs.length})
              </Typography>
              <List dense>
                {pendingJobs.slice(0, 10).map((job) => (
                  <ListItem
                    key={job.id}
                    sx={{
                      border: '1px solid',
                      borderColor: 'divider',
                      borderRadius: 1,
                      mb: 1,
                    }}
                  >
                    <ListItemText
                      primary={
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontWeight: 'bold', fontSize: '0.875rem' }}>
                            {job.job_number}
                          </span>
                          <Chip
                            size="small"
                            label={`P${job.priority}`}
                            color={job.priority <= 3 ? 'error' : job.priority <= 6 ? 'warning' : 'default'}
                          />
                        </div>
                      }
                      secondary={
                        <div>
                          <div style={{ fontSize: '0.875rem' }}>
                            {job.customer_name} • {job.part_name}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: '#666' }}>
                            Due: {job.due_date ? format(parseISO(job.due_date), 'MMM dd, yyyy') : 'Not set'}
                          </div>
                        </div>
                      }
                    />
                    <Button
                      size="small"
                      startIcon={<PlayArrowIcon />}
                      onClick={() => handleScheduleJob(job.id)}
                      variant="outlined"
                    >
                      Schedule
                    </Button>
                  </ListItem>
                ))}
                {pendingJobs.length === 0 && (
                  <Alert severity="success">No pending jobs to schedule!</Alert>
                )}
              </List>
            </CardContent>
          </Card>
        </Grid>

        {/* Machine Workload */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Machine Workload Today
              </Typography>
              <List dense>
                {machineWorkload.map((machine, index) => (
                  <ListItem
                    key={`machine-${machine.machine_id}-${index}`}
                    sx={{
                      border: '1px solid',
                      borderColor: 'divider',
                      borderRadius: 1,
                      mb: 1,
                    }}
                  >
                    <ListItemText
                      primary={
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <BuildIcon fontSize="small" />
                          <span style={{ fontWeight: 'bold', fontSize: '0.875rem' }}>
                            {machine.machine_name}
                          </span>
                          <Chip
                            size="small"
                            label={machine.group_name || 'No Group'}
                            variant="outlined"
                          />
                        </div>
                      }
                      secondary={
                        <div>
                          <div style={{ fontSize: '0.875rem' }}>
                            {machine.scheduled_jobs} jobs • {Math.round(machine.total_minutes / 60)}h scheduled
                          </div>
                          <LinearProgress
                            variant="determinate"
                            value={Math.min((machine.total_minutes / (8 * 60)) * 100, 100)}
                            sx={{ mt: 0.5 }}
                          />
                          <div style={{ fontSize: '0.75rem', color: '#666' }}>
                            {Math.round((machine.total_minutes / (8 * 60)) * 100)}% of 8-hour day
                          </div>
                        </div>
                      }
                    />
                  </ListItem>
                ))}
                {machineWorkload.length === 0 && (
                  <Alert severity="info">No machines with scheduled work today</Alert>
                )}
              </List>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

export default Scheduling;