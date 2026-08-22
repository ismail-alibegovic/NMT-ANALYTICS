import { Request, Response, NextFunction, RequestHandler } from 'express';
import { apiError } from '../lib/errors';
import { hasAccess, isUserRole, UserRole } from '../types/roles';

export const requireRole = (allowedRoles: UserRole[]): RequestHandler => {
  return (req: Request, res: Response, next: NextFunction) => {
    const role = req.user?.role;

    if (!role) {
      return apiError(res, 401, 'AUTH_REQUIRED', 'Authentication and role context required');
    }

    if (!isUserRole(role)) {
      return apiError(res, 403, 'INVALID_ROLE', 'User role is not valid for this application');
    }

    if (!allowedRoles.includes(role)) {
      return apiError(res, 403, 'INSUFFICIENT_PERMISSIONS', 'You do not have the required permissions to access this resource');
    }

    return next();
  };
};

export const requireMinimumRole = (minimumRole: UserRole): RequestHandler => {
  return (req: Request, res: Response, next: NextFunction) => {
    const role = req.user?.role;
    const user = req.user;

    console.log(`[ROLE] requireMinimumRole(${minimumRole}): user.id=${user?.id}, role=${role}, type=${typeof role}`);

    if (!role) {
      console.log(`[ROLE] requireMinimumRole: NO ROLE - returning 401`);
      return apiError(res, 401, 'AUTH_REQUIRED', 'Authentication and role context required');
    }

    const accessResult = hasAccess(minimumRole, role);
    console.log(`[ROLE] hasAccess(${minimumRole}, ${role}) = ${accessResult}`);

    if (!accessResult) {
      console.log(`[ROLE] requireMinimumRole: ACCESS DENIED - returning 403`);
      return apiError(res, 403, 'INSUFFICIENT_PERMISSIONS', 'You do not have the required permissions to access this resource');
    }

    console.log(`[ROLE] requireMinimumRole: ACCESS GRANTED`);
    return next();
  };
};
