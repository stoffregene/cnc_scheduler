import { createTheme } from '@mui/material/styles';

export const createAppTheme = (darkMode) => {
  const isDark = darkMode;
  
  return createTheme({
    palette: {
      mode: isDark ? 'dark' : 'light',
      primary: {
        main: '#1a365d', // Deep blue for professional manufacturing
        light: isDark ? '#2d5a87' : '#2d5a87',
        dark: isDark ? '#0f2027' : '#0f2027',
        contrastText: '#ffffff',
      },
      secondary: {
        main: '#e53e3e', // Alert red for manufacturing priorities
        light: isDark ? '#fc8181' : '#fc8181',
        dark: isDark ? '#c53030' : '#c53030',
        contrastText: '#ffffff',
      },
      background: {
        default: isDark ? '#0a0a0a' : '#f7fafc',
        paper: isDark ? '#1a1a1a' : '#ffffff',
      },
      surface: {
        main: isDark ? '#2a2a2a' : '#ffffff',
        light: isDark ? '#3a3a3a' : '#f8f9fa',
        dark: isDark ? '#1a1a1a' : '#e9ecef',
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
        primary: isDark ? '#e2e8f0' : '#2d3748',
        secondary: isDark ? '#a0aec0' : '#4a5568',
        disabled: isDark ? '#718096' : '#a0aec0',
      },
      divider: isDark ? '#2d3748' : '#e2e8f0',
    },
    typography: {
      fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
      h1: {
        fontWeight: 700,
        fontSize: '2.5rem',
        color: isDark ? '#e2e8f0' : '#1a365d',
      },
      h2: {
        fontWeight: 600,
        fontSize: '2rem',
        color: isDark ? '#e2e8f0' : '#1a365d',
      },
      h3: {
        fontWeight: 600,
        fontSize: '1.75rem',
        color: isDark ? '#e2e8f0' : '#1a365d',
      },
      h4: {
        fontWeight: 600,
        fontSize: '1.5rem',
        color: isDark ? '#e2e8f0' : '#1a365d',
      },
      h5: {
        fontWeight: 600,
        fontSize: '1.25rem',
        color: isDark ? '#e2e8f0' : '#1a365d',
      },
      h6: {
        fontWeight: 600,
        fontSize: '1.125rem',
        color: isDark ? '#e2e8f0' : '#1a365d',
      },
      subtitle1: {
        fontWeight: 500,
        color: isDark ? '#a0aec0' : '#4a5568',
      },
      subtitle2: {
        fontWeight: 500,
        color: isDark ? '#a0aec0' : '#4a5568',
      },
      body1: {
        color: isDark ? '#e2e8f0' : '#2d3748',
      },
      body2: {
        color: isDark ? '#a0aec0' : '#4a5568',
      },
    },
    components: {
      MuiAppBar: {
        styleOverrides: {
          root: {
            backgroundColor: isDark ? '#1a1a1a' : '#1a365d',
            boxShadow: isDark 
              ? '0 2px 8px rgba(0, 0, 0, 0.3)' 
              : '0 2px 8px rgba(26, 54, 93, 0.15)',
            borderBottom: isDark ? '1px solid #2d3748' : 'none',
          },
        },
      },
      MuiDrawer: {
        styleOverrides: {
          paper: {
            backgroundColor: isDark ? '#1a1a1a' : '#ffffff',
            borderRight: isDark ? '1px solid #2d3748' : '1px solid #e2e8f0',
            color: isDark ? '#e2e8f0' : '#2d3748',
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
            border: isDark ? '1px solid #2d3748' : '1px solid #e2e8f0',
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
            backgroundColor: isDark ? '#3a3a3a' : '#f7fafc',
            color: isDark ? '#e2e8f0' : '#2d3748',
            border: isDark ? '1px solid #4a5568' : '1px solid #e2e8f0',
          },
        },
      },
      MuiListItem: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            margin: '2px 8px',
            '&.Mui-selected': {
              backgroundColor: isDark ? '#2d5a87' : '#ebf8ff',
              '&:hover': {
                backgroundColor: isDark ? '#1a365d' : '#bee3f8',
              },
            },
            '&:hover': {
              backgroundColor: isDark ? '#2a2a2a' : '#f7fafc',
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
                borderColor: isDark ? '#4a5568' : '#e2e8f0',
              },
              '&:hover fieldset': {
                borderColor: isDark ? '#718096' : '#cbd5e0',
              },
              '&.Mui-focused fieldset': {
                borderColor: '#1a365d',
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
            border: isDark ? '1px solid #2d3748' : '1px solid #e2e8f0',
          },
        },
      },
      MuiTableHead: {
        styleOverrides: {
          root: {
            backgroundColor: isDark ? '#1a1a1a' : '#f7fafc',
            '& .MuiTableCell-head': {
              color: isDark ? '#e2e8f0' : '#2d3748',
              fontWeight: 600,
              borderBottom: isDark ? '1px solid #2d3748' : '1px solid #e2e8f0',
            },
          },
        },
      },
      MuiTableCell: {
        styleOverrides: {
          root: {
            borderBottom: isDark ? '1px solid #2d3748' : '1px solid #e2e8f0',
            color: isDark ? '#e2e8f0' : '#2d3748',
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            backgroundColor: isDark ? '#2a2a2a' : '#ffffff',
            color: isDark ? '#e2e8f0' : '#2d3748',
          },
        },
      },
      MuiDivider: {
        styleOverrides: {
          root: {
            borderColor: isDark ? '#2d3748' : '#e2e8f0',
          },
        },
      },
      MuiIconButton: {
        styleOverrides: {
          root: {
            color: isDark ? '#e2e8f0' : '#2d3748',
            '&:hover': {
              backgroundColor: isDark ? '#2a2a2a' : '#f7fafc',
            },
          },
        },
      },
      MuiTooltip: {
        styleOverrides: {
          tooltip: {
            backgroundColor: isDark ? '#1a1a1a' : '#2d3748',
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
            color: isDark ? '#e2e8f0' : '#2d3748',
          },
        },
      },
      MuiDialogTitle: {
        styleOverrides: {
          root: {
            color: isDark ? '#e2e8f0' : '#1a365d',
            borderBottom: isDark ? '1px solid #2d3748' : '1px solid #e2e8f0',
          },
        },
      },
      MuiDialogContent: {
        styleOverrides: {
          root: {
            color: isDark ? '#e2e8f0' : '#2d3748',
          },
        },
      },
      MuiDialogActions: {
        styleOverrides: {
          root: {
            borderTop: isDark ? '1px solid #2d3748' : '1px solid #e2e8f0',
          },
        },
      },
    },
  });
};
