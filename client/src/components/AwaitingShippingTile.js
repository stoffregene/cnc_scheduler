import React, { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  Typography,
  Box,
  Chip,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Divider,
  Alert,
  IconButton,
  Collapse,
  Grid,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Warning as WarningIcon,
  LocalShipping as ShippingIcon,
  CheckCircle as CheckCircleIcon,
  Visibility as VisibilityIcon,
} from '@mui/icons-material';
import { format, parseISO } from 'date-fns';
import { apiService } from '../services/apiService';

const AwaitingShippingTile = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [selectedJob, setSelectedJob] = useState(null);
  const [jobDialogOpen, setJobDialogOpen] = useState(false);

  useEffect(() => {
    fetchAwaitingShippingData();
    // Refresh every 5 minutes
    const interval = setInterval(fetchAwaitingShippingData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const fetchAwaitingShippingData = async () => {
    try {
      setLoading(true);
      const response = await apiService.get('/api/jobs/awaiting-shipping');
      setData(response);
      setError(null);
    } catch (err) {
      console.error('Error fetching awaiting shipping data:', err);
      setError('Failed to load awaiting shipping data');
    } finally {
      setLoading(false);
    }
  };

  const getUrgencyColor = (urgencyStatus) => {
    switch (urgencyStatus) {
      case 'overdue':
        return 'error';
      case 'due_today':
        return 'error';
      case 'urgent':
        return 'warning';
      case 'soon':
        return 'info';
      case 'on_schedule':
        return 'success';
      default:
        return 'default';
    }
  };

  const getUrgencyText = (urgencyStatus, dueDate) => {
    switch (urgencyStatus) {
      case 'overdue':
        return 'OVERDUE - Ship immediately';
      case 'due_today':
        return 'Ship TODAY';
      case 'urgent':
        return 'Ship within 3 days';
      case 'soon':
        return 'Ship within 7 days';
      case 'on_schedule':
        return 'On schedule';
      case 'no_date':
        return 'No due date';
      default:
        return 'Unknown status';
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Not set';
    try {
      return format(parseISO(dateString), 'MMM dd, yyyy');
    } catch {
      return 'Invalid date';
    }
  };

  const handleJobDetailsClick = (job) => {
    setSelectedJob(job);
    setJobDialogOpen(true);
  };

  if (loading) {
    return (
      <Card className="industrial-card" sx={{ height: '400px' }}>
        <CardContent>
          <Typography variant="h6" gutterBottom sx={{ color: '#e4e6eb' }}>
            Awaiting Shipping
          </Typography>
          <Typography>Loading...</Typography>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="industrial-card" sx={{ height: '400px' }}>
        <CardContent>
          <Typography variant="h6" gutterBottom sx={{ color: '#e4e6eb' }}>
            Awaiting Shipping
          </Typography>
          <Alert severity="error">{error}</Alert>
        </CardContent>
      </Card>
    );
  }

  const { jobs = [], totals = {} } = data || {};
  const urgentJobs = jobs.filter(job => 
    ['overdue', 'due_today', 'urgent'].includes(job.urgency_status)
  );

  return (
    <Card className="industrial-card">
      <CardContent sx={{ pb: 1 }}>
        {/* Header */}
        <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
          <Box display="flex" alignItems="center" gap={1}>
            <ShippingIcon sx={{ color: '#10b981' }} />
            <Typography variant="h6" sx={{ color: '#e4e6eb', fontWeight: 600 }}>
              Awaiting Shipping
            </Typography>
          </Box>
          <IconButton 
            size="small" 
            onClick={() => setExpanded(!expanded)}
            sx={{ color: '#9ca3af' }}
          >
            {expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
          </IconButton>
        </Box>

        {/* Summary Stats */}
        <Grid container spacing={2} sx={{ mb: 2 }}>
          <Grid item xs={6}>
            <Box textAlign="center">
              <Typography variant="h4" sx={{ color: totals.overdue + totals.due_today > 0 ? '#ef4444' : '#e4e6eb', fontWeight: 'bold' }}>
                {totals.total_jobs || 0}
              </Typography>
              <Typography variant="body2" sx={{ color: '#9ca3af' }}>
                Jobs Ready to Ship
              </Typography>
            </Box>
          </Grid>
          <Grid item xs={6}>
            <Box textAlign="center">
              <Typography variant="h4" sx={{ color: totals.overdue + totals.due_today + totals.urgent > 0 ? '#f59e0b' : '#10b981', fontWeight: 'bold' }}>
                {urgentJobs.length}
              </Typography>
              <Typography variant="body2" sx={{ color: '#9ca3af' }}>
                Urgent Shipments
              </Typography>
            </Box>
          </Grid>
        </Grid>

        {/* Alert Summary */}
        {(totals.overdue > 0 || totals.due_today > 0 || totals.urgent > 0) && (
          <Alert 
            severity="warning" 
            icon={<WarningIcon />}
            sx={{ mb: 2, bgcolor: 'rgba(251, 191, 36, 0.1)', borderColor: '#f59e0b' }}
          >
            <Typography variant="body2">
              {totals.overdue > 0 && `${totals.overdue} overdue, `}
              {totals.due_today > 0 && `${totals.due_today} due today, `}
              {totals.urgent > 0 && `${totals.urgent} urgent shipments`}
            </Typography>
          </Alert>
        )}

        {/* Ready to Ship Jobs List */}
        {urgentJobs.length > 0 ? (
          <List dense sx={{ maxHeight: expanded ? 'none' : '200px', overflow: 'auto' }}>
            {(expanded ? urgentJobs : urgentJobs.slice(0, 3)).map((job, index) => (
              <React.Fragment key={job.job_id}>
                {index > 0 && <Divider />}
                <ListItem sx={{ px: 0 }}>
                  <ListItemText
                    primary={
                      <Box display="flex" alignItems="center" gap={1} flexWrap="wrap">
                        <Typography variant="body2" fontWeight="bold" sx={{ color: '#e4e6eb' }}>
                          {job.job_number}
                        </Typography>
                        <Chip 
                          size="small" 
                          label="All Ops Complete"
                          color="success"
                          variant="filled"
                          icon={<CheckCircleIcon />}
                        />
                        <Typography variant="caption" sx={{ color: '#9ca3af' }}>
                          {job.part_name}
                        </Typography>
                      </Box>
                    }
                    secondary={
                      <Box sx={{ mt: 0.5 }}>
                        <Typography variant="caption" display="block" sx={{ color: '#9ca3af' }}>
                          <strong>Customer:</strong> {job.customer_name}
                        </Typography>
                        <Typography variant="caption" display="block" sx={{ color: '#9ca3af' }}>
                          <strong>Due:</strong> {formatDate(job.promised_date)} 
                          {job.days_since_completion && ` • Completed ${Math.round(job.days_since_completion)} days ago`}
                        </Typography>
                        <Chip
                          size="small"
                          label={getUrgencyText(job.urgency_status, job.promised_date)}
                          color={getUrgencyColor(job.urgency_status)}
                          variant="filled"
                          sx={{ mt: 0.5 }}
                        />
                      </Box>
                    }
                  />
                  <ListItemSecondaryAction>
                    <Tooltip title="View job details">
                      <IconButton 
                        size="small" 
                        onClick={() => handleJobDetailsClick(job)}
                        sx={{ color: '#9ca3af', '&:hover': { color: '#10b981' } }}
                      >
                        <VisibilityIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </ListItemSecondaryAction>
                </ListItem>
              </React.Fragment>
            ))}
            
            {!expanded && urgentJobs.length > 3 && (
              <ListItem>
                <ListItemText>
                  <Typography 
                    variant="caption" 
                    sx={{ color: '#9ca3af', fontStyle: 'italic' }}
                  >
                    +{urgentJobs.length - 3} more jobs ready to ship...
                  </Typography>
                </ListItemText>
              </ListItem>
            )}
          </List>
        ) : (
          <Box textAlign="center" py={2}>
            <Typography variant="body2" sx={{ color: '#9ca3af' }}>
              {totals.total_jobs > 0 
                ? 'All jobs are on schedule for shipping' 
                : 'No jobs awaiting shipping'}
            </Typography>
          </Box>
        )}

        {/* Expanded View - All Jobs */}
        <Collapse in={expanded}>
          {jobs.length > urgentJobs.length && (
            <Box sx={{ mt: 2 }}>
              <Divider sx={{ mb: 2 }} />
              <Typography variant="subtitle2" sx={{ color: '#e4e6eb', mb: 1 }}>
                All Jobs Ready to Ship ({totals.total_jobs})
              </Typography>
              <List dense>
                {jobs.slice(urgentJobs.length).map((job, index) => (
                  <ListItem key={job.job_id} sx={{ px: 0 }}>
                    <ListItemText
                      primary={
                        <Typography variant="body2" sx={{ color: '#e4e6eb' }}>
                          {job.job_number} - {job.customer_name}
                        </Typography>
                      }
                      secondary={
                        <Typography variant="caption" sx={{ color: '#9ca3af' }}>
                          {job.part_name} • Due: {formatDate(job.promised_date)}
                        </Typography>
                      }
                    />
                    <ListItemSecondaryAction>
                      <Chip
                        size="small"
                        label={getUrgencyText(job.urgency_status)}
                        color={getUrgencyColor(job.urgency_status)}
                        variant="outlined"
                      />
                    </ListItemSecondaryAction>
                  </ListItem>
                ))}
              </List>
            </Box>
          )}
        </Collapse>
      </CardContent>

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
                    Job Information
                  </Typography>
                  <Typography variant="body2">
                    <strong>Customer:</strong> {selectedJob.customer_name}
                  </Typography>
                  <Typography variant="body2">
                    <strong>Part Name:</strong> {selectedJob.part_name}
                  </Typography>
                  <Typography variant="body2">
                    <strong>Part Number:</strong> {selectedJob.part_number || 'Not set'}
                  </Typography>
                  <Typography variant="body2">
                    <strong>Quantity:</strong> {selectedJob.quantity || 'Not set'}
                  </Typography>
                  <Typography variant="body2">
                    <strong>Material:</strong> {selectedJob.material || 'Not set'}
                  </Typography>
                </Grid>
                <Grid item xs={12} md={6}>
                  <Typography variant="subtitle1" gutterBottom>
                    Shipping Details
                  </Typography>
                  <Typography variant="body2">
                    <strong>Due Date:</strong> {formatDate(selectedJob.promised_date)}
                  </Typography>
                  <Typography variant="body2">
                    <strong>Priority:</strong> {selectedJob.priority_score || 'Not set'}
                  </Typography>
                  <Typography variant="body2">
                    <strong>Job Status:</strong> {selectedJob.job_status}
                  </Typography>
                  <Typography variant="body2">
                    <strong>Completed:</strong> {Math.round(selectedJob.days_since_completion || 0)} days ago
                  </Typography>
                  <Chip
                    size="small"
                    label={getUrgencyText(selectedJob.urgency_status, selectedJob.promised_date)}
                    color={getUrgencyColor(selectedJob.urgency_status)}
                    variant="filled"
                    sx={{ mt: 1 }}
                  />
                </Grid>
                
                {/* Operations Status */}
                {selectedJob.operations && selectedJob.operations.length > 0 && (
                  <Grid item xs={12}>
                    <Typography variant="subtitle1" gutterBottom sx={{ mt: 2 }}>
                      Operations Status
                    </Typography>
                    <List dense>
                      {selectedJob.operations
                        .sort((a, b) => a.sequence_order - b.sequence_order)
                        .map((operation) => (
                          <ListItem 
                            key={operation.id} 
                            sx={{ 
                              border: '1px solid',
                              borderColor: 'success.main',
                              borderRadius: 1,
                              mb: 1,
                              px: 2,
                              bgcolor: 'rgba(76, 175, 80, 0.1)'
                            }}
                          >
                            <ListItemText
                              primary={
                                <Box display="flex" alignItems="center" gap={1}>
                                  <Chip 
                                    size="small" 
                                    label={`Op ${operation.operation_number}`}
                                    color="success"
                                    variant="outlined"
                                  />
                                  <Typography variant="body2" fontWeight="bold">
                                    {operation.operation_name}
                                  </Typography>
                                  <Chip 
                                    size="small" 
                                    label="COMPLETED"
                                    color="success"
                                    variant="filled"
                                    icon={<CheckCircleIcon />}
                                  />
                                </Box>
                              }
                              secondary={
                                <Box sx={{ mt: 0.5 }}>
                                  <Typography variant="caption" display="block" sx={{ color: 'success.main' }}>
                                    <strong>Status:</strong> {operation.status}
                                  </Typography>
                                  {operation.completed_at && (
                                    <Typography variant="caption" display="block" sx={{ color: 'success.main' }}>
                                      <strong>Completed:</strong> {format(parseISO(operation.completed_at), 'MMM dd, h:mm a')}
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

                {/* Shipping Alert */}
                <Grid item xs={12}>
                  <Typography variant="subtitle1" gutterBottom sx={{ mt: 2 }}>
                    Shipping Status
                  </Typography>
                  <Alert severity="success" icon={<CheckCircleIcon />}>
                    <Typography variant="body2">
                      ✓ All operations completed. This job is ready for quality check and shipping.
                    </Typography>
                  </Alert>
                </Grid>
              </Grid>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setJobDialogOpen(false)}>Close</Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </Card>
  );
};

export default AwaitingShippingTile;