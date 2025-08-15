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
  LinearProgress,
  Avatar,
  Divider,
  Alert,
  Tooltip,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  List,
  ListItem,
  ListItemText,
  ListItemAvatar,
  ListItemSecondaryAction,
  Badge,
  Tabs,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Checkbox,
  FormControlLabel,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Build as BuildIcon,
  Settings as SettingsIcon,
  Category as CategoryIcon,
  LocationOn as LocationIcon,
  Speed as SpeedIcon,
  Storage as StorageIcon,
  ExpandMore as ExpandMoreIcon,
  Group as GroupIcon,
  Person as PersonIcon,
  Assignment as AssignmentIcon,
  Schedule as ScheduleIcon,
  CheckCircle as CheckCircleIcon,
  Cancel as CancelIcon,
  Warning as WarningIcon,
} from '@mui/icons-material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { format, parseISO } from 'date-fns';
import toast from 'react-hot-toast';

import { apiService } from '../services/apiService';
import Logo from '../components/Logo';

const MachineDirectory = () => {
  const [machines, setMachines] = useState([]);
  const [machineGroups, setMachineGroups] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [operatorDialogOpen, setOperatorDialogOpen] = useState(false);
  const [availabilityMatrixOpen, setAvailabilityMatrixOpen] = useState(false);
  const [editingMachine, setEditingMachine] = useState(null);
  const [editingGroup, setEditingGroup] = useState(null);
  const [selectedMachine, setSelectedMachine] = useState(null);
  const [machineOperators, setMachineOperators] = useState([]);
  const [availabilityMatrix, setAvailabilityMatrix] = useState([]);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [activeTab, setActiveTab] = useState(0);
  const [formData, setFormData] = useState({
    name: '',
    model: '',
    manufacturer: '',
    machine_group_ids: [],
    capabilities: [],
    max_workpiece_size: '',
    spindle_speed_max: '',
    tool_capacity: '',
    location: '',
    notes: '',
    status: 'active',
    efficiency_modifier: 1.00,
    assignToAllEmployees: false,
  });
  const [groupFormData, setGroupFormData] = useState({
    name: '',
    description: '',
  });
  const [operatorFormData, setOperatorFormData] = useState({
    employee_id: '',
    machine_id: '',
    proficiency_level: 'trained',
    preference_rank: 1,
    training_date: null,
    notes: '',
  });



  const capabilities = [
    'Milling', 'Turning', 'Drilling', 'Tapping', 'Threading', 'Boring', 'Reaming',
    'Grinding', 'EDM', 'Laser Cutting', 'Water Jet', 'Plasma Cutting', 'Welding'
  ];

  const statuses = ['active', 'maintenance', 'inactive', 'retired'];

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [machinesResponse, groupsResponse, employeesResponse] = await Promise.all([
        apiService.machines.getAll(),
        apiService.machines.getGroups(),
        apiService.employees.getAll(),
      ]);
      setMachines(machinesResponse.data);
      setMachineGroups(groupsResponse.data);
      setEmployees(employeesResponse.data);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Failed to load machine data');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = (machine = null) => {
    if (machine) {
      setEditingMachine(machine);
      setFormData({
        ...machine,
        machine_group_ids: machine.groups ? machine.groups.map(g => g.id) : [],
        capabilities: machine.capabilities || [],
        efficiency_modifier: machine.efficiency_modifier || 1.00,
      });
    } else {
      setEditingMachine(null);
      setFormData({
        name: '',
        model: '',
        manufacturer: '',
        machine_group_ids: [],
        capabilities: [],
        max_workpiece_size: '',
        spindle_speed_max: '',
        tool_capacity: '',
        location: '',
        notes: '',
        status: 'active',
        efficiency_modifier: 1.00,
        assignToAllEmployees: false,
      });
    }
    setDialogOpen(true);
  };

  const handleOpenGroupDialog = (group = null) => {
    if (group) {
      setEditingGroup(group);
      setGroupFormData({
        name: group.name,
        description: group.description,
      });
    } else {
      setEditingGroup(null);
      setGroupFormData({
        name: '',
        description: '',
      });
    }
    setGroupDialogOpen(true);
  };

  const handleSubmit = async () => {
    try {
      // Clean and validate form data before sending
      // Filter out database-only fields that shouldn't be sent in updates
      const { id, created_at, updated_at, groups, active_schedules, total_scheduled_hours, assignToAllEmployees, ...cleanFormData } = formData;
      
      const cleanedFormData = {
        ...cleanFormData,
        // Convert empty strings to null for optional fields
        max_workpiece_size: cleanFormData.max_workpiece_size || null,
        location: cleanFormData.location || null,
        notes: cleanFormData.notes || null,
        // Ensure machine_group_ids is an array
        machine_group_ids: Array.isArray(cleanFormData.machine_group_ids) ? cleanFormData.machine_group_ids : [],
        // Ensure capabilities is an array
        capabilities: Array.isArray(cleanFormData.capabilities) ? cleanFormData.capabilities : [],
      };
      
      console.log('Sending machine update data:', cleanedFormData);
      
      let machineResult;
      if (editingMachine) {
        machineResult = await apiService.machines.update(editingMachine.id, cleanedFormData);
        toast.success('Machine updated successfully');
      } else {
        machineResult = await apiService.machines.create(cleanedFormData);
        toast.success('Machine created successfully');
      }
      
      // Handle "Assign to All Employees" if checked
      if (assignToAllEmployees) {
        const machineId = editingMachine ? editingMachine.id : machineResult.data.id;
        await assignAllEmployeesToMachine(machineId);
      }
      
      setDialogOpen(false);
      fetchData();
    } catch (error) {
      console.error('Error saving machine:', error);
      
      // Provide more specific error messages
      if (error.response && error.response.data && error.response.data.error) {
        toast.error(error.response.data.error);
      } else if (error.message) {
        toast.error(`Failed to save machine: ${error.message}`);
      } else {
        toast.error('Failed to save machine');
      }
    }
  };

  const assignAllEmployeesToMachine = async (machineId) => {
    try {
      toast.loading('Assigning all employees to machine...', { id: 'assign-all' });
      
      const activeEmployees = employees.filter(emp => emp.status === 'active');
      let successCount = 0;
      let skipCount = 0;
      
      for (const employee of activeEmployees) {
        try {
          await apiService.post('/api/machines/operators', {
            employee_id: employee.id,
            machine_id: machineId,
            proficiency_level: 'trained',
            preference_rank: 5, // Default middle rank
            notes: 'Auto-assigned via "All Employees" option'
          });
          successCount++;
        } catch (error) {
          // Skip if already assigned (conflict error)
          if (error.response && error.response.status === 400) {
            skipCount++;
          } else {
            console.error(`Failed to assign ${employee.first_name} ${employee.last_name}:`, error);
          }
        }
      }
      
      toast.success(
        `✅ Assigned ${successCount} employees to machine${skipCount > 0 ? ` (${skipCount} already assigned)` : ''}`,
        { id: 'assign-all', duration: 4000 }
      );
      
    } catch (error) {
      console.error('Error assigning all employees:', error);
      toast.error('Failed to assign all employees to machine', { id: 'assign-all' });
    }
  };

  const handleGroupSubmit = async () => {
    try {
      if (editingGroup) {
        await apiService.machines.updateGroup(editingGroup.id, groupFormData);
        toast.success('Machine group updated successfully');
      } else {
        await apiService.machines.createGroup(groupFormData);
        toast.success('Machine group created successfully');
      }
      setGroupDialogOpen(false);
      fetchData();
    } catch (error) {
      console.error('Error saving machine group:', error);
      toast.error('Failed to save machine group');
    }
  };

  const handleOpenOperatorDialog = async (machine) => {
    setSelectedMachine(machine);
    setOperatorFormData({
      employee_id: '',
      machine_id: machine.id,
      proficiency_level: 'trained',
      preference_rank: 1,
      training_date: null,
      notes: '',
    });
    
    try {
      const response = await apiService.machines.getOperators(machine.id);
      setMachineOperators(response.data);
    } catch (error) {
      console.error('Error fetching machine operators:', error);
      toast.error('Failed to load machine operators');
    }
    
    setOperatorDialogOpen(true);
  };

  const handleOperatorSubmit = async () => {
    try {
      await apiService.machines.assignOperator(operatorFormData);
      toast.success('Operator assigned successfully');
      
      // Refresh machine operators
      const response = await apiService.machines.getOperators(selectedMachine.id);
      setMachineOperators(response.data);
      
      // Reset form
      setOperatorFormData({
        employee_id: '',
        machine_id: selectedMachine.id,
        proficiency_level: 'trained',
        preference_rank: 1,
        training_date: null,
        notes: '',
      });
    } catch (error) {
      console.error('Error assigning operator:', error);
      toast.error('Failed to assign operator');
    }
  };

  const handleRemoveOperator = async (assignmentId) => {
    if (window.confirm('Are you sure you want to remove this operator assignment?')) {
      try {
        await apiService.machines.removeOperatorAssignment(assignmentId);
        toast.success('Operator assignment removed');
        
        // Refresh machine operators
        const response = await apiService.machines.getOperators(selectedMachine.id);
        setMachineOperators(response.data);
      } catch (error) {
        console.error('Error removing operator assignment:', error);
        toast.error('Failed to remove operator assignment');
      }
    }
  };

  const handleOpenAvailabilityMatrix = async () => {
    try {
      const response = await apiService.machines.getAvailabilityMatrix({
        date: format(selectedDate, 'yyyy-MM-dd')
      });
      setAvailabilityMatrix(response.data);
      setAvailabilityMatrixOpen(true);
    } catch (error) {
      console.error('Error fetching availability matrix:', error);
      toast.error('Failed to load availability matrix');
    }
  };

  const handleDelete = async (machine) => {
    if (window.confirm(`Are you sure you want to delete ${machine.name}?`)) {
      try {
        await apiService.machines.delete(machine.id);
        toast.success('Machine deleted successfully');
        fetchData();
      } catch (error) {
        console.error('Error deleting machine:', error);
        toast.error('Failed to delete machine');
      }
    }
  };

  const handleDeleteGroup = async (group) => {
    if (window.confirm(`Are you sure you want to delete ${group.name}? This will affect all machines in this group.`)) {
      try {
        await apiService.machines.deleteGroup(group.id);
        toast.success('Machine group deleted successfully');
        fetchData();
      } catch (error) {
        console.error('Error deleting machine group:', error);
        toast.error('Failed to delete machine group');
      }
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'active':
        return 'success';
      case 'maintenance':
        return 'warning';
      case 'inactive':
        return 'error';
      case 'retired':
        return 'default';
      default:
        return 'default';
    }
  };

  const MachineCard = ({ machine }) => (
    <Card sx={{ height: '100%' }}>
      <CardContent>
        <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
          <Box display="flex" alignItems="center">
            <Avatar sx={{ mr: 2, bgcolor: 'primary.main' }}>
              <BuildIcon />
            </Avatar>
            <Box>
              <Typography variant="h6" component="div">
                {machine.name}
              </Typography>
              <Typography variant="body2" color="textSecondary">
                {machine.model} • {machine.manufacturer}
              </Typography>
            </Box>
          </Box>
          <Chip
            label={machine.status}
            size="small"
            color={getStatusColor(machine.status)}
          />
        </Box>

        <Box mb={2}>
          <Typography variant="body2" display="flex" alignItems="center" mb={1}>
            <CategoryIcon sx={{ mr: 1, fontSize: 16 }} />
            Groups: {machine.groups && machine.groups.length > 0 ? 
              machine.groups.map(g => g.name).join(', ') : 'No Groups'}
          </Typography>
          {machine.location && (
            <Typography variant="body2" display="flex" alignItems="center" mb={1}>
              <LocationIcon sx={{ mr: 1, fontSize: 16 }} />
              {machine.location}
            </Typography>
          )}
          {machine.spindle_speed_max && (
            <Typography variant="body2" display="flex" alignItems="center" mb={1}>
              <SpeedIcon sx={{ mr: 1, fontSize: 16 }} />
              Max Speed: {machine.spindle_speed_max} RPM
            </Typography>
          )}
          {machine.tool_capacity && (
            <Typography variant="body2" display="flex" alignItems="center" mb={1}>
              <StorageIcon sx={{ mr: 1, fontSize: 16 }} />
              Tool Capacity: {machine.tool_capacity}
            </Typography>
          )}
          {machine.efficiency_modifier && machine.efficiency_modifier !== 1.00 && (
            <Typography variant="body2" display="flex" alignItems="center" mb={1}>
              <SpeedIcon sx={{ mr: 1, fontSize: 16 }} />
              Efficiency: {machine.efficiency_modifier}x
              {machine.efficiency_modifier > 1.0 && (
                <Chip 
                  label={`+${((machine.efficiency_modifier - 1) * 100).toFixed(0)}%`} 
                  size="small" 
                  color="success" 
                  sx={{ ml: 1 }}
                />
              )}
              {machine.efficiency_modifier < 1.0 && (
                <Chip 
                  label={`${((machine.efficiency_modifier - 1) * 100).toFixed(0)}%`} 
                  size="small" 
                  color="warning" 
                  sx={{ ml: 1 }}
                />
              )}
            </Typography>
          )}
        </Box>

        {machine.capabilities && machine.capabilities.length > 0 && (
          <Box mb={2}>
            <Typography variant="body2" gutterBottom>
              <strong>Capabilities:</strong>
            </Typography>
            <Box display="flex" flexWrap="wrap" gap={0.5}>
              {machine.capabilities.slice(0, 3).map((capability, index) => (
                <Chip
                  key={index}
                  label={capability}
                  size="small"
                  variant="outlined"
                />
              ))}
              {machine.capabilities.length > 3 && (
                <Chip
                  label={`+${machine.capabilities.length - 3} more`}
                  size="small"
                  variant="outlined"
                />
              )}
            </Box>
          </Box>
        )}

        <Divider sx={{ my: 2 }} />

        <Box display="flex" justifyContent="space-between" alignItems="center">
          <Typography variant="body2" color="textSecondary">
            {machine.active_schedules || 0} active schedules
          </Typography>
          <Box>
            <Tooltip title="Manage Operators">
              <IconButton size="small" onClick={() => handleOpenOperatorDialog(machine)}>
                <AssignmentIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title="Edit Machine">
              <IconButton size="small" onClick={() => handleOpenDialog(machine)}>
                <EditIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title="Delete Machine">
              <IconButton size="small" onClick={() => handleDelete(machine)}>
                <DeleteIcon />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );

  const GroupCard = ({ group }) => (
    <Card>
      <CardContent>
        <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
          <Box display="flex" alignItems="center">
            <Avatar sx={{ mr: 2, bgcolor: 'secondary.main' }}>
              <GroupIcon />
            </Avatar>
            <Box>
              <Typography variant="h6" component="div">
                {group.name}
              </Typography>
              <Typography variant="body2" color="textSecondary">
                {group.machine_count || 0} machines
              </Typography>
            </Box>
          </Box>
          <Box>
            <Tooltip title="Edit Group">
              <IconButton size="small" onClick={() => handleOpenGroupDialog(group)}>
                <EditIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title="Delete Group">
              <IconButton size="small" onClick={() => handleDeleteGroup(group)}>
                <DeleteIcon />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>
        
        {group.description && (
          <Typography variant="body2" color="textSecondary">
            {group.description}
          </Typography>
        )}
      </CardContent>
    </Card>
  );

  if (loading) {
    return (
      <Box>
        <LinearProgress />
        <Typography variant="h6" sx={{ mt: 2 }}>
          Loading machines...
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
          height={36}
        />
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="h4" gutterBottom={false}>
            Machine Directory
          </Typography>
          <Typography variant="subtitle1" color="text.secondary">
            Manage CNC machines and equipment groups
          </Typography>
        </Box>
        <Box>
          <Button
            variant="outlined"
            startIcon={<ScheduleIcon />}
            onClick={handleOpenAvailabilityMatrix}
            sx={{ mr: 2 }}
          >
            Availability Matrix
          </Button>
          <Button
            variant="outlined"
            startIcon={<GroupIcon />}
            onClick={() => handleOpenGroupDialog()}
            sx={{ mr: 2 }}
          >
            Add Group
          </Button>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => handleOpenDialog()}
          >
            Add Machine
          </Button>
        </Box>
      </Box>

      {/* Machine Groups */}
      <Typography variant="h5" gutterBottom sx={{ mt: 4 }}>
        Machine Groups
      </Typography>
      <Grid container spacing={2} mb={4}>
        {machineGroups.map((group) => (
          <Grid item xs={12} sm={6} md={4} lg={3} key={group.id}>
            <GroupCard group={group} />
          </Grid>
        ))}
      </Grid>

      {/* Machines by Group */}
      {machineGroups.map((group) => {
        const groupMachines = machines.filter(machine => 
          machine.groups && machine.groups.some(g => g.id === group.id)
        );
        
        return (
          <Accordion key={group.id} defaultExpanded>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Box display="flex" alignItems="center">
                <GroupIcon sx={{ mr: 1 }} />
                <Typography variant="h6">
                  {group.name} ({groupMachines.length} machines)
                </Typography>
              </Box>
            </AccordionSummary>
            <AccordionDetails>
              <Grid container spacing={3}>
                {groupMachines.map((machine) => (
                  <Grid item xs={12} sm={6} md={4} lg={3} key={machine.id}>
                    <MachineCard machine={machine} />
                  </Grid>
                ))}
                {groupMachines.length === 0 && (
                  <Grid item xs={12}>
                    <Alert severity="info">
                      No machines in this group. Add a machine to get started.
                    </Alert>
                  </Grid>
                )}
              </Grid>
            </AccordionDetails>
          </Accordion>
        );
      })}

      {/* Unassigned Machines */}
      {machines.filter(machine => !machine.groups || machine.groups.length === 0).length > 0 && (
        <Accordion defaultExpanded>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Box display="flex" alignItems="center">
              <SettingsIcon sx={{ mr: 1 }} />
              <Typography variant="h6">
                Unassigned Machines ({machines.filter(machine => !machine.groups || machine.groups.length === 0).length})
              </Typography>
            </Box>
          </AccordionSummary>
          <AccordionDetails>
            <Grid container spacing={3}>
              {machines
                .filter(machine => !machine.groups || machine.groups.length === 0)
                .map((machine) => (
                  <Grid item xs={12} sm={6} md={4} lg={3} key={machine.id}>
                    <MachineCard machine={machine} />
                  </Grid>
                ))}
            </Grid>
          </AccordionDetails>
        </Accordion>
      )}

      {/* Machine Form Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          {editingMachine ? 'Edit Machine' : 'Add New Machine'}
        </DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Machine Name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Model"
                value={formData.model}
                onChange={(e) => setFormData({ ...formData, model: e.target.value })}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Manufacturer"
                value={formData.manufacturer}
                onChange={(e) => setFormData({ ...formData, manufacturer: e.target.value })}
                placeholder="e.g., Haas, Mazak, Custom Build, etc."
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Machine Groups</InputLabel>
                <Select
                  multiple
                  value={formData.machine_group_ids}
                  onChange={(e) => setFormData({ ...formData, machine_group_ids: e.target.value })}
                  renderValue={(selected) => (
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                      {selected.map((value) => {
                        const group = machineGroups.find(g => g.id === value);
                        return <Chip key={value} label={group ? group.name : value} size="small" />;
                      })}
                    </Box>
                  )}
                >
                  {machineGroups.map((group) => (
                    <MenuItem key={group.id} value={group.id}>{group.name}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Max Workpiece Size"
                value={formData.max_workpiece_size}
                onChange={(e) => setFormData({ ...formData, max_workpiece_size: e.target.value })}
                placeholder="e.g., 24&quot; x 12&quot; x 8&quot;"
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Max Spindle Speed (RPM)"
                type="number"
                value={formData.spindle_speed_max}
                onChange={(e) => setFormData({ ...formData, spindle_speed_max: e.target.value })}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Tool Capacity"
                type="number"
                value={formData.tool_capacity}
                onChange={(e) => setFormData({ ...formData, tool_capacity: e.target.value })}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Location"
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Efficiency Modifier"
                type="number"
                inputProps={{ min: 0.01, max: 2.00, step: 0.01 }}
                value={formData.efficiency_modifier}
                onChange={(e) => setFormData({ ...formData, efficiency_modifier: parseFloat(e.target.value) || 1.00 })}
                helperText="Machine efficiency multiplier (1.00 = normal, 1.20 = 20% more efficient)"
              />
            </Grid>
            <Grid item xs={12}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={formData.assignToAllEmployees}
                    onChange={(e) => setFormData({ ...formData, assignToAllEmployees: e.target.checked })}
                    color="primary"
                  />
                }
                label={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <GroupIcon fontSize="small" />
                    <Typography>
                      Assign ALL EMPLOYEES to this machine
                      <Typography variant="caption" display="block" sx={{ color: 'text.secondary' }}>
                        This will automatically create operator assignments for all active employees
                      </Typography>
                    </Typography>
                  </Box>
                }
              />
            </Grid>
            <Grid item xs={12}>
              <FormControl fullWidth>
                <InputLabel>Capabilities</InputLabel>
                <Select
                  multiple
                  value={formData.capabilities}
                  onChange={(e) => setFormData({ ...formData, capabilities: e.target.value })}
                  renderValue={(selected) => (
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                      {selected.map((value) => (
                        <Chip key={value} label={value} size="small" />
                      ))}
                    </Box>
                  )}
                >
                  {capabilities.map((capability) => (
                    <MenuItem key={capability} value={capability}>
                      {capability}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Notes"
                multiline
                rows={3}
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              />
            </Grid>
            <Grid item xs={12}>
              <FormControl fullWidth>
                <InputLabel>Status</InputLabel>
                <Select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                >
                  {statuses.map((status) => (
                    <MenuItem key={status} value={status}>
                      {status.charAt(0).toUpperCase() + status.slice(1)}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleSubmit} variant="contained">
            {editingMachine ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Group Form Dialog */}
      <Dialog open={groupDialogOpen} onClose={() => setGroupDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          {editingGroup ? 'Edit Machine Group' : 'Add New Machine Group'}
        </DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Group Name"
                value={groupFormData.name}
                onChange={(e) => setGroupFormData({ ...groupFormData, name: e.target.value })}
                required
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Description"
                multiline
                rows={3}
                value={groupFormData.description}
                onChange={(e) => setGroupFormData({ ...groupFormData, description: e.target.value })}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setGroupDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleGroupSubmit} variant="contained">
            {editingGroup ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Operator Assignment Dialog */}
      <Dialog open={operatorDialogOpen} onClose={() => setOperatorDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          Manage Operators - {selectedMachine?.name}
        </DialogTitle>
        <DialogContent>
          <Tabs value={activeTab} onChange={(e, newValue) => setActiveTab(newValue)} sx={{ mb: 2 }}>
            <Tab label="Assign Operator" />
            <Tab label="Current Operators" />
          </Tabs>

          {activeTab === 0 && (
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth>
                  <InputLabel>Employee</InputLabel>
                  <Select
                    value={operatorFormData.employee_id}
                    onChange={(e) => setOperatorFormData({ ...operatorFormData, employee_id: e.target.value })}
                  >
                    {employees
                      .filter(emp => emp.status === 'active')
                      .filter(emp => !machineOperators.some(op => op.employee_id === emp.id))
                      .map((employee) => (
                        <MenuItem key={employee.id} value={employee.id}>
                          {employee.first_name} {employee.last_name} ({employee.employee_id})
                        </MenuItem>
                      ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={4}>
                <FormControl fullWidth>
                  <InputLabel>Proficiency Level</InputLabel>
                  <Select
                    value={operatorFormData.proficiency_level}
                    onChange={(e) => setOperatorFormData({ ...operatorFormData, proficiency_level: e.target.value })}
                  >
                    <MenuItem value="trained">Trained</MenuItem>
                    <MenuItem value="expert">Expert</MenuItem>
                    <MenuItem value="certified">Certified</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={4}>
                <FormControl fullWidth>
                  <InputLabel>Preference Rank</InputLabel>
                  <Select
                    value={operatorFormData.preference_rank}
                    onChange={(e) => setOperatorFormData({ ...operatorFormData, preference_rank: parseInt(e.target.value, 10) })}
                  >
                    <MenuItem value={1}>1st Choice</MenuItem>
                    <MenuItem value={2}>2nd Choice</MenuItem>
                    <MenuItem value={3}>3rd Choice</MenuItem>
                    <MenuItem value={4}>4th Choice</MenuItem>
                    <MenuItem value={5}>5th Choice</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={6}>
                <DatePicker
                  label="Training Date"
                  value={operatorFormData.training_date}
                  onChange={(date) => setOperatorFormData({ ...operatorFormData, training_date: date })}
                  renderInput={(params) => <TextField {...params} fullWidth />}
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Notes"
                  multiline
                  rows={3}
                  value={operatorFormData.notes}
                  onChange={(e) => setOperatorFormData({ ...operatorFormData, notes: e.target.value })}
                />
              </Grid>
            </Grid>
          )}

          {activeTab === 1 && (
            <Box>
              {machineOperators.length > 0 ? (
                <List>
                  {machineOperators.map((operator) => (
                    <ListItem key={operator.id} divider>
                      <ListItemAvatar>
                        <Avatar>
                          {operator.first_name.charAt(0)}{operator.last_name.charAt(0)}
                        </Avatar>
                      </ListItemAvatar>
                      <ListItemText
                        primary={`${operator.first_name} ${operator.last_name}`}
                        secondary={
                          <Box>
                            <Typography variant="body2">
                              ID: {operator.employee_id} • {operator.position}
                            </Typography>
                            <Box sx={{ display: 'flex', gap: 1, mt: 0.5 }}>
                              <Chip 
                                label={`${operator.preference_rank}${operator.preference_rank === 1 ? 'st' : operator.preference_rank === 2 ? 'nd' : operator.preference_rank === 3 ? 'rd' : 'th'} Choice`}
                                size="small" 
                                color="secondary"
                                variant="outlined"
                              />
                              <Chip 
                                label={operator.proficiency_level} 
                                size="small" 
                                color={operator.proficiency_level === 'certified' ? 'success' : 
                                       operator.proficiency_level === 'expert' ? 'primary' : 'default'}
                              />
                            </Box>
                            {operator.training_date && (
                              <Typography variant="caption" display="block">
                                Trained: {format(parseISO(operator.training_date), 'MMM dd, yyyy')}
                              </Typography>
                            )}
                          </Box>
                        }
                      />
                      <ListItemSecondaryAction>
                        <IconButton 
                          edge="end" 
                          onClick={() => handleRemoveOperator(operator.id)}
                          color="error"
                        >
                          <DeleteIcon />
                        </IconButton>
                      </ListItemSecondaryAction>
                    </ListItem>
                  ))}
                </List>
              ) : (
                <Alert severity="info">
                  No operators assigned to this machine.
                </Alert>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOperatorDialogOpen(false)}>Close</Button>
          {activeTab === 0 && (
            <Button 
              onClick={handleOperatorSubmit} 
              variant="contained"
              disabled={!operatorFormData.employee_id}
            >
              Assign Operator
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* Availability Matrix Dialog */}
      <Dialog open={availabilityMatrixOpen} onClose={() => setAvailabilityMatrixOpen(false)} maxWidth="xl" fullWidth>
        <DialogTitle>
          Operator-Machine Availability Matrix
          <Box sx={{ mt: 1 }}>
            <DatePicker
              label="Select Date"
              value={selectedDate}
              onChange={(date) => {
                setSelectedDate(date);
                // Refresh matrix for new date
                if (date) {
                  apiService.machines.getAvailabilityMatrix({
                    date: format(date, 'yyyy-MM-dd')
                  }).then(response => {
                    setAvailabilityMatrix(response.data);
                  }).catch(error => {
                    console.error('Error refreshing matrix:', error);
                  });
                }
              }}
              renderInput={(params) => <TextField {...params} size="small" sx={{ width: 200 }} />}
            />
          </Box>
        </DialogTitle>
        <DialogContent>
          <TableContainer component={Paper} sx={{ maxHeight: 600 }}>
            <Table stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell>Machine</TableCell>
                  <TableCell>Operators</TableCell>
                  <TableCell>Availability Status</TableCell>
                  <TableCell>Work Hours</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {availabilityMatrix.map((machine) => (
                  <TableRow key={machine.id}>
                    <TableCell>
                      <Box>
                        <Typography variant="subtitle2">{machine.name}</Typography>
                        <Typography variant="caption" color="textSecondary">
                          {machine.model}
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell>
                      {machine.operators && machine.operators.length > 0 ? (
                        <Box>
                          {machine.operators.map((operator) => (
                            <Box key={operator.employee_id} sx={{ mb: 1 }}>
                              <Typography variant="body2">
                                {operator.first_name} {operator.last_name}
                              </Typography>
                              <Chip 
                                label={operator.proficiency_level} 
                                size="small" 
                                color={operator.proficiency_level === 'certified' ? 'success' : 
                                       operator.proficiency_level === 'expert' ? 'primary' : 'default'}
                              />
                            </Box>
                          ))}
                        </Box>
                      ) : (
                        <Typography variant="body2" color="textSecondary">
                          No operators assigned
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      {machine.operators && machine.operators.length > 0 ? (
                        <Box>
                          {machine.operators.map((operator) => {
                            const availability = operator.availability;
                            let statusIcon = <CheckCircleIcon color="success" />;
                            let statusText = 'Available';
                            let statusColor = 'success';
                            
                            if (availability) {
                              if (availability.status === 'unavailable') {
                                statusIcon = <CancelIcon color="error" />;
                                statusText = 'Unavailable';
                                statusColor = 'error';
                              } else if (availability.status === 'vacation') {
                                statusIcon = <WarningIcon color="warning" />;
                                statusText = 'Vacation';
                                statusColor = 'warning';
                              } else if (availability.status === 'sick') {
                                statusIcon = <WarningIcon color="warning" />;
                                statusText = 'Sick';
                                statusColor = 'warning';
                              }
                            }
                            
                            return (
                              <Box key={operator.employee_id} sx={{ mb: 1, display: 'flex', alignItems: 'center' }}>
                                {statusIcon}
                                <Typography variant="body2" sx={{ ml: 1 }}>
                                  {statusText}
                                </Typography>
                              </Box>
                            );
                          })}
                        </Box>
                      ) : (
                        <Typography variant="body2" color="textSecondary">
                          N/A
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      {machine.operators && machine.operators.length > 0 ? (
                        <Box>
                          {machine.operators.map((operator) => {
                            const workSchedule = operator.work_schedule;
                            const availability = operator.availability;
                            
                            let hoursText = 'Standard hours';
                            if (availability && availability.start_time && availability.end_time) {
                              hoursText = `${availability.start_time.slice(0, 5)} - ${availability.end_time.slice(0, 5)}`;
                            } else if (workSchedule && workSchedule.length > 0) {
                              const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
                              const today = new Date().getDay();
                              const todaySchedule = workSchedule.find(ws => ws.day_of_week === (today === 0 ? 7 : today));
                              if (todaySchedule) {
                                hoursText = `${todaySchedule.start_time.slice(0, 5)} - ${todaySchedule.end_time.slice(0, 5)}`;
                              }
                            }
                            
                            return (
                              <Typography key={operator.employee_id} variant="body2" sx={{ mb: 1 }}>
                                {hoursText}
                              </Typography>
                            );
                          })}
                        </Box>
                      ) : (
                        <Typography variant="body2" color="textSecondary">
                          N/A
                        </Typography>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAvailabilityMatrixOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default MachineDirectory;
