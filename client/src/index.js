import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { Toaster } from 'react-hot-toast';
import './index.css';
import './styles/globalStyles.css';

import App from './App';
import { createAppTheme } from './themes/theme';
import { AuthProvider } from './contexts/AuthContext';

// Theme wrapper component
const ThemedApp = () => {
  // Use dark mode by default to match the current app design
  const theme = createAppTheme(true);
  
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AuthProvider>
        <App />
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 4000,
            style: {
              background: 'linear-gradient(135deg, #131823 0%, #1a2030 100%)',
              color: '#e4e6eb',
              border: '1px solid rgba(0, 212, 255, 0.2)',
              borderRadius: '8px',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
            },
            success: {
              style: {
                background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.2) 0%, rgba(16, 185, 129, 0.1) 100%)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                color: '#10b981',
              },
            },
            error: {
              style: {
                background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.2) 0%, rgba(239, 68, 68, 0.1) 100%)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#ef4444',
              },
            },
          }}
        />
      </AuthProvider>
    </ThemeProvider>
  );
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <BrowserRouter>
      <LocalizationProvider dateAdapter={AdapterDateFns}>
        <ThemedApp />
      </LocalizationProvider>
    </BrowserRouter>
  </React.StrictMode>
);
