export type UserRole = 'super_admin' | 'director' | 'manager' | 'agent' | 'viewer';

export const ROLE_HIERARCHY: UserRole[] = ['viewer', 'agent', 'manager', 'director', 'super_admin'];

export function isUserRole(role: string | undefined | null): role is UserRole {
  return role === 'super_admin' || role === 'director' || role === 'manager' || role === 'agent' || role === 'viewer';
}

export function hasAccess(requiredRole: UserRole, userRole: string | undefined | null): boolean {
  if (!isUserRole(userRole)) return false;

  const userIndex = ROLE_HIERARCHY.indexOf(userRole);
  const requiredIndex = ROLE_HIERARCHY.indexOf(requiredRole);

  return userIndex >= requiredIndex;
}

export function can(userRole: string | undefined | null, permission: string): boolean {
  if (userRole === 'super_admin') return true;
  if (!isUserRole(userRole)) return false;

  const permissions: Record<UserRole, string[]> = {
    super_admin: ['*'],
    director: [
      'dashboard:read',
      'customers:*',
      'packages:*',
      'departures:*',
      'reservations:*',
      'payments:*',
      'transactions:*',
      'reports:*',
      'integrations:*',
      'settings:*',
      'users:*',
      'audit_logs:read',
      'documents:*',
      'notifications:*',
    ],
    manager: [
      'dashboard:read',
      'customers:*',
      'packages:*',
      'departures:*',
      'reservations:*',
      'payments:read',
      'transactions:read',
      'reports:*',
      'integrations:*',
      'documents:*',
      'notifications:*',
    ],
    agent: [
      'dashboard:read',
      'customers:*',
      'packages:read',
      'departures:read',
      'reservations:*',
      'notifications:read',
    ],
    viewer: [
      'dashboard:read',
      'customers:read',
      'packages:read',
      'departures:read',
      'reservations:read',
      'notifications:read',
    ],
  };

  return permissions[userRole].some((entry) => {
    if (entry === '*') return true;
    if (entry === permission) return true;
    if (entry.endsWith(':*')) return permission.startsWith(entry.slice(0, -1));
    return false;
  });
}
