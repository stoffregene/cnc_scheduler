import React from 'react';
import { Box, CircularProgress, Alert } from '@mui/material';
import { useAuth } from '../contexts/AuthContext';
import Login from '../pages/Login';

function ProtectedRoute({ children, requireAdmin = false }) {
  const { loading, isAuthenticated, isAdmin } = useAuth();

  // Show loading spinner while checking authentication
  if (loading) {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '100vh',
          background: 'linear-gradient(135deg, #1a1a1a 0%, #2a2a2a 100%)',
        }}
      >
        <CircularProgress size={60} sx={{ color: '#E82A2A' }} />
      </Box>
    );
  }

  // If not authenticated, show login page
  if (!isAuthenticated()) {
    return <Login />;
  }

  // If admin required but user is not admin, show access denied
  if (requireAdmin && !isAdmin()) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">
          Admin access required to view this page.
        </Alert>
      </Box>
    );
  }

  // User is authenticated and has required permissions
  return children;
}

export default ProtectedRoute;