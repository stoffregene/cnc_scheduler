import React, { memo } from 'react';
import {
  Card,
  CardContent,
  Typography,
  Chip,
  IconButton,
  Tooltip,
  Box,
  Avatar,
} from '@mui/material';
import {
  Edit as EditIcon,
  Delete as DeleteIcon,
  Visibility as VisibilityIcon,
  Lock as LockIcon,
} from '@mui/icons-material';
import { format, parseISO, isPast, isToday, isTomorrow } from 'date-fns';
import PermissionGuard from './PermissionGuard';

const JobCard = memo(({ 
  job, 
  onJobClick, 
  onEdit, 
  onDelete,
  getPriorityColor,
  getStatusColor,
  getDueDateDisplay 
}) => {
  return (
    <Card key={job.id} className="industrial-card" sx={{ mb: 2 }}>
      <CardContent sx={{ pb: 2 }}>
        <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={2}>
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

        <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
          <Box>
            <Typography variant="body2" sx={{ color: '#e4e6eb', fontWeight: 500 }}>
              Customer: {job.customer_name}
            </Typography>
            <Typography variant="body2" sx={{ color: '#9ca3af' }}>
              Quantity: {job.quantity}
            </Typography>
          </Box>
          <Box textAlign="right">
            <Typography variant="body2" sx={{ color: '#e4e6eb', fontWeight: 500 }}>
              {getDueDateDisplay(job)}
            </Typography>
            <Typography variant="body2" sx={{ color: '#9ca3af' }}>
              Est. Hours: {job.estimated_hours || 'N/A'}
            </Typography>
          </Box>
        </Box>

        <Box display="flex" justifyContent="space-between" alignItems="center">
          <Typography variant="body2" sx={{ color: '#9ca3af' }}>
            {job.total_scheduled_hours || 0}h scheduled
          </Typography>
          <Box>
            <Tooltip title="View Details">
              <IconButton size="small" onClick={() => onJobClick(job)}>
                <VisibilityIcon />
              </IconButton>
            </Tooltip>
            <PermissionGuard permission="jobs.edit">
              <Tooltip title="Edit Job">
                <IconButton size="small" onClick={() => onEdit(job)}>
                  <EditIcon />
                </IconButton>
              </Tooltip>
            </PermissionGuard>
            <PermissionGuard permission="jobs.delete">
              <Tooltip title="Delete Job">
                <IconButton size="small" onClick={() => onDelete(job)}>
                  <DeleteIcon />
                </IconButton>
              </Tooltip>
            </PermissionGuard>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
});

JobCard.displayName = 'JobCard';

export default JobCard;