import React from 'react';
import { Box } from '@mui/material';

const Logo = ({ 
  variant = 'horizontal', 
  color = 'auto', 
  height = 40, 
  width = 'auto',
  sx = {} 
}) => {
  // Since we're using a fixed dark theme now, we can simplify this
  const getLogoSrc = () => {
    // Auto-detect color - always use white for our dark theme
    const effectiveColor = color === 'auto' ? 'white' : color;
    
    if (variant === 'vertical') {
      return effectiveColor === 'white' ? '/logo-vertical-white.svg' : '/logo-vertical-black.svg';
    }
    // For horizontal, if color is 'primary', use white logo for dark theme
    if (color === 'primary') {
      return '/logo-white.svg';
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
