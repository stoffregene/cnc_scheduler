import { createTheme } from '@mui/material/styles';

export const createAppTheme = (darkMode) => {
  const isDark = darkMode;
  
  return createTheme({
    palette: {
      mode: isDark ? 'dark' : 'light',
      primary: {
        main: '#E82A2A', // Brand red
        light: isDark ? '#FF5555' : '#FF5555',
        dark: isDark ? '#B71C1C' : '#B71C1C',
        contrastText: '#ffffff',
      },
      secondary: {
        main: '#010101', // Brand black
        light: isDark ? '#424242' : '#424242',
        dark: isDark ? '#000000' : '#000000',
        contrastText: '#ffffff',
      },
      background: {
        default: isDark ? '#010101' : '#F8F9FA',
        paper: isDark ? '#1a1a1a' : '#ffffff',
      },
      surface: {
        main: isDark ? '#2a2a2a' : '#ffffff',
        light: isDark ? '#3a3a3a' : '#F8F9FA',
        dark: isDark ? '#1a1a1a' : '#E5E5E5',
      },
      success: {
        main: '#38a169', // Green for completed tasks
        light: isDark ? '#68d391' : '#68d391',
        dark: isDark ? '#2f855a' : '#2f855a',
      },
      warning: {
        main: '#d69e2e', // Orange for warnings
        light: isDark ? '#f6e05e' : '#f6e05e',
        dark: isDark ? '#b7791f' : '#b7791f',
      },
      error: {
        main: '#e53e3e', // Red for errors
        light: isDark ? '#fc8181' : '#fc8181',
        dark: isDark ? '#c53030' : '#c53030',
      },
      text: {
        primary: isDark ? '#e2e8f0' : '#010101',
        secondary: isDark ? '#a0aec0' : '#666666',
        disabled: isDark ? '#718096' : '#999999',
      },
      divider: isDark ? '#2d3748' : '#E5E5E5',
    },
    typography: {
      fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
      h1: {
        fontWeight: 700,
        fontSize: '2.5rem',
        color: isDark ? '#e2e8f0' : '#010101',
      },
      h2: {
        fontWeight: 600,
        fontSize: '2rem',
        color: isDark ? '#e2e8f0' : '#010101',
      },
      h3: {
        fontWeight: 600,
        fontSize: '1.75rem',
        color: isDark ? '#e2e8f0' : '#010101',
      },
      h4: {
        fontWeight: 600,
        fontSize: '1.5rem',
        color: isDark ? '#e2e8f0' : '#010101',
      },
      h5: {
        fontWeight: 600,
        fontSize: '1.25rem',
        color: isDark ? '#e2e8f0' : '#010101',
      },
      h6: {
        fontWeight: 600,
        fontSize: '1.125rem',
        color: isDark ? '#e2e8f0' : '#010101',
      },
      subtitle1: {
        fontWeight: 500,
        color: isDark ? '#a0aec0' : '#666666',
      },
      subtitle2: {
        fontWeight: 500,
        color: isDark ? '#a0aec0' : '#666666',
      },
      body1: {
        color: isDark ? '#e2e8f0' : '#010101',
      },
      body2: {
        color: isDark ? '#a0aec0' : '#666666',
      },
    },
    components: {
      MuiAppBar: {
        styleOverrides: {
          root: {
            backgroundColor: isDark ? '#1a1a1a' : '#E82A2A',
            boxShadow: isDark 
              ? '0 2px 8px rgba(0, 0, 0, 0.3)' 
              : '0 2px 8px rgba(232, 42, 42, 0.15)',
            borderBottom: isDark ? '1px solid #2d3748' : 'none',
          },
        },
      },
      MuiDrawer: {
        styleOverrides: {
          paper: {
            backgroundColor: isDark ? '#1a1a1a' : '#ffffff',
            borderRight: isDark ? '1px solid #2d3748' : '1px solid #E5E5E5',
            color: isDark ? '#e2e8f0' : '#010101',
          },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            backgroundColor: isDark ? '#2a2a2a' : '#ffffff',
            boxShadow: isDark 
              ? '0 4px 6px rgba(0, 0, 0, 0.3), 0 1px 3px rgba(0, 0, 0, 0.2)' 
              : '0 4px 6px rgba(0, 0, 0, 0.05), 0 1px 3px rgba(0, 0, 0, 0.1)',
            borderRadius: 12,
            border: isDark ? '1px solid #2d3748' : '1px solid #E5E5E5',
          },
        },
      },
      MuiButton: {
        styleOverrides: {
          root: {
            textTransform: 'none',
            borderRadius: 8,
            fontWeight: 500,
            boxShadow: isDark 
              ? '0 1px 3px rgba(0, 0, 0, 0.3)' 
              : '0 1px 3px rgba(0, 0, 0, 0.1)',
            '&:hover': {
              boxShadow: isDark 
                ? '0 4px 6px rgba(0, 0, 0, 0.4)' 
                : '0 4px 6px rgba(0, 0, 0, 0.15)',
            },
          },
          contained: {
            '&:hover': {
              transform: 'translateY(-1px)',
              transition: 'transform 0.2s ease-in-out',
            },
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: {
            borderRadius: 6,
            fontWeight: 500,
            backgroundColor: isDark ? '#3a3a3a' : '#F8F9FA',
            color: isDark ? '#e2e8f0' : '#010101',
            border: isDark ? '1px solid #4a5568' : '1px solid #E5E5E5',
          },
        },
      },
      MuiListItem: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            margin: '2px 8px',
            '&.Mui-selected': {
              backgroundColor: isDark ? '#2d5a87' : '#FFF0F0',
              '&:hover': {
                backgroundColor: isDark ? '#1a365d' : '#FFE0E0',
              },
            },
            '&:hover': {
              backgroundColor: isDark ? '#2a2a2a' : '#F8F9FA',
            },
          },
        },
      },
      MuiTextField: {
        styleOverrides: {
          root: {
            '& .MuiOutlinedInput-root': {
              backgroundColor: isDark ? '#2a2a2a' : '#ffffff',
              '& fieldset': {
                borderColor: isDark ? '#4a5568' : '#E5E5E5',
              },
              '&:hover fieldset': {
                borderColor: isDark ? '#718096' : '#999999',
              },
              '&.Mui-focused fieldset': {
                borderColor: '#E82A2A',
              },
            },
          },
        },
      },
      MuiTableContainer: {
        styleOverrides: {
          root: {
            backgroundColor: isDark ? '#2a2a2a' : '#ffffff',
            borderRadius: 8,
            border: isDark ? '1px solid #2d3748' : '1px solid #E5E5E5',
          },
        },
      },
      MuiTableHead: {
        styleOverrides: {
          root: {
            backgroundColor: isDark ? '#1a1a1a' : '#F8F9FA',
            '& .MuiTableCell-head': {
              color: isDark ? '#e2e8f0' : '#010101',
              fontWeight: 600,
              borderBottom: isDark ? '1px solid #2d3748' : '1px solid #E5E5E5',
            },
          },
        },
      },
      MuiTableCell: {
        styleOverrides: {
          root: {
            borderBottom: isDark ? '1px solid #2d3748' : '1px solid #E5E5E5',
            color: isDark ? '#e2e8f0' : '#010101',
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            backgroundColor: isDark ? '#2a2a2a' : '#ffffff',
            color: isDark ? '#e2e8f0' : '#010101',
          },
        },
      },
      MuiDivider: {
        styleOverrides: {
          root: {
            borderColor: isDark ? '#2d3748' : '#E5E5E5',
          },
        },
      },
      MuiIconButton: {
        styleOverrides: {
          root: {
            color: isDark ? '#e2e8f0' : '#010101',
            '&:hover': {
              backgroundColor: isDark ? '#2a2a2a' : '#F8F9FA',
            },
          },
        },
      },
      MuiTooltip: {
        styleOverrides: {
          tooltip: {
            backgroundColor: isDark ? '#1a1a1a' : '#010101',
            color: isDark ? '#e2e8f0' : '#ffffff',
            fontSize: '0.875rem',
            borderRadius: 6,
          },
        },
      },
      MuiDialog: {
        styleOverrides: {
          paper: {
            backgroundColor: isDark ? '#2a2a2a' : '#ffffff',
            color: isDark ? '#e2e8f0' : '#010101',
          },
        },
      },
      MuiDialogTitle: {
        styleOverrides: {
          root: {
            color: isDark ? '#e2e8f0' : '#E82A2A',
            borderBottom: isDark ? '1px solid #2d3748' : '1px solid #E5E5E5',
          },
        },
      },
      MuiDialogContent: {
        styleOverrides: {
          root: {
            color: isDark ? '#e2e8f0' : '#010101',
          },
        },
      },
      MuiDialogActions: {
        styleOverrides: {
          root: {
            borderTop: isDark ? '1px solid #2d3748' : '1px solid #E5E5E5',
          },
        },
      },
    },
  });
};
