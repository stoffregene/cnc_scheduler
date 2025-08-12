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
  Toolbar,
  Typography,
  Divider,
  Chip,
} from '@mui/material';
import {
  Menu as MenuIcon,
  Dashboard as DashboardIcon,
  Work as WorkIcon,
  Schedule as ScheduleIcon,
  People as PeopleIcon,
  Build as BuildIcon,
  Visibility as VisibilityIcon,
} from '@mui/icons-material';
import ThemeToggle from './components/ThemeToggle';
import { Routes, Route, useLocation } from 'react-router-dom';

import Dashboard from './pages/Dashboard';
import JobManagement from './pages/JobManagement';
import ScheduleView from './pages/ScheduleView';
import MachineQueues from './pages/MachineQueues';
import EmployeeDirectory from './pages/EmployeeDirectory';
import MachineDirectory from './pages/MachineDirectory';
import OperatorSchedule from './pages/OperatorSchedule';
import Scheduling from './pages/Scheduling';
import Logo from './components/Logo';

const drawerWidth = 240;

const menuItems = [
  { text: 'Dashboard', icon: <DashboardIcon />, path: '/' },
  { text: 'Job Management', icon: <WorkIcon />, path: '/jobs' },
  { text: 'Scheduling', icon: <ScheduleIcon />, path: '/scheduling' },
  { text: 'Schedule View', icon: <ScheduleIcon />, path: '/schedule' },
  { text: 'Machine Queues', icon: <BuildIcon />, path: '/machine-queues' },
  { text: 'Employee Directory', icon: <PeopleIcon />, path: '/employees' },
  { text: 'Operator Schedule', icon: <VisibilityIcon />, path: '/operator-schedule' },
  { text: 'Machine Directory', icon: <BuildIcon />, path: '/machines' },
];

function App() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  const drawer = (
    <Box>
      <Toolbar sx={{ 
        display: 'flex', 
        flexDirection: 'column', 
        alignItems: 'center',
        py: 2
      }}>
        <Logo 
          variant="horizontal" 
          color="auto" 
          height={32} 
          sx={{ mb: 1 }}
        />
        <Typography 
          variant="subtitle2" 
          component="div" 
          sx={{ 
            fontWeight: 500,
            color: 'text.secondary',
            textAlign: 'center'
          }}
        >
        </Typography>
      </Toolbar>
      <Divider />
      <Box sx={{ p: 2 }}>
        <Chip 
          label="Management Application" 
          color="primary" 
          size="small" 
          variant="outlined"
          sx={{ 
            borderRadius: 2,
            fontWeight: 500,
            fontSize: '0.75rem'
          }}
        />
      </Box>
      <Divider />
      <List>
        {menuItems.map((item) => (
          <ListItem
            button
            key={item.text}
            component="a"
            href={item.path}
            selected={location.pathname === item.path}
            sx={{
              '&.Mui-selected': {
                backgroundColor: 'primary.light',
                '&:hover': {
                  backgroundColor: 'primary.light',
                },
              },
            }}
          >
            <ListItemIcon sx={{ color: location.pathname === item.path ? 'primary.main' : 'inherit' }}>
              {item.icon}
            </ListItemIcon>
            <ListItemText 
              primary={item.text} 
              sx={{ 
                color: location.pathname === item.path ? 'primary.main' : 'inherit',
                fontWeight: location.pathname === item.path ? 'bold' : 'normal'
              }}
            />
          </ListItem>
        ))}
      </List>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex' }}>
      <AppBar
        position="fixed"
        sx={{
          width: { md: `calc(100% - ${drawerWidth}px)` },
          ml: { md: `${drawerWidth}px` },
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
            <Typography variant="h6" noWrap component="div" sx={{ fontWeight: 600 }}>
              {menuItems.find(item => item.path === location.pathname)?.text || 'CNC Manufacturing Scheduler'}
            </Typography>
          </Box>
          <Box sx={{ display: { xs: 'flex', md: 'none' }, alignItems: 'center' }}>
            <ThemeToggle />
          </Box>
          <Box sx={{ display: { xs: 'none', md: 'flex' }, alignItems: 'center' }}>
            <Logo 
              variant="horizontal" 
              color="white" 
              height={28}
              sx={{ opacity: 0.9 }}
            />
            <ThemeToggle />
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
            <Route path="/employees" element={<EmployeeDirectory />} />
            <Route path="/operator-schedule" element={<OperatorSchedule />} />
            <Route path="/machines" element={<MachineDirectory />} />
          </Routes>
      </Box>
    </Box>
  );
}

export default App;
