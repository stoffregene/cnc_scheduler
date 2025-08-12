import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Divider,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  IconButton,
  TextField,
  Button,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Grid,
  Collapse,
  Tooltip,
} from '@mui/material';
import {
  Build as BuildIcon,
  Group as GroupIcon,
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  DragIndicator as DragIcon,
} from '@mui/icons-material';
import { apiService } from '../services/apiService';

const RoutingSelector = ({ value = [], onChange, label = "Operations/Routings" }) => {
  const [machines, setMachines] = useState([]);
  const [machineGroups, setMachineGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedGroups, setExpandedGroups] = useState({});
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingOperation, setEditingOperation] = useState(null);
  const [operationForm, setOperationForm] = useState({
    operation_number: '',
    operation_name: '',
    machine_id: '',
    machine_group_id: '',
    estimated_hours: '',
    notes: ''
  });

  useEffect(() => {
    fetchMachinesAndGroups();
  }, []);

  const fetchMachinesAndGroups = async () => {
    try {
      setLoading(true);
      const [machinesResponse, groupsResponse] = await Promise.all([
        apiService.machines.getAll(),
        apiService.machines.getGroups()
      ]);
      setMachines(machinesResponse.data);
      setMachineGroups(groupsResponse.data);
    } catch (error) {
      console.error('Error fetching machines and groups:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddOperation = () => {
    setEditingOperation(null);
    setOperationForm({
      operation_number: '',
      operation_name: '',
      machine_id: '',
      machine_group_id: '',
      estimated_hours: '',
      notes: ''
    });
    setDialogOpen(true);
  };

  const handleEditOperation = (operation, index) => {
    setEditingOperation({ operation, index });
    setOperationForm({
      operation_number: operation.operation_number,
      operation_name: operation.operation_name,
      machine_id: operation.machine_id || '',
      machine_group_id: operation.machine_group_id || '',
      estimated_hours: operation.estimated_hours || '',
      notes: operation.notes || ''
    });
    setDialogOpen(true);
  };

  const handleDeleteOperation = (index) => {
    const newValue = value.filter((_, i) => i !== index);
    // Reorder sequence numbers
    const reorderedValue = newValue.map((op, i) => ({
      ...op,
      sequence_order: i + 1
    }));
    onChange(reorderedValue);
  };

  const handleSaveOperation = () => {
    const newOperation = {
      ...operationForm,
      sequence_order: editingOperation ? value[editingOperation.index].sequence_order : value.length + 1,
      estimated_hours: parseFloat(operationForm.estimated_hours) || 0
    };

    let newValue;
    if (editingOperation) {
      // Update existing operation
      newValue = [...value];
      newValue[editingOperation.index] = newOperation;
    } else {
      // Add new operation
      newValue = [...value, newOperation];
    }

    onChange(newValue);
    setDialogOpen(false);
  };

  const moveOperation = (fromIndex, toIndex) => {
    if (toIndex < 0 || toIndex >= value.length) return;
    
    const newValue = [...value];
    const [movedOperation] = newValue.splice(fromIndex, 1);
    newValue.splice(toIndex, 0, movedOperation);
    
    // Update sequence orders
    const reorderedValue = newValue.map((op, i) => ({
      ...op,
      sequence_order: i + 1
    }));
    
    onChange(reorderedValue);
  };

  const getMachineName = (machineId) => {
    const machine = machines.find(m => m.id === machineId);
    return machine ? machine.name : 'Unknown Machine';
  };

  const getGroupName = (groupId) => {
    const group = machineGroups.find(g => g.id === groupId);
    return group ? group.name : 'Unknown Group';
  };

  const toggleGroupExpansion = (groupId) => {
    setExpandedGroups(prev => ({
      ...prev,
      [groupId]: !prev[groupId]
    }));
  };

  if (loading) {
    return (
      <Box>
        <div style={{ color: '#666', fontSize: '0.875rem' }}>
          Loading machines and groups...
        </div>
      </Box>
    );
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <div style={{ fontWeight: 500, fontSize: '0.875rem', marginBottom: '8px' }}>
          {label}
        </div>
        <Button
          variant="outlined"
          size="small"
          startIcon={<AddIcon />}
          onClick={handleAddOperation}
        >
          Add Operation
        </Button>
      </Box>
      
      {/* Current Operations List */}
      {value.length > 0 && (
        <Box sx={{ mb: 3 }}>
          <div style={{ color: '#666', fontSize: '0.875rem', marginBottom: '8px' }}>
            Current Operations:
          </div>
          <List dense>
            {value.map((operation, index) => (
              <ListItem
                key={index}
                sx={{
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 1,
                  mb: 1,
                  backgroundColor: 'background.paper'
                }}
              >
                <ListItemIcon sx={{ minWidth: 40 }}>
                  <DragIcon color="action" />
                </ListItemIcon>
                <ListItemText
                  primary={
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Chip 
                        label={`OP-${operation.operation_number}`} 
                        size="small" 
                        color="primary" 
                        variant="outlined"
                      />
                      <span style={{ fontWeight: 500 }}>
                        {operation.operation_name}
                      </span>
                    </div>
                  }
                  secondary={
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 4 }}>
                      {operation.machine_id && (
                        <Chip
                          icon={<BuildIcon />}
                          label={getMachineName(operation.machine_id)}
                          size="small"
                          variant="outlined"
                        />
                      )}
                      {operation.machine_group_id && (
                        <Chip
                          icon={<GroupIcon />}
                          label={getGroupName(operation.machine_group_id)}
                          size="small"
                          variant="outlined"
                        />
                      )}
                      <span style={{ color: '#666' }}>
                        {operation.estimated_hours}h
                      </span>
                    </div>
                  }
                />
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Tooltip title="Move Up">
                    <span>
                      <IconButton
                        size="small"
                        disabled={index === 0}
                        onClick={() => moveOperation(index, index - 1)}
                      >
                        <ExpandLessIcon />
                      </IconButton>
                    </span>
                  </Tooltip>
                  <Tooltip title="Move Down">
                    <span>
                      <IconButton
                        size="small"
                        disabled={index === value.length - 1}
                        onClick={() => moveOperation(index, index + 1)}
                      >
                        <ExpandMoreIcon />
                      </IconButton>
                    </span>
                  </Tooltip>
                  <Tooltip title="Edit Operation">
                    <IconButton
                      size="small"
                      onClick={() => handleEditOperation(operation, index)}
                    >
                      <EditIcon />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Delete Operation">
                    <IconButton
                      size="small"
                      onClick={() => handleDeleteOperation(index)}
                    >
                      <DeleteIcon />
                    </IconButton>
                  </Tooltip>
                </Box>
              </ListItem>
            ))}
          </List>
        </Box>
      )}

      <Divider sx={{ my: 2 }} />

      {/* Available Machines and Groups for Reference */}
      <div style={{ fontWeight: 500, fontSize: '0.875rem', marginBottom: '8px' }}>
        Available Resources
      </div>
      
      {/* Individual Machines */}
      <div style={{ color: '#666', fontSize: '0.875rem', marginBottom: '8px' }}>
        Individual Machines
      </div>
      <List dense>
        {machines
          .filter(machine => machine.status === 'active')
          .map((machine) => (
            <ListItem key={machine.id} sx={{ pl: 2 }}>
              <ListItemIcon>
                <BuildIcon />
              </ListItemIcon>
              <ListItemText
                primary={machine.name}
                secondary={machine.model || 'No Model'}
              />
            </ListItem>
          ))}
      </List>

      {/* Machine Groups */}
      <div style={{ color: '#666', fontSize: '0.875rem', marginBottom: '8px', marginTop: '16px' }}>
        Machine Groups
      </div>
      <List dense>
        {machineGroups.map((group) => {
          const isExpanded = expandedGroups[group.id];
          const groupMachines = machines.filter(machine => 
            machine.groups && machine.groups.some(g => g.id === group.id)
          );

          return (
            <Box key={group.id}>
              <ListItem sx={{ pl: 2 }}>
                <ListItemIcon>
                  <GroupIcon />
                </ListItemIcon>
                <ListItemText
                  primary={group.name}
                  secondary={`${group.machine_count || 0} machines`}
                />
                <IconButton
                  size="small"
                  onClick={() => toggleGroupExpansion(group.id)}
                >
                  {isExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                </IconButton>
              </ListItem>
              
              {/* Group Machines */}
              <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                <List dense sx={{ pl: 4 }}>
                  {groupMachines.map((machine) => (
                    <ListItem key={machine.id} sx={{ pl: 2 }}>
                      <ListItemIcon sx={{ minWidth: 32 }}>
                        <BuildIcon fontSize="small" />
                      </ListItemIcon>
                      <ListItemText
                        primary={machine.name}
                        secondary={machine.model || 'No Model'}
                      />
                    </ListItem>
                  ))}
                  {groupMachines.length === 0 && (
                    <ListItem>
                      <ListItemText
                        secondary="No machines in this group"
                        sx={{ fontStyle: 'italic' }}
                      />
                    </ListItem>
                  )}
                </List>
              </Collapse>
            </Box>
          );
        })}
      </List>

      {/* Operation Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          {editingOperation ? 'Edit Operation' : 'Add Operation'}
        </DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Operation Number"
                value={operationForm.operation_number}
                onChange={(e) => setOperationForm({ ...operationForm, operation_number: e.target.value })}
                placeholder="e.g., 000, 001, 002"
                required
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Operation Name"
                value={operationForm.operation_name}
                onChange={(e) => setOperationForm({ ...operationForm, operation_name: e.target.value })}
                placeholder="e.g., WATERJET, HMC, INSPECT"
                required
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Machine (Optional)</InputLabel>
                <Select
                  value={operationForm.machine_id}
                  onChange={(e) => setOperationForm({ 
                    ...operationForm, 
                    machine_id: e.target.value,
                    machine_group_id: '' // Clear group if machine is selected
                  })}
                >
                  <MenuItem value="">No Machine</MenuItem>
                  {machines
                    .filter(machine => machine.status === 'active')
                    .map((machine) => (
                      <MenuItem key={machine.id} value={machine.id}>
                        {machine.name} ({machine.model || 'No Model'})
                      </MenuItem>
                    ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Machine Group (Optional)</InputLabel>
                <Select
                  value={operationForm.machine_group_id}
                  onChange={(e) => setOperationForm({ 
                    ...operationForm, 
                    machine_group_id: e.target.value,
                    machine_id: '' // Clear machine if group is selected
                  })}
                >
                  <MenuItem value="">No Group</MenuItem>
                  {machineGroups.map((group) => (
                    <MenuItem key={group.id} value={group.id}>
                      {group.name} ({group.machine_count || 0} machines)
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
                value={operationForm.estimated_hours}
                onChange={(e) => setOperationForm({ ...operationForm, estimated_hours: e.target.value })}
                placeholder="0.0"
                inputProps={{ step: 0.5, min: 0 }}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Notes (Optional)"
                multiline
                rows={2}
                value={operationForm.notes}
                onChange={(e) => setOperationForm({ ...operationForm, notes: e.target.value })}
                placeholder="Additional notes for this operation"
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button 
            onClick={handleSaveOperation} 
            variant="contained"
            disabled={!operationForm.operation_number || !operationForm.operation_name}
          >
            {editingOperation ? 'Update' : 'Add'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default RoutingSelector;
