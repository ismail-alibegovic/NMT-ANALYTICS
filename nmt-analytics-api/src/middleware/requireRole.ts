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

    if (!role) {
      return apiError(res, 401, 'AUTH_REQUIRED', 'Authentication and role context required');
    }

    if (!hasAccess(minimumRole, role)) {
      return apiError(res, 403, 'INSUFFICIENT_PERMISSIONS', 'You do not have the required permissions to access this resource');
    }

    return next();
  };
};
