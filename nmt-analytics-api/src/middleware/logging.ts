import { Request, Response, NextFunction, RequestHandler } from 'express';
import { randomUUID } from 'crypto';
import { captureHandled } from './sentry';

// Middleware to add request ID
export const requestId: RequestHandler = (req, res, next) => {
  // Read request ID from header if provided, otherwise generate UUID
  const supplied = req.get('x-request-id');
  const id = supplied && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(supplied)
    ? supplied : randomUUID();
  req.requestId = id;
  req.startTime = Date.now();

  // Add requestId to response headers
  res.setHeader('X-Request-ID', id);

  next();
};

// Middleware to log requests
export const requestLogging: RequestHandler = (req, res, next) => {
  // Log when response is finished
  res.on('finish', () => {
    const duration = Date.now() - req.startTime;
    const status = res.statusCode;
    const method = req.method;
    // Only application-defined route templates may enter telemetry. Raw paths,
    // query strings and caller-supplied correlation IDs can contain secrets.
    const path = typeof req.route?.path === 'string' ? req.route.path : '[unmatched]';
    const requestId = req.requestId;

    // Simple log format
    console.log(`${method} ${path} ${status} ${duration}ms ${requestId}`);
    const area = /^\/(api\/)?(payments|finance|reservations|supplier-payables)(\/|$)/.test(req.originalUrl)
      ? 'finance' : 'api';
    if (status === 401 || status === 403 || status >= 500) {
      console.warn(JSON.stringify({ event: 'http_failure', area, status, method, requestId }));
    }
    // Caught route/database failures often respond directly and never reach
    // Express error middleware. Capture a synthetic error without response data.
    if (status >= 500) captureHandled(new Error('HTTP server failure'), {
      'operation.area': area, 'http.status_code': status,
    });
  });

  next();
};

// Helper to create error responses with consistent format
export function createErrorResponse(
  code: string,
  message: string,
  details?: any
) {
  const error: any = { code, message };
  if (details) {
    error.details = details;
  }
  return { error };
}

// Helper to create success responses with consistent format
export function createSuccessResponse<T>(
  data: T,
  meta?: any
) {
  const response: any = { data };
  if (meta) {
    response.meta = meta;
  }
  return response;
}
