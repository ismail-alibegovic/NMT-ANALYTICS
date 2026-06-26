export type UserRole = 'super_admin' | 'director' | 'manager' | 'agent' | 'viewer';

export const ROLE_HIERARCHY: UserRole[] = ['viewer', 'agent', 'manager', 'director', 'super_admin'];

export function isUserRole(role: string | undefined | null): role is UserRole {
  return role === 'super_admin' || role === 'director' || role === 'manager' || role === 'agent' || role === 'viewer';
}

export function hasAccess(requiredRole: UserRole, userRole: string | undefined | null): boolean {
  if (!isUserRole(userRole)) return false;
  return ROLE_HIERARCHY.indexOf(userRole) >= ROLE_HIERARCHY.indexOf(requiredRole);
}

export function hasAnyRole(userRole: string | undefined | null, roles: UserRole[]): boolean {
  return isUserRole(userRole) && roles.includes(userRole);
}

export function canAccessFinances(role: string | undefined | null): boolean {
  return hasAccess('manager', role);
}

export function canAccessSettings(role: string | undefined | null): boolean {
  return hasAccess('director', role);
}

export function canManageUsers(role: string | undefined | null): boolean {
  return hasAccess('director', role);
}

export function canAccessAuditLog(role: string | undefined | null): boolean {
  return hasAccess('director', role);
}

export function canAccessIntegrations(role: string | undefined | null): boolean {
  return hasAccess('manager', role);
}

export function canAccessReports(role: string | undefined | null): boolean {
  return hasAccess('manager', role);
}

export function canCreateEditPackages(role: string | undefined | null): boolean {
  return hasAccess('manager', role);
}

export function canCreateEditDepartures(role: string | undefined | null): boolean {
  return hasAccess('manager', role);
}

export function canAccessPayments(role: string | undefined | null): boolean {
  return hasAccess('manager', role);
}

export const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: 'Platform Administrator',
  director: 'Director',
  manager: 'Manager',
  agent: 'Agent',
  viewer: 'Viewer',
};
