import React, { useState, useEffect } from 'react';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  Chip,
  LinearProgress,
  Avatar,
  Divider,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
} from '@mui/material';
import {
  Build as BuildIcon,
  Schedule as ScheduleIcon,
  Assessment as AssessmentIcon,
  TrendingUp as TrendingUpIcon,
} from '@mui/icons-material';
import { format, parseISO, isPast, isToday, isTomorrow } from 'date-fns';
import toast from 'react-hot-toast';

import { apiService } from '../services/apiService';
import Logo from '../components/Logo';

const Dashboard = () => {
  const [machineView, setMachineView] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [dashboardData, setDashboardData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedJob, setSelectedJob] = useState(null);
  const [jobDialogOpen, setJobDialogOpen] = useState(false);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const [machineData, jobsData, summaryData] = await Promise.all([
        apiService.get('/api/schedules/machine-view'),
        apiService.get('/api/jobs'),
        apiService.get('/api/schedules/dashboard/summary'),
      ]);

      setMachineView(machineData.data);
      setJobs(jobsData.data);
      setDashboardData(summaryData.data);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      toast.error('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'scheduled':
        return 'primary';
      case 'completed':
        return 'success';
      case 'cancelled':
        return 'error';
      case 'pending':
        return 'warning';
      default:
        return 'default';
    }
  };

  const getPriorityColor = (priority) => {
    if (priority <= 2) return 'error';
    if (priority <= 4) return 'warning';
    if (priority <= 6) return 'info';
    return 'default';
  };

  const getDueDateStatus = (dueDate) => {
    if (!dueDate) return { color: 'default', text: 'No due date' };
    
    const date = parseISO(dueDate);
    if (isPast(date)) return { color: 'error', text: 'Overdue' };
    if (isToday(date)) return { color: 'warning', text: 'Due today' };
    if (isTomorrow(date)) return { color: 'info', text: 'Due tomorrow' };
    return { color: 'success', text: format(date, 'MMM dd') };
  };

  const handleJobClick = (job) => {
    setSelectedJob(job);
    setJobDialogOpen(true);
  };

  const StatCard = ({ title, value, icon, color, subtitle }) => (
    <Card sx={{ height: '100%' }}>
      <CardContent>
        <Box display="flex" alignItems="center" justifyContent="space-between">
          <Box>
            <Typography color="textSecondary" gutterBottom variant="body2">
              {title}
            </Typography>
            <Typography variant="h4" component="div" sx={{ fontWeight: 'bold' }}>
              {value}
            </Typography>
            {subtitle && (
              <Typography variant="body2" color="textSecondary">
                {subtitle}
              </Typography>
            )}
          </Box>
          <Avatar sx={{ bgcolor: `${color}.light`, color: `${color}.main` }}>
            {icon}
          </Avatar>
        </Box>
      </CardContent>
    </Card>
  );

  const MachineCard = ({ machine }) => (
    <Card sx={{ height: '100%', minHeight: 200 }}>
      <CardContent>
        <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
          <Typography variant="h6" component="div">
            {machine.machine_name}
          </Typography>
          <Chip 
            label={machine.group_name} 
            size="small" 
            variant="outlined"
          />
        </Box>
        
        <Typography variant="body2" color="textSecondary" gutterBottom>
          {machine.machine_model}
        </Typography>

        <Divider sx={{ my: 2 }} />

        <Typography variant="body2" color="textSecondary" gutterBottom>
          Scheduled Jobs: {machine.schedules?.length || 0}
        </Typography>

        {machine.schedules && machine.schedules.length > 0 ? (
          <List dense>
            {machine.schedules.slice(0, 3).map((schedule) => (
              <ListItem key={schedule.id} sx={{ px: 0 }}>
                <ListItemAvatar>
                  <Avatar sx={{ width: 24, height: 24, fontSize: '0.75rem' }}>
                    {schedule.job_number?.slice(0, 2)}
                  </Avatar>
                </ListItemAvatar>
                <ListItemText
                  primary={schedule.part_name}
                  secondary={`${schedule.job_number} - ${schedule.employee_name}`}
                  primaryTypographyProps={{ variant: 'body2' }}
                  secondaryTypographyProps={{ variant: 'caption' }}
                />
                <Chip
                  label={schedule.status}
                  size="small"
                  color={getStatusColor(schedule.status)}
                />
              </ListItem>
            ))}
            {machine.schedules.length > 3 && (
              <ListItem sx={{ px: 0 }}>
                <ListItemText
                  secondary={`+${machine.schedules.length - 3} more jobs`}
                  secondaryTypographyProps={{ variant: 'caption', color: 'textSecondary' }}
                />
              </ListItem>
            )}
          </List>
        ) : (
          <Box textAlign="center" py={2}>
            <Typography variant="body2" color="textSecondary">
              No scheduled jobs
            </Typography>
          </Box>
        )}
      </CardContent>
    </Card>
  );

  const JobTile = ({ job }) => {
    const dueDateStatus = getDueDateStatus(job.due_date);
    
    return (
      <Card 
        sx={{ 
          cursor: 'pointer',
          '&:hover': { boxShadow: 4 },
          transition: 'box-shadow 0.2s'
        }}
        onClick={() => handleJobClick(job)}
      >
        <CardContent>
          <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={1}>
            <Typography variant="h6" component="div" noWrap>
              {job.job_number}
            </Typography>
            <Chip
              label={`P${job.priority}`}
              size="small"
              color={getPriorityColor(job.priority)}
            />
          </Box>
          
          <Typography variant="body2" color="textSecondary" gutterBottom>
            {job.part_name}
          </Typography>
          
          <Typography variant="body2" gutterBottom>
            Customer: {job.customer_name}
          </Typography>
          
          <Box display="flex" justifyContent="space-between" alignItems="center" mt={2}>
            <Typography variant="body2">
              Qty: {job.quantity}
            </Typography>
            <Chip
              label={dueDateStatus.text}
              size="small"
              color={dueDateStatus.color}
              variant="outlined"
            />
          </Box>
          
          {job.estimated_hours && (
            <Box mt={1}>
              <Typography variant="caption" color="textSecondary">
                Est. Hours: {job.estimated_hours}
              </Typography>
            </Box>
          )}
        </CardContent>
      </Card>
    );
  };

  if (loading) {
    return (
      <Box>
        <LinearProgress />
        <Typography variant="h6" sx={{ mt: 2 }}>
          Loading dashboard...
        </Typography>
      </Box>
    );
  }

  return (
    <Box>
      <Box sx={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: 2, 
        mb: 3,
        pb: 2,
        borderBottom: '1px solid',
        borderColor: 'divider'
      }}>
        <Logo 
          variant="horizontal" 
          color="primary" 
          height={40}
        />
        <Box>
          <Typography variant="h4" gutterBottom={false}>
            Manufacturing Dashboard
          </Typography>
          <Typography variant="subtitle1" color="text.secondary">
            Real-time production overview and metrics
          </Typography>
        </Box>
      </Box>
      
      {/* Lean 6S Metrics */}
      <Grid container spacing={3} mb={4}>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Total Jobs"
            value={dashboardData?.summary?.total_schedules || 0}
            icon={<AssessmentIcon />}
            color="primary"
            subtitle="Active jobs in system"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Active Machines"
            value={machineView.length}
            icon={<BuildIcon />}
            color="success"
            subtitle="Machines in operation"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Scheduled Hours"
            value={`${Math.round(dashboardData?.summary?.total_hours || 0)}h`}
            icon={<ScheduleIcon />}
            color="info"
            subtitle="Total scheduled time"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Efficiency"
            value={`${Math.round((dashboardData?.summary?.completed_count / Math.max(dashboardData?.summary?.total_schedules, 1)) * 100)}%`}
            icon={<TrendingUpIcon />}
            color="warning"
            subtitle="Completion rate"
          />
        </Grid>
      </Grid>

      {/* Machine Kanban View */}
      <Typography variant="h5" gutterBottom sx={{ mt: 4 }}>
        Machine Status Overview
      </Typography>
      <Grid container spacing={3} mb={4}>
        {machineView.map((machine) => (
          <Grid item xs={12} sm={6} md={4} lg={3} key={machine.machine_id}>
            <MachineCard machine={machine} />
          </Grid>
        ))}
      </Grid>

      {/* Jobs Overview */}
      <Typography variant="h5" gutterBottom>
        Recent Jobs
      </Typography>
      <Grid container spacing={2}>
        {jobs.slice(0, 12).map((job) => (
          <Grid item xs={12} sm={6} md={4} lg={3} key={job.id}>
            <JobTile job={job} />
          </Grid>
        ))}
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
                    <strong>Priority:</strong> {selectedJob.priority}
                  </Typography>
                  <Typography variant="body2">
                    <strong>Due Date:</strong> {selectedJob.due_date ? format(parseISO(selectedJob.due_date), 'MMM dd, yyyy') : 'Not set'}
                  </Typography>
                  <Typography variant="body2">
                    <strong>Status:</strong> {selectedJob.status}
                  </Typography>
                </Grid>
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
            </DialogActions>
          </>
        )}
      </Dialog>
    </Box>
  );
};

export default Dashboard;
