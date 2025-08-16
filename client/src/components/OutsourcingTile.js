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
  Schedule as ScheduleIcon,
  Business as BusinessIcon,
  Assignment as AssignmentIcon,
  Visibility as VisibilityIcon,
} from '@mui/icons-material';
import { format, parseISO } from 'date-fns';
import { apiService } from '../services/apiService';

const OutsourcingTile = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [selectedJob, setSelectedJob] = useState(null);
  const [jobDialogOpen, setJobDialogOpen] = useState(false);
  const [jobRoutings, setJobRoutings] = useState([]);

  useEffect(() => {
    fetchOutsourcingData();
    // Refresh every 5 minutes
    const interval = setInterval(fetchOutsourcingData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const fetchOutsourcingData = async () => {
    try {
      setLoading(true);
      const response = await apiService.get('/api/outsourcing/summary');
      setData(response.data);
      setError(null);
    } catch (err) {
      console.error('Error fetching outsourcing data:', err);
      setError('Failed to load outsourcing data');
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

  const getUrgencyText = (urgencyStatus, daysUntilSendout) => {
    // Ensure daysUntilSendout is a valid number
    const days = Number.isNaN(daysUntilSendout) || daysUntilSendout === null || daysUntilSendout === undefined ? 0 : Math.round(daysUntilSendout);
    
    switch (urgencyStatus) {
      case 'overdue':
        return `OVERDUE by ${Math.abs(days)} days`;
      case 'due_today':
        return 'Send out TODAY';
      case 'urgent':
        return `Send out in ${days} days`;
      case 'soon':
        return `${days} days until send-out`;
      case 'on_schedule':
        return `On schedule (${days} days)`;
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

  const handleJobDetailsClick = async (operation) => {
    setSelectedJob(operation);
    setJobDialogOpen(true);
    
    // Fetch job routings with scheduling information
    try {
      const response = await apiService.get(`/api/jobs/${operation.job_id}/routings`);
      setJobRoutings(response.data);
    } catch (error) {
      console.error('Error fetching job routings:', error);
      setJobRoutings([]);
    }
  };

  if (loading) {
    return (
      <Card className="industrial-card" sx={{ height: '400px' }}>
        <CardContent>
          <Typography variant="h6" gutterBottom sx={{ color: '#e4e6eb' }}>
            Outsourcing Operations
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
            Outsourcing Operations
          </Typography>
          <Alert severity="error">{error}</Alert>
        </CardContent>
      </Card>
    );
  }

  const { operations = [], totals = {}, summary = [] } = data || {};
  const criticalOps = operations.filter(op => 
    ['overdue', 'due_today', 'urgent'].includes(op.urgency_status)
  );

  return (
    <Card className="industrial-card">
      <CardContent sx={{ pb: 1 }}>
        {/* Header */}
        <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
          <Box display="flex" alignItems="center" gap={1}>
            <BusinessIcon sx={{ color: '#00d4ff' }} />
            <Typography variant="h6" sx={{ color: '#e4e6eb', fontWeight: 600 }}>
              Outsourcing Operations
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
                Jobs w/ Outsourcing
              </Typography>
            </Box>
          </Grid>
          <Grid item xs={6}>
            <Box textAlign="center">
              <Typography variant="h4" sx={{ color: totals.overdue + totals.due_today + totals.urgent > 0 ? '#f59e0b' : '#10b981', fontWeight: 'bold' }}>
                {criticalOps.length}
              </Typography>
              <Typography variant="body2" sx={{ color: '#9ca3af' }}>
                Critical Operations
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
              {totals.urgent > 0 && `${totals.urgent} urgent`}
              {totals.unscheduled_prereqs > 0 && ` • ${totals.unscheduled_prereqs} missing prerequisites`}
            </Typography>
          </Alert>
        )}

        {/* Critical Operations List */}
        {criticalOps.length > 0 ? (
          <List dense sx={{ maxHeight: expanded ? 'none' : '200px', overflow: 'auto' }}>
            {(expanded ? criticalOps : criticalOps.slice(0, 3)).map((op, index) => (
              <React.Fragment key={`${op.job_id}-${op.routing_id}`}>
                {index > 0 && <Divider />}
                <ListItem sx={{ px: 0 }}>
                  <ListItemText
                    primary={
                      <Box display="flex" alignItems="center" gap={1} flexWrap="wrap">
                        <Typography variant="body2" fontWeight="bold" sx={{ color: '#e4e6eb' }}>
                          {op.job_number}
                        </Typography>
                        <Chip 
                          size="small" 
                          label={op.operation_name}
                          variant="outlined"
                          sx={{ color: '#9ca3af', borderColor: '#4b5563' }}
                        />
                        {op.vendor_name && (
                          <Typography variant="caption" sx={{ color: '#9ca3af' }}>
                            → {op.vendor_name}
                          </Typography>
                        )}
                        {op.is_stock_job && (
                          <Chip 
                            size="small" 
                            label="Stock"
                            color="default"
                            variant="filled"
                          />
                        )}
                      </Box>
                    }
                    secondary={
                      <Box sx={{ mt: 0.5 }}>
                        <Typography variant="caption" display="block" sx={{ color: '#9ca3af' }}>
                          <strong>Customer:</strong> {op.customer_name}
                        </Typography>
                        <Typography variant="caption" display="block" sx={{ color: '#9ca3af' }}>
                          <strong>Due:</strong> {formatDate(op.promised_date)} 
                          {op.vendor_lead_days && ` • ${op.vendor_lead_days} day lead time`}
                        </Typography>
                        <Typography variant="caption" display="block" sx={{ color: '#f59e0b', fontWeight: 'bold' }}>
                          <strong>Must ship by:</strong> {formatDate(op.send_out_by_date)}
                        </Typography>
                        <Chip
                          size="small"
                          label={getUrgencyText(op.urgency_status, op.days_until_sendout)}
                          color={getUrgencyColor(op.urgency_status)}
                          variant="filled"
                          sx={{ mt: 0.5 }}
                        />
                        {!op.previous_ops_scheduled && (
                          <Chip
                            size="small"
                            label="Prerequisites not scheduled"
                            color="warning"
                            variant="outlined"
                            sx={{ mt: 0.5, ml: 0.5 }}
                          />
                        )}
                      </Box>
                    }
                  />
                  <ListItemSecondaryAction>
                    <Tooltip title="View job details and routing">
                      <IconButton 
                        size="small" 
                        onClick={() => handleJobDetailsClick(op)}
                        sx={{ color: '#9ca3af', '&:hover': { color: '#00d4ff' } }}
                      >
                        <VisibilityIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </ListItemSecondaryAction>
                </ListItem>
              </React.Fragment>
            ))}
            
            {!expanded && criticalOps.length > 3 && (
              <ListItem>
                <ListItemText>
                  <Typography 
                    variant="caption" 
                    sx={{ color: '#9ca3af', fontStyle: 'italic' }}
                  >
                    +{criticalOps.length - 3} more critical operations...
                  </Typography>
                </ListItemText>
              </ListItem>
            )}
          </List>
        ) : (
          <Box textAlign="center" py={2}>
            <Typography variant="body2" sx={{ color: '#9ca3af' }}>
              {totals.total_jobs > 0 
                ? 'All outsourcing operations are on schedule' 
                : 'No outsourced operations found'}
            </Typography>
          </Box>
        )}

        {/* Expanded View - Vendor Summary */}
        <Collapse in={expanded}>
          {summary.length > 0 && (
            <Box sx={{ mt: 2 }}>
              <Divider sx={{ mb: 2 }} />
              <Typography variant="subtitle2" sx={{ color: '#e4e6eb', mb: 1 }}>
                Vendor Summary
              </Typography>
              <List dense>
                {summary.map((vendor, index) => (
                  <ListItem key={index} sx={{ px: 0 }}>
                    <ListItemText
                      primary={
                        <Typography variant="body2" sx={{ color: '#e4e6eb' }}>
                          {vendor.vendor_name || 'Unknown Vendor'}
                        </Typography>
                      }
                      secondary={
                        <Typography variant="caption" sx={{ color: '#9ca3af' }}>
                          {vendor.operation_count} operations • {vendor.job_count} jobs • {vendor.vendor_lead_days || 0} days lead time
                        </Typography>
                      }
                    />
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
                    <strong>Due Date:</strong> {formatDate(selectedJob.promised_date)}
                  </Typography>
                  <Typography variant="body2">
                    <strong>Priority:</strong> {selectedJob.priority || 'Not set'}
                  </Typography>
                  <Typography variant="body2">
                    <strong>Status:</strong> {selectedJob.status}
                  </Typography>
                  {selectedJob.is_stock_job && (
                    <Typography variant="body2" sx={{ color: 'info.main' }}>
                      <strong>Type:</strong> Stock Job
                    </Typography>
                  )}
                </Grid>
                <Grid item xs={12} md={6}>
                  <Typography variant="subtitle1" gutterBottom>
                    Outsourcing Details
                  </Typography>
                  <Typography variant="body2">
                    <strong>Operation:</strong> {selectedJob.operation_name}
                  </Typography>
                  <Typography variant="body2">
                    <strong>Sequence:</strong> Operation #{selectedJob.sequence_order}
                  </Typography>
                  <Typography variant="body2">
                    <strong>Vendor:</strong> {selectedJob.vendor_name || 'Not assigned'}
                  </Typography>
                  <Typography variant="body2">
                    <strong>Lead Time:</strong> {selectedJob.vendor_lead_days || 0} days
                  </Typography>
                  <Typography variant="body2">
                    <strong>Must ship by:</strong> {formatDate(selectedJob.send_out_by_date)}
                  </Typography>
                  <Typography variant="body2" sx={{ color: 'info.main', fontWeight: 'bold' }}>
                    <strong>Ship date calculation:</strong> Due date ({formatDate(selectedJob.promised_date)}) - {selectedJob.vendor_lead_days || 0} days lead time
                  </Typography>
                  <Chip
                    size="small"
                    label={getUrgencyText(selectedJob.urgency_status, selectedJob.days_until_sendout)}
                    color={getUrgencyColor(selectedJob.urgency_status)}
                    variant="filled"
                    sx={{ mt: 1 }}
                  />
                </Grid>
                
                {/* Job Routings - Show all operations in sequence */}
                {jobRoutings.length > 0 && (
                  <Grid item xs={12}>
                    <Typography variant="subtitle1" gutterBottom sx={{ mt: 2 }}>
                      Complete Operation Routing
                    </Typography>
                    <List dense>
                      {jobRoutings
                        .sort((a, b) => a.sequence_order - b.sequence_order)
                        .map((routing, index) => {
                          const isCurrentOutsourcing = routing.id === selectedJob.routing_id;
                          const isCompleted = routing.schedule_slot_id && routing.status === 'completed';
                          const isScheduled = routing.schedule_slot_id && routing.status !== 'completed';
                          
                          return (
                            <ListItem 
                              key={routing.id} 
                              sx={{ 
                                border: '1px solid',
                                borderColor: isCurrentOutsourcing ? 'warning.main' : 'divider',
                                borderRadius: 1,
                                mb: 1,
                                px: 2,
                                bgcolor: isCurrentOutsourcing ? 'rgba(245, 158, 11, 0.1)' : 'transparent'
                              }}
                            >
                              <ListItemText
                                primary={
                                  <Box display="flex" alignItems="center" gap={1}>
                                    <Chip 
                                      size="small" 
                                      label={`Op ${routing.operation_number}`}
                                      color={isCurrentOutsourcing ? "warning" : "primary"}
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
                                    {isCurrentOutsourcing && (
                                      <Chip 
                                        size="small" 
                                        label="OUTSOURCED"
                                        color="warning"
                                        variant="filled"
                                      />
                                    )}
                                    {isCompleted && (
                                      <Chip 
                                        size="small" 
                                        label="Completed"
                                        color="success"
                                        variant="filled"
                                      />
                                    )}
                                    {isScheduled && !isCompleted && (
                                      <Chip 
                                        size="small" 
                                        label="Scheduled"
                                        color="info"
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
                                    <Typography variant="caption" display="block">
                                      <strong>Status:</strong> {routing.routing_status === 'C' ? 'Completed' : routing.routing_status || 'Not set'}
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
                                          <strong>Start Time:</strong> {routing.start_datetime ? format(parseISO(routing.start_datetime), 'MMM dd, h:mm a') : 'Not set'}
                                        </Typography>
                                        <Typography variant="caption" display="block" sx={{ color: 'success.main' }}>
                                          <strong>Duration:</strong> {routing.duration_minutes ? `${Math.round(routing.duration_minutes / 60 * 100) / 100}h` : 'Not set'}
                                        </Typography>
                                      </>
                                    )}
                                    {isCurrentOutsourcing && routing.vendor_name && (
                                      <Typography variant="caption" display="block" sx={{ color: 'warning.main', fontWeight: 'bold' }}>
                                        <strong>Vendor:</strong> {routing.vendor_name} • {routing.vendor_lead_days || 0} days lead time
                                      </Typography>
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
                          );
                        })}
                    </List>
                  </Grid>
                )}

                {/* Prerequisites Check */}
                <Grid item xs={12}>
                  <Typography variant="subtitle1" gutterBottom sx={{ mt: 2 }}>
                    Outsourcing Status
                  </Typography>
                  {selectedJob.previous_ops_scheduled ? (
                    <Alert severity="success">
                      <Typography variant="body2">
                        ✓ All prerequisite operations are scheduled. This operation is ready for outsourcing.
                      </Typography>
                    </Alert>
                  ) : (
                    <Alert severity="warning">
                      <Typography variant="body2">
                        ⚠ Some prerequisite operations are not yet scheduled. Complete earlier operations before sending out for outsourcing.
                      </Typography>
                    </Alert>
                  )}
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

export default OutsourcingTile;