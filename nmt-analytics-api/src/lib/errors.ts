import { Response } from 'express';

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

export function apiError(res: Response, status: number, code: string, message: string, details?: unknown) {
  const body: ApiError = { code, message };
  // Never expose provider/SQL diagnostics on internal failures.
  if (status < 500 && details !== undefined) {
    body.details = details;
  } else if (details && typeof details === 'object') {
    // Saved-sale recovery is a public error contract used to prevent duplicate
    // bookings. Preserve only its validated identifier/stage, never DB causes.
    const recovery = details as Record<string, unknown>;
    const stages = ['passengers', 'passenger_group', 'passenger_group_members', 'accommodation', 'snapshot', 'installments', 'completion'];
    if (typeof recovery.reservationId === 'string'
      && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(recovery.reservationId)
      && typeof recovery.stage === 'string' && stages.includes(recovery.stage)) {
      body.details = { reservationId: recovery.reservationId, stage: recovery.stage };
    }
  }
  return res.status(status).json(body);
}
