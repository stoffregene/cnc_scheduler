import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { Toaster } from 'react-hot-toast';
import './index.css';

import App from './App';
import { ThemeProvider as AppThemeProvider, useTheme } from './contexts/ThemeContext';
import { createAppTheme } from './themes/theme';

// Theme wrapper component
const ThemedApp = () => {
  const { darkMode } = useTheme();
  const theme = createAppTheme(darkMode);
  
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <App />
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: {
            background: darkMode ? '#2a2a2a' : '#363636',
            color: '#fff',
            border: darkMode ? '1px solid #2d3748' : 'none',
          },
        }}
      />
    </ThemeProvider>
  );
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <BrowserRouter>
      <AppThemeProvider>
        <LocalizationProvider dateAdapter={AdapterDateFns}>
          <ThemedApp />
        </LocalizationProvider>
      </AppThemeProvider>
    </BrowserRouter>
  </React.StrictMode>
);
