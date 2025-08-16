import { createTheme } from '@mui/material/styles';

// Duralux-inspired industrial theme
const duraluxTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#E82A2A', // Brand red
      light: '#FF5555',
      dark: '#B71C1C',
      contrastText: '#fff',
    },
    secondary: {
      main: '#010101', // Brand black
      light: '#424242',
      dark: '#000000',
      contrastText: '#fff',
    },
    background: {
      default: '#010101', // Brand black
      paper: '#1a1a1a', // Slightly lighter panel color
      elevated: '#2a2a2a', // Elevated surface
    },
    text: {
      primary: '#e4e6eb',
      secondary: '#9ca3af',
      disabled: '#6b7280',
    },
    divider: '#E5E5E5',
    success: {
      main: '#10b981',
      light: '#34d399',
      dark: '#059669',
    },
    warning: {
      main: '#f59e0b',
      light: '#fbbf24',
      dark: '#d97706',
    },
    error: {
      main: '#ef4444',
      light: '#f87171',
      dark: '#dc2626',
    },
    info: {
      main: '#3b82f6',
      light: '#60a5fa',
      dark: '#2563eb',
    },
    action: {
      hover: 'rgba(232, 42, 42, 0.08)',
      selected: 'rgba(232, 42, 42, 0.12)',
      disabled: 'rgba(255, 255, 255, 0.3)',
      disabledBackground: 'rgba(255, 255, 255, 0.12)',
    },
    grey: {
      50: '#f9fafb',
      100: '#f3f4f6',
      200: '#e5e7eb',
      300: '#d1d5db',
      400: '#9ca3af',
      500: '#6b7280',
      600: '#4b5563',
      700: '#374151',
      800: '#1f2937',
      900: '#111827',
    },
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
    h1: {
      fontSize: '2.5rem',
      fontWeight: 700,
      lineHeight: 1.2,
      letterSpacing: '-0.02em',
    },
    h2: {
      fontSize: '2rem',
      fontWeight: 600,
      lineHeight: 1.3,
      letterSpacing: '-0.01em',
    },
    h3: {
      fontSize: '1.75rem',
      fontWeight: 600,
      lineHeight: 1.4,
    },
    h4: {
      fontSize: '1.5rem',
      fontWeight: 600,
      lineHeight: 1.4,
    },
    h5: {
      fontSize: '1.25rem',
      fontWeight: 600,
      lineHeight: 1.5,
    },
    h6: {
      fontSize: '1.125rem',
      fontWeight: 600,
      lineHeight: 1.5,
    },
    subtitle1: {
      fontSize: '1rem',
      fontWeight: 500,
      lineHeight: 1.75,
      letterSpacing: '0.00938em',
    },
    subtitle2: {
      fontSize: '0.875rem',
      fontWeight: 500,
      lineHeight: 1.57,
      letterSpacing: '0.00714em',
    },
    body1: {
      fontSize: '1rem',
      lineHeight: 1.5,
      letterSpacing: '0.00938em',
    },
    body2: {
      fontSize: '0.875rem',
      lineHeight: 1.43,
      letterSpacing: '0.01071em',
    },
    button: {
      fontSize: '0.875rem',
      fontWeight: 600,
      letterSpacing: '0.02857em',
      textTransform: 'uppercase',
    },
    caption: {
      fontSize: '0.75rem',
      lineHeight: 1.66,
      letterSpacing: '0.03333em',
    },
    overline: {
      fontSize: '0.75rem',
      fontWeight: 600,
      letterSpacing: '0.08333em',
      textTransform: 'uppercase',
      lineHeight: 2.66,
    },
  },
  shape: {
    borderRadius: 12,
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          scrollbarColor: '#1a2030 #0a0e1a',
          '&::-webkit-scrollbar, & *::-webkit-scrollbar': {
            width: 8,
            height: 8,
          },
          '&::-webkit-scrollbar-thumb, & *::-webkit-scrollbar-thumb': {
            borderRadius: 8,
            backgroundColor: '#1a2030',
            border: '2px solid #0a0e1a',
          },
          '&::-webkit-scrollbar-thumb:hover, & *::-webkit-scrollbar-thumb:hover': {
            backgroundColor: '#252b3b',
          },
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          textTransform: 'none',
          fontWeight: 600,
          padding: '8px 20px',
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          '&:hover': {
            transform: 'translateY(-1px)',
            boxShadow: '0 8px 16px rgba(232, 42, 42, 0.2)',
          },
        },
        contained: {
          boxShadow: 'none',
          '&:hover': {
            boxShadow: '0 8px 16px rgba(232, 42, 42, 0.2)',
          },
        },
        containedPrimary: {
          background: 'linear-gradient(135deg, #E82A2A 0%, #B71C1C 100%)',
          '&:hover': {
            background: 'linear-gradient(135deg, #FF5555 0%, #E82A2A 100%)',
          },
        },
        containedSecondary: {
          background: 'linear-gradient(135deg, #010101 0%, #424242 100%)',
          '&:hover': {
            background: 'linear-gradient(135deg, #424242 0%, #666666 100%)',
          },
        },
        outlined: {
          borderWidth: 2,
          '&:hover': {
            borderWidth: 2,
            backgroundColor: 'rgba(232, 42, 42, 0.08)',
          },
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          backgroundColor: '#1a1a1a',
          borderRadius: 16,
          border: '1px solid rgba(255, 255, 255, 0.05)',
          backdropFilter: 'blur(10px)',
          boxShadow: '0 4px 24px rgba(0, 0, 0, 0.4)',
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          '&:hover': {
            transform: 'translateY(-2px)',
            boxShadow: '0 8px 32px rgba(232, 42, 42, 0.1)',
            borderColor: 'rgba(232, 42, 42, 0.2)',
          },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          backgroundColor: '#1a1a1a',
          borderRadius: 12,
          border: '1px solid rgba(255, 255, 255, 0.05)',
        },
        elevation1: {
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
        },
        elevation2: {
          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.4)',
        },
        elevation3: {
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)',
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: '#E82A2A',
          backgroundImage: 'none',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          boxShadow: '0 4px 24px rgba(0, 0, 0, 0.4)',
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: '#1a1a1a',
          borderRight: '1px solid rgba(255, 255, 255, 0.08)',
          boxShadow: '4px 0 24px rgba(0, 0, 0, 0.4)',
        },
      },
    },
    MuiListItem: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          marginBottom: 4,
          transition: 'all 0.2s ease',
          '&:hover': {
            backgroundColor: 'rgba(232, 42, 42, 0.08)',
          },
          '&.Mui-selected': {
            backgroundColor: 'rgba(232, 42, 42, 0.12)',
            borderLeft: '3px solid #E82A2A',
            '&:hover': {
              backgroundColor: 'rgba(232, 42, 42, 0.16)',
            },
          },
        },
      },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          transition: 'all 0.2s ease',
          '&:hover': {
            backgroundColor: 'rgba(232, 42, 42, 0.08)',
          },
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: 8,
            backgroundColor: 'rgba(255, 255, 255, 0.02)',
            transition: 'all 0.3s ease',
            '& fieldset': {
              borderColor: 'rgba(255, 255, 255, 0.1)',
            },
            '&:hover fieldset': {
              borderColor: 'rgba(232, 42, 42, 0.3)',
            },
            '&.Mui-focused fieldset': {
              borderColor: '#E82A2A',
              borderWidth: 2,
            },
            '&.Mui-focused': {
              backgroundColor: 'rgba(232, 42, 42, 0.02)',
              boxShadow: '0 0 0 4px rgba(232, 42, 42, 0.1)',
            },
          },
        },
      },
    },
    MuiSelect: {
      styleOverrides: {
        root: {
          borderRadius: 8,
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 6,
          fontWeight: 600,
          border: '1px solid transparent',
        },
        filled: {
          backgroundColor: 'rgba(232, 42, 42, 0.1)',
          color: '#E82A2A',
          border: '1px solid rgba(232, 42, 42, 0.2)',
          '&:hover': {
            backgroundColor: 'rgba(232, 42, 42, 0.15)',
          },
        },
        outlined: {
          borderColor: 'rgba(232, 42, 42, 0.3)',
          '&:hover': {
            backgroundColor: 'rgba(232, 42, 42, 0.08)',
          },
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
        },
        head: {
          fontWeight: 600,
          backgroundColor: '#1a1a1a',
          color: '#9ca3af',
          textTransform: 'uppercase',
          fontSize: '0.75rem',
          letterSpacing: '0.05em',
        },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: {
          '&:hover': {
            backgroundColor: 'rgba(232, 42, 42, 0.04)',
          },
          '&.Mui-selected': {
            backgroundColor: 'rgba(232, 42, 42, 0.08)',
            '&:hover': {
              backgroundColor: 'rgba(232, 42, 42, 0.12)',
            },
          },
        },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          backgroundColor: '#1a2030',
          border: '1px solid rgba(232, 42, 42, 0.2)',
          borderRadius: 8,
          fontSize: '0.75rem',
          padding: '8px 12px',
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
        },
        arrow: {
          color: '#1a2030',
          '&::before': {
            border: '1px solid rgba(232, 42, 42, 0.2)',
          },
        },
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          border: '1px solid',
        },
        standardSuccess: {
          backgroundColor: 'rgba(16, 185, 129, 0.1)',
          borderColor: 'rgba(16, 185, 129, 0.3)',
        },
        standardError: {
          backgroundColor: 'rgba(239, 68, 68, 0.1)',
          borderColor: 'rgba(239, 68, 68, 0.3)',
        },
        standardWarning: {
          backgroundColor: 'rgba(245, 158, 11, 0.1)',
          borderColor: 'rgba(245, 158, 11, 0.3)',
        },
        standardInfo: {
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          borderColor: 'rgba(59, 130, 246, 0.3)',
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: 16,
          backgroundColor: '#1a1a1a',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          boxShadow: '0 24px 48px rgba(0, 0, 0, 0.6)',
        },
      },
    },
    MuiDialogTitle: {
      styleOverrides: {
        root: {
          backgroundColor: '#1a1a1a',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          padding: '20px 24px',
        },
      },
    },
    MuiDialogContent: {
      styleOverrides: {
        root: {
          padding: '24px',
        },
      },
    },
    MuiDialogActions: {
      styleOverrides: {
        root: {
          backgroundColor: '#1a1a1a',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          padding: '16px 24px',
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          transition: 'all 0.2s ease',
          '&:hover': {
            backgroundColor: 'rgba(232, 42, 42, 0.08)',
            transform: 'scale(1.1)',
          },
        },
      },
    },
    MuiFab: {
      styleOverrides: {
        root: {
          boxShadow: '0 8px 24px rgba(232, 42, 42, 0.3)',
          '&:hover': {
            boxShadow: '0 12px 32px rgba(232, 42, 42, 0.4)',
          },
        },
        primary: {
          background: 'linear-gradient(135deg, #E82A2A 0%, #B71C1C 100%)',
        },
        secondary: {
          background: 'linear-gradient(135deg, #010101 0%, #424242 100%)',
        },
      },
    },
    MuiSwitch: {
      styleOverrides: {
        root: {
          width: 42,
          height: 26,
          padding: 0,
        },
        switchBase: {
          padding: 0,
          margin: 2,
          '&.Mui-checked': {
            transform: 'translateX(16px)',
            '& + .MuiSwitch-track': {
              backgroundColor: '#E82A2A',
              opacity: 1,
            },
          },
        },
        thumb: {
          width: 22,
          height: 22,
        },
        track: {
          borderRadius: 13,
          backgroundColor: '#374151',
          opacity: 1,
        },
      },
    },
    MuiLinearProgress: {
      styleOverrides: {
        root: {
          borderRadius: 4,
          backgroundColor: 'rgba(255, 255, 255, 0.08)',
        },
        barColorPrimary: {
          background: 'linear-gradient(90deg, #E82A2A 0%, #B71C1C 100%)',
        },
      },
    },
    MuiCircularProgress: {
      styleOverrides: {
        colorPrimary: {
          color: '#E82A2A',
        },
      },
    },
  },
});

export default duraluxTheme;