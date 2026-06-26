import { Request, Response, NextFunction, RequestHandler } from 'express';
import { randomUUID } from 'crypto';

// Middleware to add request ID
export const requestId: RequestHandler = (req, res, next) => {
  // Read request ID from header if provided, otherwise generate UUID
  const id = req.get('x-request-id') || randomUUID();
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
    const path = req.path;
    const requestId = req.requestId;

    // Simple log format
    console.log(`${method} ${path} ${status} ${duration}ms ${requestId}`);
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
