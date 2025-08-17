import React, { useState } from 'react';
import {
  Box,
  Paper,
  TextField,
  Button,
  Typography,
  Alert,
  Fade,
  CircularProgress,
} from '@mui/material';
import { Lock as LockIcon } from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';
import Logo from '../components/Logo';

function Login() {
  const [credentials, setCredentials] = useState({
    username: '',
    password: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const { login } = useAuth();

  const handleChange = (e) => {
    setCredentials({
      ...credentials,
      [e.target.name]: e.target.value
    });
    setError(''); // Clear error when user types
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!credentials.username || !credentials.password) {
      setError('Please enter both username and password');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await login(credentials.username, credentials.password);
    } catch (err) {
      setError(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #1a1a1a 0%, #2a2a2a 100%)',
        padding: 3,
      }}
    >
      <Fade in timeout={800}>
        <Paper
          elevation={24}
          sx={{
            p: 6,
            width: '100%',
            maxWidth: 450,
            background: 'linear-gradient(145deg, #2a2a2a 0%, #1e1e1e 100%)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: 3,
          }}
        >
          {/* Header */}
          <Box sx={{ textAlign: 'center', mb: 4 }}>
            <Logo
              variant="stacked"
              color="white"
              height={60}
              sx={{ mb: 3 }}
            />
            <Typography
              variant="h4"
              sx={{
                fontWeight: 700,
                background: 'linear-gradient(135deg, #E82A2A 0%, #B71C1C 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                mb: 1,
              }}
            >
              Sign In
            </Typography>
          </Box>

          {/* Error Alert */}
          {error && (
            <Alert 
              severity="error" 
              sx={{ 
                mb: 3,
                backgroundColor: 'rgba(220, 38, 38, 0.1)',
                border: '1px solid rgba(220, 38, 38, 0.2)',
                color: '#f87171',
                '& .MuiAlert-icon': {
                  color: '#f87171'
                }
              }}
            >
              {error}
            </Alert>
          )}

          {/* Login Form */}
          <Box component="form" onSubmit={handleSubmit}>
            <TextField
              fullWidth
              name="username"
              label="Username or Email"
              value={credentials.username}
              onChange={handleChange}
              disabled={loading}
              sx={{
                mb: 3,
                '& .MuiOutlinedInput-root': {
                  backgroundColor: 'rgba(255, 255, 255, 0.02)',
                  '& fieldset': {
                    borderColor: 'rgba(255, 255, 255, 0.1)',
                  },
                  '&:hover fieldset': {
                    borderColor: 'rgba(255, 255, 255, 0.2)',
                  },
                  '&.Mui-focused fieldset': {
                    borderColor: '#E82A2A',
                  },
                  '&:hover': {
                    backgroundColor: 'rgba(255, 255, 255, 0.04)',
                  },
                  '&.Mui-focused': {
                    backgroundColor: 'rgba(255, 255, 255, 0.06)',
                  },
                },
                '& .MuiInputLabel-root': {
                  color: '#9ca3af',
                  '&.Mui-focused': {
                    color: '#E82A2A',
                  },
                  '&.MuiInputLabel-shrink': {
                    transform: 'translate(14px, -9px) scale(0.75)',
                    backgroundColor: '#2a2a2a',
                    padding: '0 4px',
                  },
                },
                '& .MuiOutlinedInput-input': {
                  color: '#e4e6eb',
                },
              }}
            />
            
            <TextField
              fullWidth
              name="password"
              label="Password"
              type="password"
              value={credentials.password}
              onChange={handleChange}
              disabled={loading}
              sx={{
                mb: 4,
                '& .MuiOutlinedInput-root': {
                  backgroundColor: 'rgba(255, 255, 255, 0.02)',
                  '& fieldset': {
                    borderColor: 'rgba(255, 255, 255, 0.1)',
                  },
                  '&:hover fieldset': {
                    borderColor: 'rgba(255, 255, 255, 0.2)',
                  },
                  '&.Mui-focused fieldset': {
                    borderColor: '#E82A2A',
                  },
                  '&:hover': {
                    backgroundColor: 'rgba(255, 255, 255, 0.04)',
                  },
                  '&.Mui-focused': {
                    backgroundColor: 'rgba(255, 255, 255, 0.06)',
                  },
                },
                '& .MuiInputLabel-root': {
                  color: '#9ca3af',
                  '&.Mui-focused': {
                    color: '#E82A2A',
                  },
                  '&.MuiInputLabel-shrink': {
                    transform: 'translate(14px, -9px) scale(0.75)',
                    backgroundColor: '#2a2a2a',
                    padding: '0 4px',
                  },
                },
                '& .MuiOutlinedInput-input': {
                  color: '#e4e6eb',
                },
              }}
            />

            <Button
              type="submit"
              fullWidth
              variant="contained"
              disabled={loading}
              startIcon={loading ? <CircularProgress size={16} /> : <LockIcon />}
              sx={{
                py: 1.5,
                fontWeight: 600,
                background: 'linear-gradient(135deg, #E82A2A 0%, #B71C1C 100%)',
                '&:hover': {
                  background: 'linear-gradient(135deg, #DC2626 0%, #991B1B 100%)',
                },
                '&:disabled': {
                  background: 'rgba(156, 163, 175, 0.3)',
                  color: 'rgba(156, 163, 175, 0.5)',
                },
              }}
            >
              {loading ? 'Signing In...' : 'Sign In'}
            </Button>
          </Box>

        </Paper>
      </Fade>
    </Box>
  );
}

export default Login;