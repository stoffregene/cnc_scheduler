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
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Tooltip,
  Link,
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  Schedule as ScheduleIcon,
  Build as BuildIcon,
  Person as PersonIcon,
  PlayArrow as PlayArrowIcon,
  AutoMode as AutoModeIcon,
  Delete as DeleteIcon,
  Visibility as VisibilityIcon,
  Lock as LockIcon,
} from '@mui/icons-material';
import { format, parseISO } from 'date-fns';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';

import { apiService } from '../services/apiService';

const Scheduling = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [scheduling, setScheduling] = useState(false);
  const [jobs, setJobs] = useState([]);
  const [machineWorkload, setMachineWorkload] = useState([]);
  const [schedulingResults, setSchedulingResults] = useState(null);
  const [selectedJob, setSelectedJob] = useState(null);
  const [jobDialogOpen, setJobDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [jobRoutings, setJobRoutings] = useState([]);

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

  const handleJobClick = async (job) => {
    setSelectedJob(job);
    setJobDialogOpen(true);
    
    // Fetch job routings
    try {
      const response = await apiService.get(`/api/jobs/${job.id}/routings`);
      setJobRoutings(response.data);
    } catch (error) {
      console.error('Error fetching job routings:', error);
      setJobRoutings([]);
    }
  };

  const handleLockJob = async (jobId, lock = true) => {
    try {
      const endpoint = lock ? `/api/locks/job/${jobId}/lock` : `/api/locks/job/${jobId}/unlock`;
      const response = await apiService.post(endpoint, {
        reason: lock ? 'Manual lock - High priority job' : undefined
      });
      
      if (response.data.success) {
        toast.success(lock ? 'Job locked successfully' : 'Job unlocked successfully');
        fetchData(); // Refresh data
        setJobDialogOpen(false);
      }
    } catch (error) {
      console.error('Error toggling lock:', error);
      toast.error(error.response?.data?.error || `Failed to ${lock ? 'lock' : 'unlock'} job`);
    }
  };

  const handleDeleteJob = async (jobId) => {
    try {
      setDeleting(jobId);
      await apiService.delete(`/api/jobs/${jobId}`);
      toast.success('Job deleted successfully!');
      fetchData(); // Refresh data
    } catch (error) {
      console.error('Error deleting job:', error);
      toast.error(error.response?.data?.error || 'Failed to delete job');
    } finally {
      setDeleting(null);
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
                      cursor: 'pointer',
                      '&:hover': {
                        backgroundColor: 'rgba(0, 0, 0, 0.04)',
                      }
                    }}
                    onClick={() => handleJobClick(job)}
                  >
                    <ListItemText
                      primary={
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontWeight: 'bold', fontSize: '0.875rem' }}>
                            {job.job_number}
                          </span>
                          {job.schedule_locked && (
                            <Tooltip title={`Locked: ${job.lock_reason || 'Started operation'}`}>
                              <LockIcon sx={{ fontSize: '1rem', color: 'warning.main' }} />
                            </Tooltip>
                          )}
                          <Chip
                            size="small"
                            label={job.priority_score || 0}
                            color={getPriorityColor(job.priority_score || 0)}
                            sx={{ fontWeight: 'bold' }}
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
                    <Box sx={{ display: 'flex', gap: 1 }}>
                      <Tooltip title="View Details">
                        <IconButton
                          size="small"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleJobClick(job);
                          }}
                        >
                          <VisibilityIcon />
                        </IconButton>
                      </Tooltip>
                      <Button
                        size="small"
                        startIcon={<PlayArrowIcon />}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleScheduleJob(job.id);
                        }}
                        variant="outlined"
                      >
                        Schedule
                      </Button>
                      <Tooltip title="Delete Job">
                        <IconButton
                          size="small"
                          color="error"
                          disabled={deleting === job.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (window.confirm(`Are you sure you want to delete job ${job.job_number}?`)) {
                              handleDeleteJob(job.id);
                            }
                          }}
                        >
                          {deleting === job.id ? <CircularProgress size={16} /> : <DeleteIcon />}
                        </IconButton>
                      </Tooltip>
                    </Box>
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
                  <Typography variant="body2">
                    <strong>Estimated Hours:</strong> {selectedJob.estimated_hours || 'Not set'}
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
                                {routing.slot_locked && (
                                  <Tooltip title="Operation locked - cannot be rescheduled">
                                    <Chip 
                                      size="small" 
                                      label="Locked"
                                      color="warning"
                                      variant="filled"
                                      icon={<LockIcon />}
                                    />
                                  </Tooltip>
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
              {selectedJob.schedule_locked ? (
                <Button
                  color="warning"
                  startIcon={<LockIcon />}
                  onClick={() => handleLockJob(selectedJob.id, false)}
                >
                  Unlock Job
                </Button>
              ) : (
                <Button
                  color="warning"
                  startIcon={<LockIcon />}
                  onClick={() => handleLockJob(selectedJob.id, true)}
                >
                  Lock Job
                </Button>
              )}
              <Button 
                color="error" 
                startIcon={<DeleteIcon />}
                onClick={() => {
                  if (window.confirm(`Are you sure you want to delete job ${selectedJob.job_number}?`)) {
                    handleDeleteJob(selectedJob.id);
                    setJobDialogOpen(false);
                  }
                }}
                disabled={selectedJob.schedule_locked}
              >
                Delete Job
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </Box>
  );
};

export default Scheduling;