import React from 'react';
import { Box } from '@mui/material';
import { useTheme } from '../contexts/ThemeContext';

const Logo = ({ 
  variant = 'horizontal', 
  color = 'auto', 
  height = 40, 
  width = 'auto',
  sx = {} 
}) => {
  const { darkMode } = useTheme();
  
  const getLogoSrc = () => {
    // Auto-detect color based on theme if color is 'auto'
    const effectiveColor = color === 'auto' ? (darkMode ? 'white' : 'black') : color;
    
    if (variant === 'vertical') {
      return effectiveColor === 'white' ? '/logo-vertical-white.svg' : '/logo-vertical-black.svg';
    }
    // For horizontal, if color is 'primary', use appropriate logo based on theme
    if (color === 'primary') {
      return darkMode ? '/logo-white.svg' : '/logo-black.svg';
    }
    return effectiveColor === 'white' ? '/logo-white.svg' : '/logo-black.svg';
  };

  return (
    <Box
      component="img"
      src={getLogoSrc()}
      alt="ADVANCE MACHINE TECHNOLOGIES"
      sx={{
        height,
        width,
        objectFit: 'contain',
        maxWidth: '100%',
        ...sx
      }}
    />
  );
};

export default Logo;
