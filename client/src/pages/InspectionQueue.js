import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Grid,
  Card,
  CardContent,
  CircularProgress,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Tooltip,
  IconButton,
  Divider
} from '@mui/material';
import {
  Visibility as ViewIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  PlayArrow as StartIcon,
  Pause as HoldIcon,
  Schedule as ScheduleIcon,
  TrendingUp as TrendingUpIcon,
  Assessment as AssessmentIcon,
  Edit as EditIcon,
  Refresh as RefreshIcon
} from '@mui/icons-material';
import { format } from 'date-fns';
import apiService from '../services/apiService';

function InspectionQueue() {
  const [queue, setQueue] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [inspectorNotes, setInspectorNotes] = useState('');
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const fetchQueue = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch queue data
      const queueParams = statusFilter !== 'all' ? { status: statusFilter } : {};
      const queueResponse = await apiService.get('/api/inspection/queue', { params: queueParams });
      
      if (queueResponse.data.success) {
        setQueue(queueResponse.data.queue);
      } else {
        throw new Error(queueResponse.data.error || 'Failed to fetch inspection queue');
      }

      // Fetch analytics
      const analyticsResponse = await apiService.get('/api/inspection/analytics');
      if (analyticsResponse.data.success) {
        setAnalytics(analyticsResponse.data.analytics);
      }

    } catch (err) {
      console.error('Error fetching inspection queue:', err);
      setError(err.response?.data?.error || err.message || 'Failed to load inspection queue');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQueue();
  }, [statusFilter]);

  const handleViewDetails = (item) => {
    setSelectedItem(item);
    setInspectorNotes(item.inspector_notes || '');
    setDetailsOpen(true);
  };

  const handleStatusUpdate = async (itemId, newStatus) => {
    try {
      setUpdatingStatus(true);
      
      const response = await apiService.put(`/api/inspection/queue/${itemId}`, {
        status: newStatus,
        inspector_notes: inspectorNotes
      });

      if (response.data.success) {
        // Refresh the queue
        await fetchQueue();
        setDetailsOpen(false);
        setSelectedItem(null);
      } else {
        throw new Error(response.data.error || 'Failed to update status');
      }
    } catch (err) {
      console.error('Error updating status:', err);
      setError(err.response?.data?.error || err.message || 'Failed to update status');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'awaiting': return 'warning';
      case 'in_progress': return 'info';
      case 'completed': return 'success';
      case 'hold': return 'error';
      default: return 'default';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'awaiting': return <ScheduleIcon />;
      case 'in_progress': return <StartIcon />;
      case 'completed': return <CheckCircleIcon />;
      case 'hold': return <HoldIcon />;
      default: return <ErrorIcon />;
    }
  };

  const getPriorityColor = (priority) => {
    const priorityNum = parseFloat(priority);
    if (priorityNum >= 1000) return 'error';
    if (priorityNum >= 500) return 'warning';
    return 'success';
  };

  if (loading && queue.length === 0) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4" component="h1">
          Inspection Queue
        </Typography>
        <Button
          variant="outlined"
          startIcon={<RefreshIcon />}
          onClick={fetchQueue}
          disabled={loading}
        >
          Refresh
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {/* Analytics Cards */}
      {analytics && (
        <Grid container spacing={3} sx={{ mb: 3 }}>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Box display="flex" alignItems="center" justifyContent="space-between">
                  <Box>
                    <Typography color="textSecondary" gutterBottom variant="body2">
                      Total Items
                    </Typography>
                    <Typography variant="h5">
                      {analytics.summary.total_items || 0}
                    </Typography>
                  </Box>
                  <AssessmentIcon color="primary" />
                </Box>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Box display="flex" alignItems="center" justifyContent="space-between">
                  <Box>
                    <Typography color="textSecondary" gutterBottom variant="body2">
                      Awaiting
                    </Typography>
                    <Typography variant="h5" color="warning.main">
                      {analytics.summary.awaiting_count || 0}
                    </Typography>
                  </Box>
                  <ScheduleIcon color="warning" />
                </Box>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Box display="flex" alignItems="center" justifyContent="space-between">
                  <Box>
                    <Typography color="textSecondary" gutterBottom variant="body2">
                      In Progress
                    </Typography>
                    <Typography variant="h5" color="info.main">
                      {analytics.summary.in_progress_count || 0}
                    </Typography>
                  </Box>
                  <StartIcon color="info" />
                </Box>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Box display="flex" alignItems="center" justifyContent="space-between">
                  <Box>
                    <Typography color="textSecondary" gutterBottom variant="body2">
                      Completed
                    </Typography>
                    <Typography variant="h5" color="success.main">
                      {analytics.summary.completed_count || 0}
                    </Typography>
                  </Box>
                  <CheckCircleIcon color="success" />
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* Filters */}
      <Box sx={{ mb: 3 }}>
        <FormControl sx={{ minWidth: 200 }}>
          <InputLabel>Filter by Status</InputLabel>
          <Select
            value={statusFilter}
            label="Filter by Status"
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <MenuItem value="all">All Items</MenuItem>
            <MenuItem value="awaiting">Awaiting</MenuItem>
            <MenuItem value="in_progress">In Progress</MenuItem>
            <MenuItem value="completed">Completed</MenuItem>
            <MenuItem value="hold">On Hold</MenuItem>
          </Select>
        </FormControl>
      </Box>

      {/* Queue Table */}
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell><strong>Job Number</strong></TableCell>
              <TableCell><strong>Operation</strong></TableCell>
              <TableCell><strong>Customer</strong></TableCell>
              <TableCell><strong>Priority</strong></TableCell>
              <TableCell><strong>Status</strong></TableCell>
              <TableCell><strong>Time in Queue</strong></TableCell>
              <TableCell><strong>Entered Queue</strong></TableCell>
              <TableCell><strong>Next Operation</strong></TableCell>
              <TableCell><strong>Actions</strong></TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {queue.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} align="center">
                  <Typography variant="body2" color="textSecondary">
                    No items in inspection queue for selected filter
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              queue.map((item) => (
                <TableRow key={item.id} hover>
                  <TableCell>
                    <Typography variant="body2" fontWeight="bold">
                      {item.job_number}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">
                      Op {item.operation_number}: {item.operation_name}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">
                      {item.customer_name}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={parseFloat(item.priority_score || 0).toFixed(0)}
                      color={getPriorityColor(item.priority_score)}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>
                    <Chip
                      icon={getStatusIcon(item.status)}
                      label={item.status}
                      color={getStatusColor(item.status)}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">
                      {parseFloat(item.hours_in_queue || 0).toFixed(1)}h
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">
                      {format(new Date(item.entered_queue_at), 'MMM dd, HH:mm')}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color="textSecondary">
                      {item.next_operation || 'None'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Tooltip title="View Details & Update Status">
                      <IconButton
                        size="small"
                        onClick={() => handleViewDetails(item)}
                        color="primary"
                      >
                        <EditIcon />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Details Dialog */}
      <Dialog
        open={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          Inspection Details: {selectedItem?.job_number} Op {selectedItem?.operation_number}
        </DialogTitle>
        <DialogContent>
          {selectedItem && (
            <Box>
              <Grid container spacing={2} sx={{ mb: 3 }}>
                <Grid item xs={6}>
                  <Typography variant="subtitle2" color="textSecondary">
                    Customer
                  </Typography>
                  <Typography variant="body1">
                    {selectedItem.customer_name}
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="subtitle2" color="textSecondary">
                    Priority Score
                  </Typography>
                  <Typography variant="body1">
                    {parseFloat(selectedItem.priority_score || 0).toFixed(0)}
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="subtitle2" color="textSecondary">
                    Current Status
                  </Typography>
                  <Chip
                    icon={getStatusIcon(selectedItem.status)}
                    label={selectedItem.status}
                    color={getStatusColor(selectedItem.status)}
                    size="small"
                  />
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="subtitle2" color="textSecondary">
                    Time in Queue
                  </Typography>
                  <Typography variant="body1">
                    {parseFloat(selectedItem.hours_in_queue || 0).toFixed(1)} hours
                  </Typography>
                </Grid>
                <Grid item xs={12}>
                  <Typography variant="subtitle2" color="textSecondary">
                    Next Operation
                  </Typography>
                  <Typography variant="body1">
                    {selectedItem.next_operation || 'None (Final operation)'}
                  </Typography>
                </Grid>
              </Grid>

              <Divider sx={{ my: 2 }} />

              <TextField
                label="Inspector Notes"
                multiline
                rows={4}
                fullWidth
                value={inspectorNotes}
                onChange={(e) => setInspectorNotes(e.target.value)}
                placeholder="Add inspection notes, findings, or updates..."
                sx={{ mb: 2 }}
              />

              <Typography variant="subtitle2" gutterBottom>
                Update Status:
              </Typography>
              <Box display="flex" gap={1} flexWrap="wrap">
                {selectedItem.status !== 'in_progress' && (
                  <Button
                    variant="outlined"
                    color="info"
                    startIcon={<StartIcon />}
                    onClick={() => handleStatusUpdate(selectedItem.id, 'in_progress')}
                    disabled={updatingStatus}
                    size="small"
                  >
                    Start Inspection
                  </Button>
                )}
                {selectedItem.status !== 'completed' && (
                  <Button
                    variant="outlined"
                    color="success"
                    startIcon={<CheckCircleIcon />}
                    onClick={() => handleStatusUpdate(selectedItem.id, 'completed')}
                    disabled={updatingStatus}
                    size="small"
                  >
                    Mark Complete
                  </Button>
                )}
                {selectedItem.status !== 'hold' && (
                  <Button
                    variant="outlined"
                    color="error"
                    startIcon={<HoldIcon />}
                    onClick={() => handleStatusUpdate(selectedItem.id, 'hold')}
                    disabled={updatingStatus}
                    size="small"
                  >
                    Put on Hold
                  </Button>
                )}
                {selectedItem.status !== 'awaiting' && (
                  <Button
                    variant="outlined"
                    color="warning"
                    startIcon={<ScheduleIcon />}
                    onClick={() => handleStatusUpdate(selectedItem.id, 'awaiting')}
                    disabled={updatingStatus}
                    size="small"
                  >
                    Return to Queue
                  </Button>
                )}
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDetailsOpen(false)}>
            Cancel
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default InspectionQueue;