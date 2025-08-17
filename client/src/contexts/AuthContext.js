import React, { createContext, useContext, useState, useEffect } from 'react';
import { apiService } from '../services/apiService';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [permissions, setPermissions] = useState({});
  const [roleInfo, setRoleInfo] = useState(null);
  const [loading, setLoading] = useState(true);

  // Initialize auth state on app load
  useEffect(() => {
    const initializeAuth = async () => {
      const storedToken = localStorage.getItem('token');
      if (storedToken) {
        try {
          // Set token in API service
          apiService.setAuthToken(storedToken);
          
          // Verify token is still valid by fetching user info
          const [userResponse, permissionsResponse] = await Promise.all([
            apiService.auth.me(),
            apiService.get('/api/auth/permissions')
          ]);
          
          setUser(userResponse.user);
          setPermissions(permissionsResponse.permissions);
          setRoleInfo(permissionsResponse.roleInfo);
          setToken(storedToken);
        } catch (error) {
          // Token is invalid, clear it
          console.error('Token validation failed:', error);
          localStorage.removeItem('token');
          setToken(null);
          setUser(null);
          setPermissions({});
          setRoleInfo(null);
          apiService.setAuthToken(null);
        }
      }
      setLoading(false);
    };

    initializeAuth();
  }, []);

  const login = async (username, password) => {
    try {
      const response = await apiService.auth.login({
        username,
        password,
      });

      const { token: newToken, user: userData } = response;

      // Store token and user data
      localStorage.setItem('token', newToken);
      setToken(newToken);
      setUser(userData);
      
      // Set token in API service for future requests
      apiService.setAuthToken(newToken);
      
      // Fetch user permissions
      try {
        const permissionsResponse = await apiService.get('/api/auth/permissions');
        setPermissions(permissionsResponse.permissions);
        setRoleInfo(permissionsResponse.roleInfo);
      } catch (error) {
        console.error('Failed to fetch permissions:', error);
      }

      return response;
    } catch (error) {
      throw new Error(error.message || 'Login failed');
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
    setPermissions({});
    setRoleInfo(null);
    apiService.setAuthToken(null);
  };

  const changePassword = async (currentPassword, newPassword) => {
    try {
      const response = await apiService.auth.changePassword({
        currentPassword,
        newPassword,
      });
      return response;
    } catch (error) {
      throw new Error(error.message || 'Password change failed');
    }
  };

  const refreshUser = async () => {
    try {
      const response = await apiService.auth.me();
      setUser(response.user);
      return response.user;
    } catch (error) {
      console.error('Failed to refresh user:', error);
      // If refresh fails, user might be logged out
      logout();
      throw error;
    }
  };

  const isAuthenticated = () => {
    return !!token && !!user;
  };

  const isAdmin = () => {
    return user?.role === 'admin';
  };

  const isUser = () => {
    return user?.role === 'admin' || user?.role === 'user';
  };

  // Permission checking functions
  const hasPermission = (permission) => {
    return permissions[permission] === true;
  };

  const hasAnyPermission = (permissionList) => {
    return permissionList.some(permission => permissions[permission] === true);
  };

  const hasAllPermissions = (permissionList) => {
    return permissionList.every(permission => permissions[permission] === true);
  };

  const value = {
    user,
    token,
    loading,
    permissions,
    roleInfo,
    login,
    logout,
    changePassword,
    refreshUser,
    isAuthenticated,
    isAdmin,
    isUser,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};