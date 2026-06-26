import { Request, Response, NextFunction, RequestHandler } from 'express';
import { supabaseAdmin } from '../lib/supabase';
import { getOrgContext } from '../lib/auth-helpers';
import { apiError } from '../lib/errors';

export const authenticateToken: RequestHandler = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    // Temporary dev logging: log incoming path + whether auth header present
    if (process.env.NODE_ENV === 'development') {
      console.log(`[DEV LOG] ${req.method} ${req.path} - Auth header: ${authHeader ? 'present' : 'missing'}`);
    }

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'warn',
        requestId: req.requestId,
        method: req.method,
        path: req.path,
        status: 401,
        error: 'AUTH_HEADER_MISSING',
        message: 'Authorization header missing or invalid',
        type: 'auth_failure'
      }));
      apiError(res, 401, 'AUTH_HEADER_MISSING', 'Authorization header missing or invalid');
      return;
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify the JWT token with Supabase
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !user) {
      console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'warn',
        requestId: req.requestId,
        method: req.method,
        path: req.path,
        status: 401,
        error: 'UNAUTHORIZED',
        message: 'Invalid or expired token',
        type: 'auth_failure'
      }));
      apiError(res, 401, 'UNAUTHORIZED', 'Invalid or expired token');
      return;
    }

    // Attach user info to request
    req.user = {
      id: user.id,
      email: user.email,
      // role will be set by attachOrgContext
    };

    next();
  } catch (error) {
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error',
      requestId: req.requestId,
      method: req.method,
      path: req.path,
      status: 401,
      error: 'AUTH_FAILED',
      message: 'Authentication failed',
      details: error instanceof Error ? error.message : 'Unknown error',
      type: 'auth_failure'
    }));
    apiError(res, 401, 'AUTH_FAILED', 'Authentication failed');
  }
};

export const attachOrgContext: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) {
      apiError(res, 401, 'AUTH_REQUIRED', 'Authentication required');
      return;
    }

    const orgContext = await getOrgContext(req);
    req.orgId = orgContext.orgId;
    req.user.role = orgContext.role;

    next();
  } catch (error) {
    console.error('Org context error:', error);

    if (error instanceof Error) {
      if (error.message.includes('not found') || error.message.includes('not assigned')) {
        apiError(res, 403, 'ACCESS_FORBIDDEN', 'Access forbidden');
        return;
      }
    }

    apiError(res, 500, 'CONTEXT_LOAD_FAILED', 'Failed to load user context');
  }
};

export const requireOrgContext: RequestHandler = (req, res, next) => {
  if (!req.orgId) {
    console.error('requireOrgContext: orgId not found on request', {
      userId: req.user?.id,
      path: req.path,
      method: req.method,
    });
    apiError(res, 500, 'ORG_CONTEXT_MISSING', 'Organization context required but not available');
    return;
  }
  next();
};
