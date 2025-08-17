import React, { useState, Suspense, lazy } from 'react';
import {
  AppBar,
  Box,
  Drawer,
  IconButton,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  ListItemButton,
  Toolbar,
  Typography,
  Avatar,
  Collapse,
  Tooltip,
  CircularProgress,
} from '@mui/material';
import {
  Menu as MenuIcon,
  Dashboard as DashboardIcon,
  Work as WorkIcon,
  Schedule as ScheduleIcon,
  People as PeopleIcon,
  Build as BuildIcon,
  Visibility as VisibilityIcon,
  Settings as SettingsIcon,
  ExpandLess,
  ExpandMore,
  ViewKanban as ViewKanbanIcon,
  CalendarToday as CalendarIcon,
  Factory as FactoryIcon,
  SwapHoriz as SwapHorizIcon,
  Search as SearchIcon,
  AdminPanelSettings as AdminIcon,
  Logout as LogoutIcon,
} from '@mui/icons-material';
import { Routes, Route, useLocation } from 'react-router-dom';
import Logo from './components/Logo';
import ProtectedRoute from './components/ProtectedRoute';
import PermissionGuard from './components/PermissionGuard';
import { useAuth } from './contexts/AuthContext';
import { usePermissions } from './hooks/usePermissions';

// Lazy load page components for better bundle splitting
const Dashboard = lazy(() => import('./pages/Dashboard'));
const JobManagement = lazy(() => import('./pages/JobManagement'));
const ScheduleView = lazy(() => import('./pages/ScheduleView'));
const MachineQueues = lazy(() => import('./pages/MachineQueues'));
const EmployeeDirectory = lazy(() => import('./pages/EmployeeDirectory'));
const MachineDirectory = lazy(() => import('./pages/MachineDirectory'));
const OperatorSchedule = lazy(() => import('./pages/OperatorSchedule'));
const Scheduling = lazy(() => import('./pages/Scheduling'));
const DisplacementLogs = lazy(() => import('./pages/DisplacementLogs'));
const InspectionQueue = lazy(() => import('./pages/InspectionQueue'));
const UserManagement = lazy(() => import('./pages/UserManagement'));

const drawerWidth = 280;

const getMenuItems = (permissions) => {
  const items = [
    { 
      text: 'Dashboard', 
      icon: <DashboardIcon />, 
      path: '/',
      category: 'main',
      permission: 'dashboard.view'
    }
  ];

  // Production Planning section
  const productionChildren = [];
  if (permissions['jobs.view']) {
    productionChildren.push({ text: 'Job Management', icon: <WorkIcon />, path: '/jobs', permission: 'jobs.view' });
  }
  if (permissions['schedules.auto_schedule']) {
    productionChildren.push({ text: 'Scheduling Engine', icon: <ScheduleIcon />, path: '/scheduling', permission: 'schedules.auto_schedule' });
  }
  if (permissions['schedules.view']) {
    productionChildren.push({ text: 'Schedule Calendar', icon: <CalendarIcon />, path: '/schedule', permission: 'schedules.view' });
  }
  if (permissions['machines.view_queues']) {
    productionChildren.push({ text: 'Machine Queues', icon: <ViewKanbanIcon />, path: '/machine-queues', permission: 'machines.view_queues' });
  }
  if (permissions['inspection.view']) {
    productionChildren.push({ text: 'Inspection Queue', icon: <SearchIcon />, path: '/inspection-queue', permission: 'inspection.view' });
  }
  if (permissions['displacement.view']) {
    productionChildren.push({ text: 'Displacement Logs', icon: <SwapHorizIcon />, path: '/displacement-logs', permission: 'displacement.view' });
  }

  if (productionChildren.length > 0) {
    items.push({
      text: 'Production Planning',
      icon: <FactoryIcon />,
      category: 'section',
      children: productionChildren
    });
  }

  // Resource Management section
  const resourceChildren = [];
  if (permissions['employees.view']) {
    resourceChildren.push({ text: 'Employee Directory', icon: <PeopleIcon />, path: '/employees', permission: 'employees.view' });
  }
  if (permissions['employees.view_schedules']) {
    resourceChildren.push({ text: 'Operator Schedules', icon: <VisibilityIcon />, path: '/operator-schedule', permission: 'employees.view_schedules' });
  }
  if (permissions['machines.view']) {
    resourceChildren.push({ text: 'Machine Directory', icon: <BuildIcon />, path: '/machines', permission: 'machines.view' });
  }

  if (resourceChildren.length > 0) {
    items.push({
      text: 'Resource Management',
      icon: <PeopleIcon />,
      category: 'section',
      children: resourceChildren
    });
  }

  // Administration section
  const adminChildren = [];
  if (permissions['users.view']) {
    adminChildren.push({ text: 'User Management', icon: <AdminIcon />, path: '/users', permission: 'users.view' });
  }

  if (adminChildren.length > 0) {
    items.push({
      text: 'Administration',
      icon: <AdminIcon />,
      category: 'section',
      children: adminChildren
    });
  }

  return items;
};

