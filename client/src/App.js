import React, { useState } from 'react';
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
  Divider,
  Chip,
  Avatar,
  Badge,
  Collapse,
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
  Notifications as NotificationsIcon,
  ExpandLess,
  ExpandMore,
  ViewKanban as ViewKanbanIcon,
  CalendarToday as CalendarIcon,
  Factory as FactoryIcon,
  SwapHoriz as SwapHorizIcon,
  Search as SearchIcon,
} from '@mui/icons-material';
import { Routes, Route, useLocation } from 'react-router-dom';

import Dashboard from './pages/Dashboard';
import JobManagement from './pages/JobManagement';
import ScheduleView from './pages/ScheduleView';
import MachineQueues from './pages/MachineQueues';
import EmployeeDirectory from './pages/EmployeeDirectory';
import MachineDirectory from './pages/MachineDirectory';
import OperatorSchedule from './pages/OperatorSchedule';
import Scheduling from './pages/Scheduling';
import DisplacementLogs from './pages/DisplacementLogs';
import InspectionQueue from './pages/InspectionQueue';
import Logo from './components/Logo';

const drawerWidth = 280;

const menuItems = [
  { 
    text: 'Dashboard', 
    icon: <DashboardIcon />, 
    path: '/',
    category: 'main'
  },
  { 
    text: 'Production Planning',
    icon: <FactoryIcon />,
    category: 'section',
    children: [
      { text: 'Job Management', icon: <WorkIcon />, path: '/jobs' },
      { text: 'Scheduling Engine', icon: <ScheduleIcon />, path: '/scheduling' },
      { text: 'Schedule Calendar', icon: <CalendarIcon />, path: '/schedule' },
      { text: 'Machine Queues', icon: <ViewKanbanIcon />, path: '/machine-queues' },
      { text: 'Inspection Queue', icon: <SearchIcon />, path: '/inspection-queue' },
      { text: 'Displacement Logs', icon: <SwapHorizIcon />, path: '/displacement-logs' },
    ]
  },
  { 
    text: 'Resource Management',
    icon: <PeopleIcon />,
    category: 'section',
    children: [
      { text: 'Employee Directory', icon: <PeopleIcon />, path: '/employees' },
      { text: 'Operator Schedules', icon: <VisibilityIcon />, path: '/operator-schedule' },
      { text: 'Machine Directory', icon: <BuildIcon />, path: '/machines' },
    ]
  },
];

function App() {
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
    return { 'Production Planning': true, 'Resource Management': true };
  });
  
  const location = useLocation();

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
        
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Chip 
            label="LIVE SYSTEM" 
            size="small" 
            sx={{ 
              background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.2) 0%, rgba(16, 185, 129, 0.1) 100%)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              color: '#10b981',
              fontSize: '0.7rem',
              fontWeight: 600,
              '&::before': {
                content: '""',
                width: 6,
                height: 6,
                borderRadius: '50%',
                backgroundColor: '#10b981',
                marginRight: '4px',
                animation: 'pulse 2s infinite'
              }
            }}
          />
          <Badge color="error" variant="dot">
            <IconButton size="small" sx={{ color: '#9ca3af' }}>
              <NotificationsIcon fontSize="small" />
            </IconButton>
          </Badge>
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
            <Badge color="error" variant="dot">
              <IconButton sx={{ color: '#9ca3af' }}>
                <NotificationsIcon />
              </IconButton>
            </Badge>
            <Avatar
              sx={{
                width: 32,
                height: 32,
                background: 'linear-gradient(135deg, #E82A2A 0%, #B71C1C 100%)',
                fontSize: '0.8rem',
                fontWeight: 'bold'
              }}
            >
              AD
            </Avatar>
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
        <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/jobs" element={<JobManagement />} />
            <Route path="/scheduling" element={<Scheduling />} />
            <Route path="/schedule" element={<ScheduleView />} />
            <Route path="/machine-queues" element={<MachineQueues />} />
            <Route path="/inspection-queue" element={<InspectionQueue />} />
            <Route path="/displacement-logs" element={<DisplacementLogs />} />
            <Route path="/employees" element={<EmployeeDirectory />} />
            <Route path="/operator-schedule" element={<OperatorSchedule />} />
            <Route path="/machines" element={<MachineDirectory />} />
          </Routes>
      </Box>
    </Box>
  );
}

export default App;
