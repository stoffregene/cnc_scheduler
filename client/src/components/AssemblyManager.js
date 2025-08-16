import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  Chip,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Alert,
  Divider,
  Card,
  CardContent,
  CardActions,
} from '@mui/material';
import {
  Link as LinkIcon,
  LinkOff as UnlinkIcon,
  Delete as DeleteIcon,
  Build as BuildIcon,
  Warning as WarningIcon,
} from '@mui/icons-material';
import toast from 'react-hot-toast';
import { apiService } from '../services/apiService';

const AssemblyManager = ({ open, onClose, jobs = [] }) => {
  const [relationships, setRelationships] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedParent, setSelectedParent] = useState('');
  const [selectedChildren, setSelectedChildren] = useState([]);
  const [availableJobs, setAvailableJobs] = useState([]);

  useEffect(() => {
    if (open) {
      fetchRelationships();
      setAvailableJobs(jobs.filter(job => job.job_type !== 'assembly_component'));
    }
  }, [open, jobs]);

  const fetchRelationships = async () => {
    try {
      setLoading(true);
      const response = await apiService.get('/api/assembly/relationships');
      setRelationships(response.data);
    } catch (error) {
      console.error('Error fetching relationships:', error);
      toast.error('Failed to load assembly relationships');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateRelationship = async () => {
    if (!selectedParent || selectedChildren.length === 0) {
      toast.error('Please select a parent job and at least one child job');
      return;
    }

    try {
      setLoading(true);
      const response = await apiService.post('/api/assembly/create-relationship', {
        parent_job_id: parseInt(selectedParent),
        child_job_ids: selectedChildren.map(id => parseInt(id))
      });
      
      toast.success(response.data.message);
      setSelectedParent('');
      setSelectedChildren([]);
      fetchRelationships();
      
    } catch (error) {
      console.error('Error creating relationship:', error);
      toast.error('Failed to create assembly relationship');
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveRelationship = async (parentJobId) => {
    if (window.confirm('Are you sure you want to remove this assembly relationship? This will also remove scheduling dependencies.')) {
      try {
        setLoading(true);
        const response = await apiService.delete(`/api/assembly/relationship/${parentJobId}`);
        toast.success(response.data.message);
        fetchRelationships();
      } catch (error) {
        console.error('Error removing relationship:', error);
        toast.error('Failed to remove assembly relationship');
      } finally {
        setLoading(false);
      }
    }
  };

  const handleAutoDetect = async () => {
    try {
      setLoading(true);
      const jobNumbers = jobs.map(job => job.job_number);
      const response = await apiService.post('/api/assembly/detect-relationships', {
        job_numbers: jobNumbers
      });
      
      if (response.data.detected > 0) {
        toast.success(`Auto-detected ${response.data.detected} assembly relationships`);
        fetchRelationships();
      } else {
        toast.info('No assembly relationships detected automatically');
      }
      
    } catch (error) {
      console.error('Error auto-detecting relationships:', error);
      toast.error('Failed to auto-detect relationships');
    } finally {
      setLoading(false);
    }
  };

  const getJobName = (jobId) => {
    const job = jobs.find(j => j.id === jobId);
    return job ? `${job.job_number} - ${job.part_name}` : `Job ${jobId}`;
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed': return 'success';
      case 'scheduled': return 'primary';
      case 'in_progress': return 'info';
      case 'cancelled': return 'error';
      default: return 'warning';
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box display="flex" alignItems="center" gap={1}>
          <BuildIcon />
          Assembly Relationships Manager
        </Box>
      </DialogTitle>
      
      <DialogContent>
        <Box sx={{ mb: 3 }}>
          <Alert severity="info" sx={{ mb: 2 }}>
            Assembly relationships ensure that component jobs are completed before the parent assembly job can begin.
            This prevents scheduling conflicts where assemblies start before their parts are ready.
          </Alert>
          
          {/* Auto-detect button */}
          <Box sx={{ mb: 3 }}>
            <Button
              variant="outlined"
              startIcon={<LinkIcon />}
              onClick={handleAutoDetect}
              disabled={loading}
              sx={{ mr: 2 }}
            >
              Auto-Detect Relationships
            </Button>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              Automatically detects assembly relationships based on job numbering (e.g., 12345 and 12345-1)
            </Typography>
          </Box>

          <Divider sx={{ my: 3 }} />

          {/* Manual relationship creation */}
          <Typography variant="h6" gutterBottom>
            Create New Assembly Relationship
          </Typography>
          
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: 3 }}>
            <FormControl fullWidth>
              <InputLabel>Parent Assembly Job</InputLabel>
              <Select
                value={selectedParent}
                onChange={(e) => setSelectedParent(e.target.value)}
                label="Parent Assembly Job"
              >
                {availableJobs.map(job => (
                  <MenuItem key={job.id} value={job.id}>
                    {job.job_number} - {job.part_name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl fullWidth>
              <InputLabel>Component Jobs (Child Parts)</InputLabel>
              <Select
                multiple
                value={selectedChildren}
                onChange={(e) => setSelectedChildren(e.target.value)}
                label="Component Jobs (Child Parts)"
                renderValue={(selected) => (
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                    {selected.map((value) => (
                      <Chip key={value} label={getJobName(value)} size="small" />
                    ))}
                  </Box>
                )}
              >
                {jobs.filter(job => 
                  job.id !== parseInt(selectedParent) && 
                  job.job_type !== 'assembly_parent'
                ).map(job => (
                  <MenuItem key={job.id} value={job.id}>
                    {job.job_number} - {job.part_name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <Button
              variant="contained"
              startIcon={<LinkIcon />}
              onClick={handleCreateRelationship}
              disabled={loading || !selectedParent || selectedChildren.length === 0}
            >
              Create Assembly Relationship
            </Button>
          </Box>

          <Divider sx={{ my: 3 }} />

          {/* Existing relationships */}
          <Typography variant="h6" gutterBottom>
            Existing Assembly Relationships
          </Typography>
          
          {relationships.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
              No assembly relationships found. Create one above or use auto-detect.
            </Typography>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {relationships.map((relationship) => (
                <Card key={relationship.parent_id} variant="outlined">
                  <CardContent>
                    <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
                      <Typography variant="h6">
                        🏭 {relationship.parent_job_number} - {relationship.parent_part_name}
                      </Typography>
                      <Chip label="Assembly Parent" color="primary" variant="outlined" />
                    </Box>
                    
                    <Typography variant="body2" color="text.secondary" gutterBottom>
                      Component Jobs (must complete before assembly):
                    </Typography>
                    
                    <List dense>
                      {relationship.children.map((child) => (
                        <ListItem key={child.id}>
                          <ListItemText
                            primary={`${child.job_number} - ${child.part_name}`}
                            secondary={`Sequence: ${child.assembly_sequence}`}
                          />
                          <ListItemSecondaryAction>
                            <Chip
                              label={child.status}
                              size="small"
                              color={getStatusColor(child.status)}
                            />
                          </ListItemSecondaryAction>
                        </ListItem>
                      ))}
                    </List>
                    
                    {relationship.children.some(child => ['completed', 'cancelled'].includes(child.status)) && (
                      <Alert severity="warning" sx={{ mt: 1 }} icon={<WarningIcon />}>
                        Some components are completed or cancelled. Review assembly scheduling.
                      </Alert>
                    )}
                  </CardContent>
                  
                  <CardActions>
                    <Button
                      startIcon={<UnlinkIcon />}
                      color="error"
                      onClick={() => handleRemoveRelationship(relationship.parent_id)}
                      disabled={loading}
                    >
                      Remove Relationship
                    </Button>
                  </CardActions>
                </Card>
              ))}
            </Box>
          )}
        </Box>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} disabled={loading}>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default AssemblyManager;