function App() {
  const { user, logout } = useAuth();
  const { permissions, can } = usePermissions();
  const [mobileOpen, setMobileOpen] = useState(false);
  
  // Load saved sidebar state from localStorage or use defaults
  const [expandedSections, setExpandedSections] = useState(() => {
    const saved = localStorage.getItem('sidebarExpandedSections');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Failed to parse saved sidebar state:', e);
      }
    }
    return { 'Production Planning': true, 'Resource Management': true, 'Administration': true };
  });
  
  const location = useLocation();
  const menuItems = getMenuItems(permissions || {});

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  const handleSectionToggle = (section) => {
    setExpandedSections(prev => {
      const newState = {
        ...prev,
        [section]: !prev[section]
      };
      // Save to localStorage
      localStorage.setItem('sidebarExpandedSections', JSON.stringify(newState));
      return newState;
    });
  };

  const getCurrentPageTitle = () => {
    for (const item of menuItems) {
      if (item.children) {
        const childItem = item.children.find(child => child.path === location.pathname);
        if (childItem) return childItem.text;
      } else if (item.path === location.pathname) {
        return item.text;
      }
    }
    return 'CNC Manufacturing Scheduler';
  };

  const drawer = (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'linear-gradient(180deg, #1a1a1a 0%, #2a2a2a 100%)' }}>
      {/* Header Section */}
      <Box sx={{ p: 3, borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <Logo 
            variant="horizontal" 
            color="white" 
            height={40}
            sx={{ mr: 2 }}
          />
        </Box>
        
      </Box>

      {/* Navigation */}
      <Box sx={{ flex: 1, overflow: 'auto', py: 1 }}>
        <List sx={{ px: 2 }}>
          {menuItems.map((item, index) => {
            if (item.category === 'main') {
              const isSelected = location.pathname === item.path;
              return (
                <ListItem key={item.text} disablePadding sx={{ mb: 1 }}>
                  <ListItemButton
                    component="a"
                    href={item.path}
                    selected={isSelected}
                    sx={{
                      borderRadius: 2,
                      px: 2,
                      py: 1.5,
                      minHeight: 48,
                      '&.Mui-selected': {
                        background: 'linear-gradient(135deg, rgba(232, 42, 42, 0.15) 0%, rgba(232, 42, 42, 0.05) 100%)',
                        border: '1px solid rgba(232, 42, 42, 0.2)',
                        '&:hover': {
                          background: 'linear-gradient(135deg, rgba(232, 42, 42, 0.2) 0%, rgba(232, 42, 42, 0.1) 100%)',
                        }
                      },
                      '&:hover': {
                        backgroundColor: 'rgba(255, 255, 255, 0.05)',
                      }
                    }}
                  >
                    <ListItemIcon sx={{ 
                      minWidth: 40, 
                      color: isSelected ? '#E82A2A' : '#9ca3af'
                    }}>
                      {item.icon}
                    </ListItemIcon>
                    <ListItemText 
                      primary={item.text}
                      primaryTypographyProps={{
                        fontWeight: isSelected ? 600 : 500,
                        fontSize: '0.875rem',
                        color: isSelected ? '#E82A2A' : '#e4e6eb'
                      }}
                    />
                  </ListItemButton>
                </ListItem>
              );
            } else if (item.category === 'section') {
              const isExpanded = expandedSections[item.text];
              const hasSelectedChild = item.children?.some(child => child.path === location.pathname);
              
              return (
                <Box key={item.text} sx={{ mb: 2 }}>
                  {/* Section Header */}
                  <ListItem disablePadding>
                    <ListItemButton
                      onClick={() => handleSectionToggle(item.text)}
                      sx={{
                        borderRadius: 2,
                        px: 2,
                        py: 1,
                        backgroundColor: hasSelectedChild ? 'rgba(232, 42, 42, 0.05)' : 'transparent',
                        border: hasSelectedChild ? '1px solid rgba(232, 42, 42, 0.1)' : '1px solid transparent',
                        '&:hover': {
                          backgroundColor: 'rgba(255, 255, 255, 0.05)',
                        }
                      }}
                    >
                      <ListItemIcon sx={{ 
                        minWidth: 40, 
                        color: hasSelectedChild ? '#E82A2A' : '#9ca3af'
                      }}>
                        {item.icon}
                      </ListItemIcon>
                      <ListItemText 
                        primary={item.text}
                        primaryTypographyProps={{
                          fontWeight: 600,
                          fontSize: '0.8rem',
                          color: hasSelectedChild ? '#E82A2A' : '#9ca3af',
                          textTransform: 'uppercase',
                          letterSpacing: '0.5px'
                        }}
                      />
                      {isExpanded ? 
                        <ExpandLess sx={{ color: '#9ca3af', fontSize: '1.2rem' }} /> : 
                        <ExpandMore sx={{ color: '#9ca3af', fontSize: '1.2rem' }} />
                      }
                    </ListItemButton>
                  </ListItem>
                  
                  {/* Section Children */}
                  <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                    <List disablePadding sx={{ ml: 2, mt: 0.5 }}>
                      {item.children?.map((child) => {
                        const isChildSelected = location.pathname === child.path;
                        return (
                          <ListItem key={child.text} disablePadding sx={{ mb: 0.5 }}>
                            <ListItemButton
                              component="a"
                              href={child.path}
                              selected={isChildSelected}
                              sx={{
                                borderRadius: 2,
                                px: 2,
                                py: 1,
                                minHeight: 40,
                                '&.Mui-selected': {
                                  background: 'linear-gradient(135deg, rgba(232, 42, 42, 0.15) 0%, rgba(232, 42, 42, 0.05) 100%)',
                                  border: '1px solid rgba(232, 42, 42, 0.2)',
                                  '&:hover': {
                                    background: 'linear-gradient(135deg, rgba(232, 42, 42, 0.2) 0%, rgba(232, 42, 42, 0.1) 100%)',
                                  }
                                },
                                '&:hover': {
                                  backgroundColor: 'rgba(255, 255, 255, 0.05)',
                                }
                              }}
                            >
                              <ListItemIcon sx={{ 
                                minWidth: 36, 
                                color: isChildSelected ? '#E82A2A' : '#6b7280'
                              }}>
                                {child.icon}
                              </ListItemIcon>
                              <ListItemText 
                                primary={child.text}
                                primaryTypographyProps={{
                                  fontWeight: isChildSelected ? 600 : 400,
                                  fontSize: '0.8rem',
                                  color: isChildSelected ? '#E82A2A' : '#e4e6eb'
                                }}
                              />
                            </ListItemButton>
                          </ListItem>
                        );
                      })}
                    </List>
                  </Collapse>
                </Box>
              );
            }
            return null;
          })}
        </List>
      </Box>

      {/* Footer */}
      <Box sx={{ p: 2, borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box>
            <Typography variant="caption" sx={{ color: '#6b7280', fontWeight: 500 }}>
              System Status
            </Typography>
            <Typography variant="caption" sx={{ color: '#10b981', display: 'block', fontWeight: 600 }}>
              All Systems Operational
            </Typography>
          </Box>
          <IconButton size="small" sx={{ color: '#9ca3af' }}>
            <SettingsIcon fontSize="small" />
          </IconButton>
        </Box>
      </Box>
      
      <style>
        {`
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
          }
        `}
      </style>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex' }}>
      <AppBar
        position="fixed"
        elevation={0}
        sx={{
          width: { md: `calc(100% - ${drawerWidth}px)` },
          ml: { md: `${drawerWidth}px` },
          background: 'linear-gradient(135deg, #E82A2A 0%, #B71C1C 100%)',
          backdropFilter: 'blur(10px)',
          borderBottom: '1px solid rgba(232, 42, 42, 0.2)',
        }}
      >
        <Toolbar sx={{ justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <IconButton
              color="inherit"
              aria-label="open drawer"
              edge="start"
              onClick={handleDrawerToggle}
              sx={{ mr: 2, display: { md: 'none' } }}
            >
              <MenuIcon />
            </IconButton>
            <Typography variant="h5" noWrap component="div" sx={{ 
              fontWeight: 700, 
              background: 'linear-gradient(135deg, #e4e6eb 0%, #9ca3af 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              letterSpacing: '-0.02em'
            }}>
              {getCurrentPageTitle()}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Tooltip title={`${user?.first_name} ${user?.last_name} (${user?.role})`}>
              <Avatar
                sx={{
                  width: 32,
                  height: 32,
                  background: 'linear-gradient(135deg, #E82A2A 0%, #B71C1C 100%)',
                  fontSize: '0.8rem',
                  fontWeight: 'bold'
                }}
              >
                {user?.first_name?.[0]}{user?.last_name?.[0]}
              </Avatar>
            </Tooltip>
            <Tooltip title="Logout">
              <IconButton 
                onClick={logout}
                sx={{ color: '#9ca3af' }}
              >
                <LogoutIcon />
              </IconButton>
            </Tooltip>
          </Box>
        </Toolbar>
      </AppBar>

      <Box
        component="nav"
        sx={{ width: { md: drawerWidth }, flexShrink: { md: 0 } }}
      >
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={handleDrawerToggle}
          ModalProps={{
            keepMounted: true, // Better open performance on mobile.
          }}
          sx={{
            display: { xs: 'block', md: 'none' },
            '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth },
          }}
        >
          {drawer}
        </Drawer>
        <Drawer
          variant="permanent"
          sx={{
            display: { xs: 'none', md: 'block' },
            '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth },
          }}
          open
        >
          {drawer}
        </Drawer>
      </Box>

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: 3,
          width: { md: `calc(100% - ${drawerWidth}px)` },
          mt: 8,
        }}
      >
        <ProtectedRoute>
          <Suspense fallback={
            <Box sx={{ 
              display: 'flex', 
              flexDirection: 'column',
              justifyContent: 'center', 
              alignItems: 'center', 
              height: '50vh',
              gap: 2
            }}>
              <CircularProgress />
              <Typography variant="h6" sx={{ color: '#e4e6eb' }}>Loading...</Typography>
            </Box>
          }>
            <Routes>
            <Route path="/" element={
              <PermissionGuard permission="dashboard.view">
                <Dashboard />
              </PermissionGuard>
            } />
            <Route path="/jobs" element={
              <PermissionGuard permission="jobs.view">
                <JobManagement />
              </PermissionGuard>
            } />
            <Route path="/scheduling" element={
              <PermissionGuard permission="schedules.auto_schedule">
                <Scheduling />
              </PermissionGuard>
            } />
            <Route path="/schedule" element={
              <PermissionGuard permission="schedules.view">
                <ScheduleView />
              </PermissionGuard>
            } />
            <Route path="/machine-queues" element={
              <PermissionGuard permission="machines.view_queues">
                <MachineQueues />
              </PermissionGuard>
            } />
            <Route path="/inspection-queue" element={
              <PermissionGuard permission="inspection.view">
                <InspectionQueue />
              </PermissionGuard>
            } />
            <Route path="/displacement-logs" element={
              <PermissionGuard permission="displacement.view">
                <DisplacementLogs />
              </PermissionGuard>
            } />
            <Route path="/employees" element={
              <PermissionGuard permission="employees.view">
                <EmployeeDirectory />
              </PermissionGuard>
            } />
            <Route path="/operator-schedule" element={
              <PermissionGuard permission="employees.view_schedules">
                <OperatorSchedule />
              </PermissionGuard>
            } />
            <Route path="/machines" element={
              <PermissionGuard permission="machines.view">
                <MachineDirectory />
              </PermissionGuard>
            } />
            <Route path="/users" element={
              <PermissionGuard permission="users.view">
                <UserManagement />
              </PermissionGuard>
            } />
            </Routes>
          </Suspense>
        </ProtectedRoute>
      </Box>
    </Box>
  );
}

export default App;
