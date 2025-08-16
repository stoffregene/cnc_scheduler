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
  Pagination,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Tooltip,
  IconButton
} from '@mui/material';
import {
  Visibility as ViewIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  SwapHoriz as SwapIcon,
  Schedule as ScheduleIcon,
  TrendingUp as TrendingUpIcon,
  Assessment as AssessmentIcon,
  Undo as UndoIcon,
  Clear as ClearIcon
} from '@mui/icons-material';
import { format } from 'date-fns';
import apiService from '../services/apiService';

function DisplacementLogs() {
  const [logs, setLogs] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedLog, setSelectedLog] = useState(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [details, setDetails] = useState([]);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [undoOperations, setUndoOperations] = useState([]);
  const [undoLoading, setUndoLoading] = useState(false);
  
  // Pagination and filtering
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [successOnly, setSuccessOnly] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  useEffect(() => {
    fetchLogs();
    fetchAnalytics();
    fetchUndoOperations();
  }, [page, successOnly, fromDate, toDate]);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const params = {
        limit,
        offset: (page - 1) * limit
      };
      
      if (successOnly !== 'all') {
        params.successOnly = successOnly === 'success';
      }
      
      if (fromDate) params.fromDate = fromDate;
      if (toDate) params.toDate = toDate;

      const response = await apiService.get('/api/displacement/history', params);
      setLogs(response.data.history || []);
      setError(null);
    } catch (err) {
      console.error('Error fetching displacement logs:', err);
      setError('Failed to load displacement logs');
    } finally {
      setLoading(false);
    }
  };

  const fetchAnalytics = async () => {
    try {
      const params = {};
      if (fromDate) params.fromDate = fromDate;
      if (toDate) params.toDate = toDate;

      const response = await apiService.get('/api/displacement/analytics', params);
      setAnalytics(response.data.analytics);
    } catch (err) {
      console.error('Error fetching analytics:', err);
    }
  };

  const fetchUndoOperations = async () => {
    try {
      const response = await apiService.get('/api/undo/operations', { type: 'displacement' });
      setUndoOperations(response.data.operations || []);
    } catch (err) {
      console.error('Error fetching undo operations:', err);
    }
  };

  const handleUndo = async (undoOperationId) => {
    if (!window.confirm('Are you sure you want to undo this displacement? This will restore the previous schedule state.')) {
      return;
    }

    try {
      setUndoLoading(true);
      const response = await apiService.post(`/api/undo/execute/${undoOperationId}`);
      
      if (response.data.success) {
        alert(`Successfully undid displacement: ${response.data.message}`);
        // Refresh data
        await fetchLogs();
        await fetchAnalytics();
        await fetchUndoOperations();
      } else {
        alert(`Failed to undo displacement: ${response.data.error}`);
      }
    } catch (err) {
      console.error('Error executing undo:', err);
      alert('Failed to execute undo operation');
    } finally {
      setUndoLoading(false);
    }
  };

  const handleClearLogs = async () => {
    if (!window.confirm('Are you sure you want to clear all displacement logs? This action cannot be undone.')) {
      return;
    }

    try {
      setLoading(true);
      // Clear logs by calling a delete endpoint (we'll need to create this)
      const response = await apiService.delete('/api/displacement/clear-logs');
      
      if (response.data.success) {
        alert('Displacement logs cleared successfully');
        // Refresh data
        await fetchLogs();
        await fetchAnalytics();
        await fetchUndoOperations();
      } else {
        alert(`Failed to clear logs: ${response.data.error}`);
      }
    } catch (err) {
      console.error('Error clearing logs:', err);
      alert('Failed to clear displacement logs');
    } finally {
      setLoading(false);
    }
  };

  const handleViewDetails = async (log) => {
    setSelectedLog(log);
    setDetailsOpen(true);
    setDetailsLoading(true);

    try {
      const response = await apiService.get(`/api/displacement/details/${log.id}`);
      setDetails(response.data.details || []);
    } catch (err) {
      console.error('Error fetching displacement details:', err);
      setDetails([]);
    } finally {
      setDetailsLoading(false);
    }
  };

  const formatDuration = (ms) => {
    if (!ms) return 'N/A';
    return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
  };

  const formatCustomers = (customers) => {
    if (!customers || customers.length === 0) return 'None';
    if (customers.length <= 2) return customers.join(', ');
    return `${customers.slice(0, 2).join(', ')}, +${customers.length - 2} more`;
  };

  const renderAnalyticsCards = () => {
    if (!analytics) return null;

    const { summary, impact, topAffectedCustomers } = analytics;

    return (
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={3}>
          <Card sx={{ bgcolor: 'linear-gradient(135deg, rgba(0, 212, 255, 0.1) 0%, rgba(0, 212, 255, 0.05) 100%)' }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <SwapIcon sx={{ color: '#00d4ff', mr: 1 }} />
                <Typography variant="h6" sx={{ color: '#00d4ff' }}>
                  Total Displacements
                </Typography>
              </Box>
              <Typography variant="h4" sx={{ color: '#e4e6eb' }}>
                {summary?.total_displacements || 0}
              </Typography>
              <Typography variant="body2" sx={{ color: '#9ca3af' }}>
                Success rate: {Math.round((summary?.successful_displacements || 0) / (summary?.total_displacements || 1) * 100)}%
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={3}>
          <Card sx={{ bgcolor: 'linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(16, 185, 129, 0.05) 100%)' }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <ScheduleIcon sx={{ color: '#10b981', mr: 1 }} />
                <Typography variant="h6" sx={{ color: '#10b981' }}>
                  Jobs Displaced
                </Typography>
              </Box>
              <Typography variant="h4" sx={{ color: '#e4e6eb' }}>
                {summary?.total_jobs_displaced || 0}
              </Typography>
              <Typography variant="body2" sx={{ color: '#9ca3af' }}>
                Avg per displacement: {parseFloat(summary?.avg_jobs_displaced || 0).toFixed(1)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={3}>
          <Card sx={{ bgcolor: 'linear-gradient(135deg, rgba(245, 158, 11, 0.1) 0%, rgba(245, 158, 11, 0.05) 100%)' }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <TrendingUpIcon sx={{ color: '#f59e0b', mr: 1 }} />
                <Typography variant="h6" sx={{ color: '#f59e0b' }}>
                  Avg Delay
                </Typography>
              </Box>
              <Typography variant="h4" sx={{ color: '#e4e6eb' }}>
                {parseFloat(impact?.avg_delay_days || 0).toFixed(1)}
              </Typography>
              <Typography variant="body2" sx={{ color: '#9ca3af' }}>
                days per displaced job
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={3}>
          <Card sx={{ bgcolor: 'linear-gradient(135deg, rgba(139, 92, 246, 0.1) 0%, rgba(139, 92, 246, 0.05) 100%)' }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <AssessmentIcon sx={{ color: '#8b5cf6', mr: 1 }} />
                <Typography variant="h6" sx={{ color: '#8b5cf6' }}>
                  Avg Execution
                </Typography>
              </Box>
              <Typography variant="h4" sx={{ color: '#e4e6eb' }}>
                {formatDuration(summary?.avg_execution_time)}
              </Typography>
              <Typography variant="body2" sx={{ color: '#9ca3af' }}>
                processing time
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    );
  };

  if (loading && logs.length === 0) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" sx={{ color: '#e4e6eb', fontWeight: 600 }}>
          Displacement Logs
        </Typography>
        <Box sx={{ display: 'flex', gap: 2 }}>
          {undoOperations.length > 0 && (
            <Button
              variant="contained"
              startIcon={<UndoIcon />}
              onClick={() => handleUndo(undoOperations[0].id)}
              disabled={undoLoading}
              sx={{
                bgcolor: '#10b981',
                color: '#ffffff',
                '&:hover': { bgcolor: '#059669' },
                '&:disabled': { bgcolor: '#374151' }
              }}
            >
              {undoLoading ? 'Undoing...' : `Undo Latest (${undoOperations.length})`}
            </Button>
          )}
          <Button
            variant="contained"
            startIcon={<ClearIcon />}
            onClick={handleClearLogs}
            disabled={loading}
            sx={{
              bgcolor: '#ef4444',
              color: '#ffffff',
              '&:hover': { bgcolor: '#dc2626' },
              '&:disabled': { bgcolor: '#374151' }
            }}
          >
            Clear Logs
          </Button>
        </Box>
      </Box>

      {renderAnalyticsCards()}

      {/* Filters */}
      <Paper sx={{ p: 3, mb: 3, bgcolor: '#1e2328', borderRadius: 2 }}>
        <Typography variant="h6" sx={{ mb: 2, color: '#e4e6eb' }}>
          Filters
        </Typography>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} md={3}>
            <FormControl fullWidth size="small">
              <InputLabel sx={{ color: '#9ca3af' }}>Status</InputLabel>
              <Select
                value={successOnly}
                onChange={(e) => setSuccessOnly(e.target.value)}
                label="Status"
                sx={{ color: '#e4e6eb' }}
              >
                <MenuItem value="all">All</MenuItem>
                <MenuItem value="success">Success Only</MenuItem>
                <MenuItem value="failed">Failed Only</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} md={3}>
            <TextField
              fullWidth
              size="small"
              label="From Date"
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              InputLabelProps={{ shrink: true, sx: { color: '#9ca3af' } }}
              sx={{ '& .MuiInputBase-input': { color: '#e4e6eb' } }}
            />
          </Grid>
          <Grid item xs={12} md={3}>
            <TextField
              fullWidth
              size="small"
              label="To Date"
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              InputLabelProps={{ shrink: true, sx: { color: '#9ca3af' } }}
              sx={{ '& .MuiInputBase-input': { color: '#e4e6eb' } }}
            />
          </Grid>
          <Grid item xs={12} md={3}>
            <Button
              variant="contained"
              onClick={fetchLogs}
              sx={{
                bgcolor: '#00d4ff',
                color: '#0a0e1a',
                '&:hover': { bgcolor: '#00a3cc' }
              }}
            >
              Apply Filters
            </Button>
          </Grid>
        </Grid>
      </Paper>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {/* Logs Table */}
      <Paper sx={{ bgcolor: '#1e2328', borderRadius: 2 }}>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow sx={{ '& .MuiTableCell-head': { bgcolor: '#262b32', color: '#e4e6eb', fontWeight: 600 } }}>
                <TableCell>Status</TableCell>
                <TableCell>Trigger Job</TableCell>
                <TableCell>Customer</TableCell>
                <TableCell>Timestamp</TableCell>
                <TableCell>Jobs Displaced</TableCell>
                <TableCell>Jobs Rescheduled</TableCell>
                <TableCell>Execution Time</TableCell>
                <TableCell>Customers Affected</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {logs.map((log) => (
                <TableRow 
                  key={log.id} 
                  sx={{ 
                    '& .MuiTableCell-body': { color: '#e4e6eb', borderColor: '#374151' },
                    '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.02)' }
                  }}
                >
                  <TableCell>
                    <Chip
                      icon={log.success ? <CheckCircleIcon /> : <ErrorIcon />}
                      label={log.success ? 'Success' : 'Failed'}
                      size="small"
                      sx={{
                        bgcolor: log.success ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                        color: log.success ? '#10b981' : '#ef4444',
                        border: `1px solid ${log.success ? '#10b981' : '#ef4444'}`
                      }}
                    />
                  </TableCell>
                  <TableCell>
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>
                        {log.trigger_job_number}
                      </Typography>
                      {log.trigger_priority && (
                        <Typography variant="caption" sx={{ color: '#9ca3af' }}>
                          Priority: {log.trigger_priority}
                        </Typography>
                      )}
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">
                      {log.trigger_customer || 'N/A'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">
                      {format(new Date(log.timestamp), 'MMM dd, yyyy HH:mm')}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
                      {log.total_displaced || 0}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
                      {log.total_rescheduled || 0}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">
                      {formatDuration(log.execution_time_ms)}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Tooltip title={log.customers_affected?.join(', ') || 'None'}>
                      <Typography variant="body2" sx={{ maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {formatCustomers(log.customers_affected)}
                      </Typography>
                    </Tooltip>
                  </TableCell>
                  <TableCell>
                    <IconButton
                      size="small"
                      onClick={() => handleViewDetails(log)}
                      sx={{ color: '#00d4ff' }}
                    >
                      <ViewIcon />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>

        {logs.length === 0 && !loading && (
          <Box sx={{ p: 4, textAlign: 'center' }}>
            <Typography variant="h6" sx={{ color: '#9ca3af', mb: 2 }}>
              No displacement logs found
            </Typography>
            <Typography variant="body2" sx={{ color: '#6b7280' }}>
              Displacement logs will appear here when jobs are scheduled using displacement.
            </Typography>
          </Box>
        )}

        {logs.length > 0 && (
          <Box sx={{ p: 2, display: 'flex', justifyContent: 'center' }}>
            <Pagination
              count={Math.ceil(logs.length / limit) || 1}
              page={page}
              onChange={(e, newPage) => setPage(newPage)}
              sx={{
                '& .MuiPaginationItem-root': { color: '#e4e6eb' },
                '& .Mui-selected': { bgcolor: '#00d4ff', color: '#0a0e1a' }
              }}
            />
          </Box>
        )}
      </Paper>

      {/* Details Dialog */}
      <Dialog
        open={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        maxWidth="lg"
        fullWidth
        PaperProps={{
          sx: {
            bgcolor: '#1e2328',
            color: '#e4e6eb'
          }
        }}
      >
        <DialogTitle>
          <Typography variant="h6">
            Displacement Details: {selectedLog?.trigger_job_number}
          </Typography>
          <Typography variant="body2" sx={{ color: '#9ca3af', mb: 1 }}>
            {selectedLog && format(new Date(selectedLog.timestamp), 'MMMM dd, yyyy - HH:mm:ss')}
          </Typography>
          {selectedLog && (
            <Box>
              <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 2 }}>
                <Chip
                  label={`${selectedLog.total_displaced} Jobs Displaced`}
                  size="small"
                  sx={{ bgcolor: 'rgba(245, 158, 11, 0.2)', color: '#f59e0b' }}
                />
                <Chip
                  label={`${selectedLog.total_rescheduled} Jobs Rescheduled`}
                  size="small"
                  sx={{ bgcolor: 'rgba(16, 185, 129, 0.2)', color: '#10b981' }}
                />
                <Chip
                  label={`${selectedLog.execution_time_ms}ms Execution`}
                  size="small"
                  sx={{ bgcolor: 'rgba(139, 92, 246, 0.2)', color: '#8b5cf6' }}
                />
              </Box>
              <Box sx={{ p: 2, bgcolor: '#1e2328', borderRadius: 1, border: '1px solid #00d4ff' }}>
                <Typography variant="subtitle2" sx={{ color: '#00d4ff', mb: 1, fontWeight: 600 }}>
                  🎯 DISPLACEMENT TRIGGER
                </Typography>
                <Typography variant="body2" sx={{ color: '#e4e6eb' }}>
                  High priority job <strong>{selectedLog.trigger_job_number}</strong> from {selectedLog.trigger_customer} 
                  needed scheduling space. The system automatically displaced lower priority jobs to accommodate this request.
                </Typography>
                {selectedLog.notes && (
                  <Typography variant="body2" sx={{ color: '#9ca3af', mt: 1, fontStyle: 'italic' }}>
                    {selectedLog.notes}
                  </Typography>
                )}
              </Box>
            </Box>
          )}
        </DialogTitle>
        <DialogContent>
          {detailsLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
              <CircularProgress />
            </Box>
          ) : (
            <Box>
              {details.length > 0 ? (
                details.map((detail, index) => (
                  <Box key={index} sx={{ mb: 3, p: 3, bgcolor: '#262b32', borderRadius: 2, border: '1px solid #374151' }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                      <Typography variant="h6" sx={{ color: '#e4e6eb', fontWeight: 600 }}>
                        Job {detail.displaced_job_number}
                      </Typography>
                      <Chip
                        label={detail.reschedule_status}
                        size="small"
                        sx={{
                          bgcolor: detail.reschedule_status === 'rescheduled' 
                            ? 'rgba(16, 185, 129, 0.2)' 
                            : 'rgba(245, 158, 11, 0.2)',
                          color: detail.reschedule_status === 'rescheduled' 
                            ? '#10b981' 
                            : '#f59e0b',
                          fontWeight: 600
                        }}
                      />
                    </Box>
                    
                    <Grid container spacing={3}>
                      <Grid item xs={12} md={6}>
                        <Typography variant="subtitle2" sx={{ color: '#9ca3af', mb: 1 }}>
                          📍 WHERE IT CAME FROM
                        </Typography>
                        <Box sx={{ bgcolor: '#1e2328', p: 2, borderRadius: 1, border: '1px solid #ef4444' }}>
                          <Typography variant="body2" sx={{ color: '#e4e6eb', fontWeight: 500, mb: 1 }}>
                            Machine: {detail.machine_name}
                          </Typography>
                          <Typography variant="body2" sx={{ color: '#e4e6eb', mb: 1 }}>
                            Original Time: {format(new Date(detail.original_start_time), 'MMM dd, yyyy HH:mm')} 
                            {detail.original_end_time && ` - ${format(new Date(detail.original_end_time), 'HH:mm')}`}
                          </Typography>
                          <Typography variant="body2" sx={{ color: '#e4e6eb', mb: 1 }}>
                            Customer: {detail.displaced_customer || 'N/A'}
                          </Typography>
                          <Typography variant="body2" sx={{ color: '#ef4444', fontWeight: 500 }}>
                            Hours Freed: {detail.hours_freed ? parseFloat(detail.hours_freed).toFixed(1) : '0.0'}h
                          </Typography>
                        </Box>
                      </Grid>
                      
                      <Grid item xs={12} md={6}>
                        <Typography variant="subtitle2" sx={{ color: '#9ca3af', mb: 1 }}>
                          📍 WHERE IT WENT
                        </Typography>
                        <Box sx={{ bgcolor: '#1e2328', p: 2, borderRadius: 1, border: '1px solid #10b981' }}>
                          {detail.new_start_time ? (
                            <>
                              <Typography variant="body2" sx={{ color: '#e4e6eb', fontWeight: 500, mb: 1 }}>
                                New Schedule: {format(new Date(detail.new_start_time), 'MMM dd, yyyy HH:mm')}
                                {detail.new_end_time && ` - ${format(new Date(detail.new_end_time), 'HH:mm')}`}
                              </Typography>
                              <Typography variant="body2" sx={{ color: '#f59e0b', fontWeight: 500, mb: 1 }}>
                                Delay: +{detail.reschedule_delay_hours ? parseFloat(detail.reschedule_delay_hours).toFixed(1) : '0.0'}h
                              </Typography>
                              <Typography variant="body2" sx={{ color: '#10b981' }}>
                                Status: Successfully rescheduled
                              </Typography>
                            </>
                          ) : (
                            <Typography variant="body2" sx={{ color: '#9ca3af' }}>
                              Not yet rescheduled
                            </Typography>
                          )}
                        </Box>
                      </Grid>
                    </Grid>
                    
                    <Box sx={{ mt: 2, p: 2, bgcolor: '#1e2328', borderRadius: 1 }}>
                      <Typography variant="subtitle2" sx={{ color: '#9ca3af', mb: 1 }}>
                        💡 DISPLACEMENT REASON
                      </Typography>
                      <Typography variant="body2" sx={{ color: '#e4e6eb', fontStyle: 'italic' }}>
                        {detail.displacement_reason}
                      </Typography>
                    </Box>
                  </Box>
                ))
              ) : (
                <Typography variant="body2" sx={{ color: '#9ca3af', textAlign: 'center', py: 4 }}>
                  No displacement details available
                </Typography>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDetailsOpen(false)} sx={{ color: '#00d4ff' }}>
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default DisplacementLogs;