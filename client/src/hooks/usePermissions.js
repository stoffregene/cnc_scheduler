import { useAuth } from '../contexts/AuthContext';

/**
 * Custom hook for permission checking with additional utility methods
 * @returns {Object} Permission checking functions and user role info
 */
export const usePermissions = () => {
  const { 
    user, 
    permissions, 
    roleInfo, 
    hasPermission, 
    hasAnyPermission, 
    hasAllPermissions,
    isAdmin,
    isUser 
  } = useAuth();

  /**
   * Check if user can perform specific actions on different resource types
   */
  const can = {
    // Jobs permissions
    viewJobs: () => hasPermission('jobs.view'),
    createJobs: () => hasPermission('jobs.create'),
    editJobs: () => hasPermission('jobs.edit'),
    deleteJobs: () => hasPermission('jobs.delete'),
    importJobs: () => hasPermission('jobs.import'),
    exportJobs: () => hasPermission('jobs.export'),

    // Schedule permissions
    viewSchedules: () => hasPermission('schedules.view'),
    createSchedules: () => hasPermission('schedules.create'),
    editSchedules: () => hasPermission('schedules.edit'),
    deleteSchedules: () => hasPermission('schedules.delete'),
    manualScheduleOverride: () => hasPermission('schedules.manual_override'),
    autoSchedule: () => hasPermission('schedules.auto_schedule'),
    reschedule: () => hasPermission('schedules.reschedule'),
    unschedule: () => hasPermission('schedules.unschedule'),

    // Machine permissions
    viewMachines: () => hasPermission('machines.view'),
    createMachines: () => hasPermission('machines.create'),
    editMachines: () => hasPermission('machines.edit'),
    deleteMachines: () => hasPermission('machines.delete'),
    assignOperators: () => hasPermission('machines.assign_operators'),
    viewMachineQueues: () => hasPermission('machines.view_queues'),

    // Employee permissions
    viewEmployees: () => hasPermission('employees.view'),
    createEmployees: () => hasPermission('employees.create'),
    editEmployees: () => hasPermission('employees.edit'),
    deleteEmployees: () => hasPermission('employees.delete'),
    viewEmployeeSchedules: () => hasPermission('employees.view_schedules'),
    editEmployeeSchedules: () => hasPermission('employees.edit_schedules'),

    // Advanced features
    viewDisplacement: () => hasPermission('displacement.view'),
    triggerDisplacement: () => hasPermission('displacement.trigger'),
    editPriority: () => hasPermission('priority.edit'),
    createLocks: () => hasPermission('locks.create'),
    deleteLocks: () => hasPermission('locks.delete'),
    executeUndo: () => hasPermission('undo.execute'),

    // Inspection and outsourcing
    viewInspection: () => hasPermission('inspection.view'),
    editInspection: () => hasPermission('inspection.edit'),
    viewOutsourcing: () => hasPermission('outsourcing.view'),
    editOutsourcing: () => hasPermission('outsourcing.edit'),

    // User management (admin only)
    viewUsers: () => hasPermission('users.view'),
    createUsers: () => hasPermission('users.create'),
    editUsers: () => hasPermission('users.edit'),
    deleteUsers: () => hasPermission('users.delete'),
    resetPasswords: () => hasPermission('users.reset_password'),

    // System administration
    systemSettings: () => hasPermission('system.settings'),

    // Reporting
    viewReports: () => hasPermission('reports.view'),
    exportReports: () => hasPermission('reports.export'),
    viewAnalytics: () => hasPermission('analytics.view'),
    viewShiftCapacity: () => hasPermission('shift_capacity.view'),
    editShiftCapacity: () => hasPermission('shift_capacity.edit'),
  };

  /**
   * Get user role display information
   */
  const getRoleDisplay = () => {
    if (!user || !roleInfo) return null;
    
    return {
      name: roleInfo.name,
      description: roleInfo.description,
      color: roleInfo.color,
      icon: roleInfo.icon
    };
  };

  /**
   * Check if user is in specific role(s)
   */
  const hasRole = (roles) => {
    if (!user) return false;
    
    if (typeof roles === 'string') {
      return user.role === roles;
    }
    
    if (Array.isArray(roles)) {
      return roles.includes(user.role);
    }
    
    return false;
  };

  /**
   * Get all permissions for current user
   */
  const getAllPermissions = () => {
    return permissions || {};
  };

  return {
    // User info
    user,
    roleInfo,
    
    // Basic permission checks
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    
    // Role checks
    isAdmin,
    isUser,
    hasRole,
    
    // Semantic permission checks
    can,
    
    // Utility functions
    getRoleDisplay,
    getAllPermissions,
    
    // Raw permissions object
    permissions
  };
};

export default usePermissions;