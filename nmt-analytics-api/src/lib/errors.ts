import { Response } from 'express';

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

export function apiError(res: Response, status: number, code: string, message: string, details?: unknown) {
  const body: ApiError = { code, message };
  if (details !== undefined) {
    body.details = details;
  }
  return res.status(status).json(body);
}
