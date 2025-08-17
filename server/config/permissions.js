// Role-based permission system for CNC Manufacturing Scheduler

const PERMISSIONS = {
  // Dashboard and Viewing
  'dashboard.view': ['admin', 'user', 'viewer'],
  'jobs.view': ['admin', 'user', 'viewer'],
  'schedules.view': ['admin', 'user', 'viewer'],
  'machines.view': ['admin', 'user', 'viewer'],
  'employees.view': ['admin', 'user', 'viewer'],
  
  // Job Management
  'jobs.create': ['admin', 'user'],
  'jobs.edit': ['admin', 'user'],
  'jobs.delete': ['admin'],
  'jobs.import': ['admin', 'user'],
  'jobs.export': ['admin', 'user', 'viewer'],
  
  // Schedule Management
  'schedules.create': ['admin', 'user'],
  'schedules.edit': ['admin', 'user'],
  'schedules.delete': ['admin'],
  'schedules.manual_override': ['admin', 'user'],
  'schedules.auto_schedule': ['admin', 'user'],
  'schedules.reschedule': ['admin', 'user'],
  'schedules.unschedule': ['admin', 'user'],
  
  // Machine Management
  'machines.create': ['admin'],
  'machines.edit': ['admin'],
  'machines.delete': ['admin'],
  'machines.assign_operators': ['admin'],
  'machines.view_queues': ['admin', 'user', 'viewer'],
  
  // Employee Management
  'employees.create': ['admin'],
  'employees.edit': ['admin'],
  'employees.delete': ['admin'],
  'employees.view_schedules': ['admin', 'user', 'viewer'],
  'employees.edit_schedules': ['admin'],
  
  // Advanced Features
  'displacement.view': ['admin', 'user', 'viewer'],
  'displacement.trigger': ['admin'],
  'priority.edit': ['admin'],
  'locks.create': ['admin', 'user'],
  'locks.delete': ['admin'],
  'undo.execute': ['admin'],
  
  // Inspection Queue
  'inspection.view': ['admin', 'user', 'viewer'],
  'inspection.edit': ['admin', 'user'],
  
  // Outsourcing
  'outsourcing.view': ['admin', 'user', 'viewer'],
  'outsourcing.edit': ['admin', 'user'],
  
  // System Administration
  'users.view': ['admin'],
  'users.create': ['admin'],
  'users.edit': ['admin'],
  'users.delete': ['admin'],
  'users.reset_password': ['admin'],
  'system.settings': ['admin'],
  
  // Reporting and Analytics
  'reports.view': ['admin', 'user', 'viewer'],
  'reports.export': ['admin', 'user'],
  'analytics.view': ['admin', 'user', 'viewer'],
  'shift_capacity.view': ['admin', 'user', 'viewer'],
  'shift_capacity.edit': ['admin'],
};

// Role descriptions for UI display
const ROLE_DESCRIPTIONS = {
  admin: {
    name: 'Administrator',
    description: 'Full system access - can manage users, configure system settings, and perform all operations',
    color: 'error',
    icon: 'AdminPanelSettings'
  },
  user: {
    name: 'User',
    description: 'Standard access - can view, create, and edit jobs and schedules, but cannot manage users or system settings',
    color: 'primary',
    icon: 'Person'
  },
  viewer: {
    name: 'Viewer',
    description: 'Read-only access - can view all data and export reports, but cannot create or modify anything',
    color: 'secondary',
    icon: 'Visibility'
  }
};

// Permission checking functions
const hasPermission = (userRole, permission) => {
  if (!PERMISSIONS[permission]) {
    console.warn(`Unknown permission: ${permission}`);
    return false;
  }
  return PERMISSIONS[permission].includes(userRole);
};

const hasAnyPermission = (userRole, permissions) => {
  return permissions.some(permission => hasPermission(userRole, permission));
};

const hasAllPermissions = (userRole, permissions) => {
  return permissions.every(permission => hasPermission(userRole, permission));
};

const getRolePermissions = (userRole) => {
  const rolePermissions = {};
  Object.keys(PERMISSIONS).forEach(permission => {
    rolePermissions[permission] = hasPermission(userRole, permission);
  });
  return rolePermissions;
};

const getPermissionsByCategory = (userRole) => {
  const permissions = getRolePermissions(userRole);
  const categories = {
    dashboard: {},
    jobs: {},
    schedules: {},
    machines: {},
    employees: {},
    displacement: {},
    inspection: {},
    outsourcing: {},
    users: {},
    reports: {},
    system: {}
  };

  Object.keys(permissions).forEach(permission => {
    const [category] = permission.split('.');
    if (categories[category] !== undefined) {
      categories[category][permission] = permissions[permission];
    }
  });

  return categories;
};

module.exports = {
  PERMISSIONS,
  ROLE_DESCRIPTIONS,
  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
  getRolePermissions,
  getPermissionsByCategory
};