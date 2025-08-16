import React, { useState, useEffect } from 'react';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  IconButton,
  Tooltip,
  LinearProgress,
  Avatar,
  Divider,
  Alert,
  List,
  ListItem,
  ListItemText,
  Link,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  DeleteSweep as DeleteSweepIcon,
  Upload as UploadIcon,
  Assessment as AssessmentIcon,
  Search as SearchIcon,
  Visibility as VisibilityIcon,
  Build as BuildIcon,
  Group as GroupIcon,
  Lock as LockIcon,
} from '@mui/icons-material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { format, parseISO, isPast, isToday, isTomorrow } from 'date-fns';
import { useDropzone } from 'react-dropzone';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';

import { apiService } from '../services/apiService';
import Logo from '../components/Logo';
import RoutingSelector from '../components/RoutingSelector';
import AssemblyManager from '../components/AssemblyManager';

const JobManagement = () => {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState([]);
  const [machines, setMachines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [deleteAllDialogOpen, setDeleteAllDialogOpen] = useState(false);
  const [assemblyManagerOpen, setAssemblyManagerOpen] = useState(false);
  const [selectedJob, setSelectedJob] = useState(null);
  const [editingJob, setEditingJob] = useState(null);
  const [jobRoutings, setJobRoutings] = useState([]);
  const [filters, setFilters] = useState({
    status: '',
    priority: '',
    customer: '',
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [formData, setFormData] = useState({
    job_number: '',
    customer_name: '',
    part_name: '',
    part_number: '',
    quantity: '',
    priority: 5,
    estimated_hours: '',
    due_date: null,
    material: '',
    material_size: '',
    operations: [],
    routings: [],
    special_instructions: '',
  });

  const statuses = ['pending', 'scheduled', 'in_progress', 'completed', 'cancelled'];
  const priorities = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const operations = [
    'Milling', 'Turning', 'Drilling', 'Tapping', 'Threading', 'Boring', 'Reaming',
    'Grinding', 'EDM', 'Laser Cutting', 'Water Jet', 'Plasma Cutting', 'Welding'
  ];

  useEffect(() => {
    fetchJobs();
    fetchMachines();
  }, []);

  const fetchJobs = async () => {
    try {
      setLoading(true);
      const response = await apiService.jobs.getAll();
      setJobs(response.data);
    } catch (error) {
      console.error('Error fetching jobs:', error);
      toast.error('Failed to load jobs');
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

  const handleOpenDialog = (job = null) => {
    if (job) {
      setEditingJob(job);
      setFormData({
        ...job,
        due_date: job.due_date ? parseISO(job.due_date) : null,
        operations: job.operations || [],
        routings: job.routings || [],
      });
    } else {
      setEditingJob(null);
      setFormData({
        job_number: '',
        customer_name: '',
        part_name: '',
        part_number: '',
        quantity: '',
        priority: 5,
        estimated_hours: '',
        due_date: null,
        material: '',
        material_size: '',
        operations: [],
        routings: [],
        special_instructions: '',
      });
    }
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    try {
      if (editingJob) {
        await apiService.jobs.update(editingJob.id, formData);
        toast.success('Job updated successfully');
      } else {
        await apiService.jobs.create(formData);
        toast.success('Job created successfully');
        
        // Auto-detect assembly relationships after creating new job
        try {
          const allJobNumbers = [...jobs.map(job => job.job_number), formData.job_number];
          const detectResponse = await apiService.post('/api/assembly/detect-relationships', {
            job_numbers: allJobNumbers
          });
          
          if (detectResponse.data.detected > 0) {
            toast.success(`Auto-detected assembly relationship for ${formData.job_number}`, {
              duration: 4000
            });
          }
        } catch (detectError) {
          console.warn('Auto-detection failed:', detectError);
          // Don't show error to user, just log it
        }
      }
      setDialogOpen(false);
      fetchJobs();
    } catch (error) {
      console.error('Error saving job:', error);
      toast.error('Failed to save job');
    }
  };

  const handleLockJob = async (jobId, lock = true) => {
    try {
      const endpoint = lock ? `/api/locks/job/${jobId}/lock` : `/api/locks/job/${jobId}/unlock`;
      const response = await apiService.post(endpoint, {
        reason: lock ? 'Manual lock - Protected from changes' : undefined
      });
      
      if (response.data.success) {
        toast.success(lock ? 'Job locked successfully' : 'Job unlocked successfully');
        fetchJobs(); // Refresh data
        setSelectedJob(null);
      }
    } catch (error) {
      console.error('Error toggling lock:', error);
      toast.error(error.response?.data?.error || `Failed to ${lock ? 'lock' : 'unlock'} job`);
    }
  };

  const handleDelete = async (job) => {
    if (window.confirm(`Are you sure you want to delete job ${job.job_number}?`)) {
      try {
        await apiService.jobs.delete(job.id);
        toast.success('Job deleted successfully');
        fetchJobs();
      } catch (error) {
        console.error('Error deleting job:', error);
        toast.error('Failed to delete job');
      }
    }
  };

  const handleFileUpload = async (acceptedFiles) => {
    if (acceptedFiles.length === 0) return;

    const file = acceptedFiles[0];
    try {
      const response = await apiService.jobs.importCSV(file);
      toast.success(response.data.message);
      setImportDialogOpen(false);
      fetchJobs();
    } catch (error) {
      console.error('Error importing CSV:', error);
      toast.error('Failed to import CSV file');
    }
  };

  const handleDeleteAll = async () => {
    try {
      const response = await apiService.jobs.deleteAll();
      toast.success(`${response.data.message}`);
      setDeleteAllDialogOpen(false);
      fetchJobs(); // Refresh the jobs list (should be empty now)
    } catch (error) {
      console.error('Error deleting all jobs:', error);
      toast.error('Failed to delete all jobs');
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: handleFileUpload,
    accept: {
      'text/csv': ['.csv'],
    },
    multiple: false,
  });

  const getStatusColor = (status) => {
    switch (status) {
      case 'pending':
        return 'warning';
      case 'scheduled':
        return 'info';
      case 'in_progress':
        return 'primary';
      case 'completed':
        return 'success';
      case 'cancelled':
        return 'error';
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

  const getDueDateStatus = (dueDate) => {
    if (!dueDate) return { color: 'default', text: 'No due date' };
    
    const date = parseISO(dueDate);
    if (isPast(date)) return { color: 'error', text: 'Overdue' };
    if (isToday(date)) return { color: 'warning', text: 'Due today' };
    if (isTomorrow(date)) return { color: 'info', text: 'Due tomorrow' };
    return { color: 'success', text: format(date, 'MMM dd') };
  };

  const getMachineName = (machineId) => {
    const machine = machines.find(m => m.id === machineId);
    return machine ? machine.name : `Machine ${machineId}`;
  };

  const getGroupName = (groupId) => {
    // This would need to be populated from the machine groups data
    // For now, return a placeholder
    return `Group ${groupId}`;
  };

  const handleJobClick = async (job) => {
    setSelectedJob(job);
    
    // Fetch job routings with scheduling information
    try {
      const response = await apiService.get(`/api/jobs/${job.id}/routings`);
      setJobRoutings(response.data);
    } catch (error) {
      console.error('Error fetching job routings:', error);
      setJobRoutings([]);
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

  const filteredJobs = jobs.filter(job => {
    const matchesStatus = !filters.status || job.status === filters.status;
    const matchesPriority = !filters.priority || job.priority_score >= parseInt(filters.priority);
    const matchesCustomer = !filters.customer || 
      job.customer_name?.toLowerCase().includes(filters.customer.toLowerCase());
    const matchesSearch = !searchTerm || 
      job.job_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      job.part_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      job.customer_name?.toLowerCase().includes(searchTerm.toLowerCase());

    return matchesStatus && matchesPriority && matchesCustomer && matchesSearch;
  });

  const JobCard = ({ job }) => {
    const dueDateStatus = getDueDateStatus(job.due_date);
    
    return (
      <Card className="industrial-card" sx={{ height: '100%' }}>
        <CardContent>
          <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
            <Box display="flex" alignItems="center">
              <Avatar sx={{ mr: 2, bgcolor: '#00d4ff', color: '#0a0e1a' }}>
                {job.job_number?.slice(0, 2)}
              </Avatar>
              <Box>
                <Typography variant="h6" component="div" sx={{ color: '#e4e6eb', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 1 }}>
                  {job.job_number}
                  {job.schedule_locked && (
                    <Tooltip title={`Locked: ${job.lock_reason || 'Started operation'}`}>
                      <LockIcon sx={{ fontSize: '1rem', color: 'warning.main' }} />
                    </Tooltip>
                  )}
                </Typography>
                <Typography variant="body2" sx={{ color: '#9ca3af' }}>
                  {job.part_name}
                </Typography>
              </Box>
            </Box>
            <Box display="flex" flexDirection="column" alignItems="flex-end" gap={1}>
              <Chip
                label={job.priority_score || 0}
                size="small"
                color={getPriorityColor(job.priority_score || 0)}
                sx={{ fontWeight: 'bold' }}
              />
              <Chip
                label={job.status}
                size="small"
                color={getStatusColor(job.status)}
              />
            </Box>
          </Box>

          <Box mb={2}>
            <Typography variant="body2" gutterBottom sx={{ color: '#e4e6eb' }}>
              <strong>Customer:</strong> {job.customer_name}
            </Typography>
            <Typography variant="body2" gutterBottom sx={{ color: '#e4e6eb' }}>
              <strong>Part Number:</strong> {job.part_number}
            </Typography>
            <Typography variant="body2" gutterBottom sx={{ color: '#e4e6eb' }}>
              <strong>Quantity:</strong> {job.quantity}
            </Typography>
            {job.estimated_hours && (
              <Typography variant="body2" gutterBottom sx={{ color: '#e4e6eb' }}>
                <strong>Est. Hours:</strong> {job.estimated_hours}
              </Typography>
            )}
            {job.material && (
              <Typography variant="body2" gutterBottom sx={{ color: '#e4e6eb' }}>
                <strong>Material:</strong> {job.material}
              </Typography>
            )}
          </Box>

          <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
            <Chip
              label={dueDateStatus.text}
              size="small"
              color={dueDateStatus.color}
              variant="outlined"
            />
            <Typography variant="body2" sx={{ color: '#9ca3af' }}>
              {job.scheduled_count || 0} schedules
            </Typography>
          </Box>

          <Divider sx={{ my: 2 }} />

          <Box display="flex" justifyContent="space-between" alignItems="center">
            <Typography variant="body2" sx={{ color: '#9ca3af' }}>
              {job.total_scheduled_hours || 0}h scheduled
            </Typography>
            <Box>
              <Tooltip title="View Details">
                <IconButton size="small" onClick={() => handleJobClick(job)}>
                  <VisibilityIcon />
                </IconButton>
              </Tooltip>
              <Tooltip title="Edit Job">
                <IconButton size="small" onClick={() => handleOpenDialog(job)}>
                  <EditIcon />
                </IconButton>
              </Tooltip>
              <Tooltip title="Delete Job">
                <IconButton size="small" onClick={() => handleDelete(job)}>
                  <DeleteIcon />
                </IconButton>
              </Tooltip>
            </Box>
          </Box>
        </CardContent>
      </Card>
    );
  };

  if (loading) {
    return (
      <Box className="fade-in-up">
        <LinearProgress sx={{ bgcolor: '#1a2030', '& .MuiLinearProgress-bar': { bgcolor: '#00d4ff' } }} />
        <Typography variant="h6" sx={{ mt: 2, color: '#e4e6eb' }}>
          Loading jobs...
        </Typography>
      </Box>
    );
  }

  return (
    <Box className="fade-in-up">
      <Box sx={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: 2, 
        mb: 3,
        pb: 2,
        borderBottom: '1px solid',
        borderColor: 'divider'
      }}>
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="h4" gutterBottom={false} sx={{ color: '#e4e6eb', fontWeight: 700 }}>
            Job Management
          </Typography>
          <Typography variant="subtitle1" sx={{ color: '#9ca3af' }}>
            Manage production jobs and import from JobBoss ERP
          </Typography>
        </Box>
                  <Button
            variant="outlined"
            startIcon={<UploadIcon />}
            onClick={() => setImportDialogOpen(true)}
            sx={{ mr: 2 }}
          >
            Import CSV
          </Button>
          <Button
            variant="outlined"
            color="error"
            startIcon={<DeleteSweepIcon />}
            onClick={() => setDeleteAllDialogOpen(true)}
            sx={{ mr: 2 }}
            disabled={jobs.length === 0}
          >
            Delete All Jobs
          </Button>
          <Button
            variant="outlined"
            startIcon={<BuildIcon />}
            onClick={() => setAssemblyManagerOpen(true)}
            sx={{ mr: 2 }}
          >
            Assembly Manager
          </Button>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => handleOpenDialog()}
          >
            Add Job
          </Button>
        </Box>

      {/* Filters and Search */}
      <Card className="industrial-card" sx={{ mb: 3 }}>
        <CardContent>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} sm={6} md={3}>
              <TextField
                fullWidth
                label="Search Jobs"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                InputProps={{
                  startAdornment: <SearchIcon sx={{ mr: 1, color: '#9ca3af' }} />,
                }}
              />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <FormControl fullWidth>
                <InputLabel>Status</InputLabel>
                <Select
                  value={filters.status}
                  onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                >
                  <MenuItem value="">All Statuses</MenuItem>
                  {statuses.map((status) => (
                    <MenuItem key={status} value={status}>
                      {status.charAt(0).toUpperCase() + status.slice(1).replace('_', ' ')}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <FormControl fullWidth>
                <InputLabel>Priority</InputLabel>
                <Select
                  value={filters.priority}
                  onChange={(e) => setFilters({ ...filters, priority: e.target.value })}
                >
                  <MenuItem value="">All Priorities</MenuItem>
                  {priorities.map((priority) => (
                    <MenuItem key={priority} value={priority}>
                      Priority {priority}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <TextField
                fullWidth
                label="Customer"
                value={filters.customer}
                onChange={(e) => setFilters({ ...filters, customer: e.target.value })}
              />
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Jobs Grid */}
      <Grid container spacing={3}>
        {filteredJobs.map((job) => (
          <Grid item xs={12} sm={6} md={4} lg={3} key={job.id}>
            <JobCard job={job} />
          </Grid>
        ))}
      </Grid>

      {filteredJobs.length === 0 && (
        <Alert severity="info" sx={{ mt: 3 }}>
          No jobs found matching your criteria.
        </Alert>
      )}

      {/* Job Form Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          {editingJob ? 'Edit Job' : 'Add New Job'}
        </DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Job Number"
                value={formData.job_number}
                onChange={(e) => setFormData({ ...formData, job_number: e.target.value })}
                required
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Customer Name"
                value={formData.customer_name}
                onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })}
                required
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Part Name"
                value={formData.part_name}
                onChange={(e) => setFormData({ ...formData, part_name: e.target.value })}
                required
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Part Number"
                value={formData.part_number}
                onChange={(e) => setFormData({ ...formData, part_number: e.target.value })}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Quantity"
                type="number"
                value={formData.quantity}
                onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                required
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Priority</InputLabel>
                <Select
                  value={formData.priority}
                  onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                >
                  {priorities.map((priority) => (
                    <MenuItem key={priority} value={priority}>
                      Priority {priority}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Estimated Hours"
                type="number"
                value={formData.estimated_hours}
                onChange={(e) => setFormData({ ...formData, estimated_hours: e.target.value })}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <DatePicker
                label="Due Date"
                value={formData.due_date}
                onChange={(date) => setFormData({ ...formData, due_date: date })}
                renderInput={(params) => <TextField {...params} fullWidth />}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Material"
                value={formData.material}
                onChange={(e) => setFormData({ ...formData, material: e.target.value })}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Material Size"
                value={formData.material_size}
                onChange={(e) => setFormData({ ...formData, material_size: e.target.value })}
              />
            </Grid>
            <Grid item xs={12}>
              <RoutingSelector
                value={formData.routings}
                onChange={(routings) => setFormData({ ...formData, routings })}
                label="Operations/Routings"
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Special Instructions"
                multiline
                rows={3}
                value={formData.special_instructions}
                onChange={(e) => setFormData({ ...formData, special_instructions: e.target.value })}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleSubmit} variant="contained">
            {editingJob ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* CSV Import Dialog */}
      <Dialog open={importDialogOpen} onClose={() => setImportDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Import Jobs from CSV</DialogTitle>
        <DialogContent>
          <Box
            {...getRootProps()}
            sx={{
              border: '2px dashed',
              borderColor: isDragActive ? 'primary.main' : 'grey.300',
              borderRadius: 2,
              p: 3,
              textAlign: 'center',
              cursor: 'pointer',
              bgcolor: isDragActive ? 'primary.light' : 'grey.50',
              '&:hover': {
                borderColor: 'primary.main',
                bgcolor: 'primary.light',
              },
            }}
          >
            <input {...getInputProps()} />
            <UploadIcon sx={{ fontSize: 48, color: '#9ca3af', mb: 2 }} />
            {isDragActive ? (
              <Typography>Drop the CSV file here...</Typography>
            ) : (
              <Typography>
                Drag and drop a CSV file here, or click to select file
              </Typography>
            )}
            <Typography variant="body2" sx={{ mt: 1, color: '#9ca3af' }}>
              Supported format: CSV files exported from JobBoss
            </Typography>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setImportDialogOpen(false)}>Cancel</Button>
        </DialogActions>
      </Dialog>

      {/* Delete All Jobs Confirmation Dialog */}
      <Dialog open={deleteAllDialogOpen} onClose={() => setDeleteAllDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ color: '#ef4444', display: 'flex', alignItems: 'center', gap: 1 }}>
          <DeleteSweepIcon />
          Delete All Jobs
        </DialogTitle>
        <DialogContent>
          <Typography variant="body1" sx={{ mb: 2 }}>
            Are you sure you want to delete <strong>ALL {jobs.length} jobs</strong> and their related data?
          </Typography>
          <Typography variant="body2" sx={{ mb: 2, color: '#9ca3af' }}>
            This action will permanently delete:
          </Typography>
          <Box component="ul" sx={{ pl: 2, color: '#9ca3af' }}>
            <li>All job records</li>
            <li>All job routings/operations</li>
            <li>All schedule slots</li>
            <li>All scheduling conflicts</li>
            <li>All job dependencies</li>
          </Box>
          <Alert severity="error" sx={{ mt: 2 }}>
            <strong>This action cannot be undone!</strong> Make sure you have a backup of your data if needed.
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteAllDialogOpen(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleDeleteAll} 
            color="error" 
            variant="contained"
            startIcon={<DeleteSweepIcon />}
          >
            Delete All {jobs.length} Jobs
          </Button>
        </DialogActions>
      </Dialog>

      {/* Job Details Dialog */}
      <Dialog 
        open={!!selectedJob} 
        onClose={() => setSelectedJob(null)}
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
                  <Typography variant="subtitle1" gutterBottom sx={{ color: '#e4e6eb', fontWeight: 600 }}>
                    Part Information
                  </Typography>
                  <Typography variant="body2" sx={{ color: '#e4e6eb', mb: 1 }}>
                    <strong>Part Name:</strong> {selectedJob.part_name}
                  </Typography>
                  <Typography variant="body2" sx={{ color: '#e4e6eb', mb: 1 }}>
                    <strong>Part Number:</strong> {selectedJob.part_number}
                  </Typography>
                  <Typography variant="body2" sx={{ color: '#e4e6eb', mb: 1 }}>
                    <strong>Quantity:</strong> {selectedJob.quantity}
                  </Typography>
                  <Typography variant="body2" sx={{ color: '#e4e6eb', mb: 1 }}>
                    <strong>Material:</strong> {selectedJob.material}
                  </Typography>
                  <Typography variant="body2" sx={{ color: '#e4e6eb', mb: 1 }}>
                    <strong>Material Size:</strong> {selectedJob.material_size}
                  </Typography>
                </Grid>
                <Grid item xs={12} md={6}>
                  <Typography variant="subtitle1" gutterBottom sx={{ color: '#e4e6eb', fontWeight: 600 }}>
                    Job Details
                  </Typography>
                  <Typography variant="body2" sx={{ color: '#e4e6eb', mb: 1 }}>
                    <strong>Customer:</strong> {selectedJob.customer_name}
                  </Typography>
                  <Typography variant="body2" sx={{ color: '#e4e6eb', mb: 1 }}>
                    <strong>Priority:</strong> {selectedJob.priority}
                  </Typography>
                  <Typography variant="body2" sx={{ color: '#e4e6eb', mb: 1 }}>
                    <strong>Due Date:</strong> {selectedJob.due_date ? format(parseISO(selectedJob.due_date), 'MMM dd, yyyy') : 'Not set'}
                  </Typography>
                  <Typography variant="body2" sx={{ color: '#e4e6eb', mb: 1 }}>
                    <strong>Status:</strong> {selectedJob.status}
                  </Typography>
                  <Typography variant="body2" sx={{ color: '#e4e6eb', mb: 1 }}>
                    <strong>Estimated Hours:</strong> {
                      selectedJob.routings && selectedJob.routings.length > 0
                        ? selectedJob.routings.reduce((total, routing) => total + (parseFloat(routing.estimated_hours) || 0), 0).toFixed(2) + 'h'
                        : selectedJob.estimated_hours || 'Not set'
                    }
                  </Typography>
                </Grid>
                {jobRoutings && jobRoutings.length > 0 && (
                  <Grid item xs={12}>
                    <Typography variant="subtitle1" gutterBottom sx={{ color: '#e4e6eb', fontWeight: 600 }}>
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
                                <Typography variant="body2" fontWeight="bold" sx={{ color: '#e4e6eb' }}>
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
                              </Box>
                            }
                            secondary={
                              <Box sx={{ mt: 0.5 }}>
                                <Typography variant="caption" display="block" sx={{ color: '#9ca3af' }}>
                                  <strong>Estimated Hours:</strong> {routing.estimated_hours || 'Not set'}
                                </Typography>
                                <Typography variant="caption" display="block" sx={{ color: '#9ca3af' }}>
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
                                  <Typography variant="caption" display="block" sx={{ fontStyle: 'italic', color: '#9ca3af' }}>
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
                {selectedJob.operations && selectedJob.operations.length > 0 && (
                  <Grid item xs={12}>
                    <Typography variant="subtitle1" gutterBottom sx={{ color: '#e4e6eb', fontWeight: 600 }}>
                      Legacy Operations
                    </Typography>
                    <Box display="flex" flexWrap="wrap" gap={1}>
                      {selectedJob.operations.map((operation, index) => (
                        <Chip key={index} label={operation} size="small" />
                      ))}
                    </Box>
                  </Grid>
                )}
                {selectedJob.special_instructions && (
                  <Grid item xs={12}>
                    <Typography variant="subtitle1" gutterBottom sx={{ color: '#e4e6eb', fontWeight: 600 }}>
                      Special Instructions
                    </Typography>
                    <Typography variant="body2" sx={{ color: '#e4e6eb' }}>
                      {selectedJob.special_instructions}
                    </Typography>
                  </Grid>
                )}
              </Grid>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setSelectedJob(null)}>Close</Button>
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
                onClick={() => handleDelete(selectedJob)}
                disabled={selectedJob.schedule_locked}
              >
                Delete Job
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>

      {/* Assembly Manager */}
      <AssemblyManager 
        open={assemblyManagerOpen}
        onClose={() => setAssemblyManagerOpen(false)}
        jobs={jobs}
      />
    </Box>
  );
};

export default JobManagement;
