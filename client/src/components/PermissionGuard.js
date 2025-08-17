import { useAuth } from '../contexts/AuthContext';

/**
 * PermissionGuard component that conditionally renders children based on user permissions
 * 
 * @param {Object} props
 * @param {string|string[]} props.permission - Single permission or array of permissions required
 * @param {boolean} props.requireAll - If true with array, requires ALL permissions. If false, requires ANY permission (default: false)
 * @param {React.ReactNode} props.children - Content to render if user has permission
 * @param {React.ReactNode} props.fallback - Content to render if user lacks permission (default: null)
 * @returns {React.ReactNode}
 */
const PermissionGuard = ({ 
  permission, 
  requireAll = false, 
  children, 
  fallback = null 
}) => {
  const { hasPermission, hasAnyPermission, hasAllPermissions, loading } = useAuth();

  // Don't render anything while loading
  if (loading) {
    return null;
  }

  let hasAccess = false;

  if (typeof permission === 'string') {
    // Single permission
    hasAccess = hasPermission(permission);
  } else if (Array.isArray(permission)) {
    // Multiple permissions
    if (requireAll) {
      hasAccess = hasAllPermissions(permission);
    } else {
      hasAccess = hasAnyPermission(permission);
    }
  }

  return hasAccess ? children : fallback;
};

export default PermissionGuard;