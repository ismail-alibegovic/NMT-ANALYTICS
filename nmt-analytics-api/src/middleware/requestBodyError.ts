import type { ErrorRequestHandler } from 'express';

const bodyErrors: Record<string, { status: number; code: string; message: string }> = {
  'entity.parse.failed': { status: 400, code: 'INVALID_JSON', message: 'Invalid JSON request body' },
  'entity.too.large': { status: 413, code: 'PAYLOAD_TOO_LARGE', message: 'Request body exceeds the permitted size' },
  'encoding.unsupported': { status: 415, code: 'UNSUPPORTED_ENCODING', message: 'Unsupported request encoding' },
  'charset.unsupported': { status: 415, code: 'UNSUPPORTED_CHARSET', message: 'Unsupported request charset' },
  'request.size.invalid': { status: 400, code: 'INVALID_REQUEST_BODY', message: 'Invalid request body' },
  'request.aborted': { status: 400, code: 'INVALID_REQUEST_BODY', message: 'Invalid request body' },
};

/** Parser failures are client errors, not internal incidents. Never reflect the
 * raw body, compression diagnostics, charset or caller-controlled encoding. */
export const requestBodyError: ErrorRequestHandler = (error, _req, res, next) => {
  const mapped = typeof error?.type === 'string' && Object.prototype.hasOwnProperty.call(bodyErrors, error.type)
    ? bodyErrors[error.type] : undefined;
  if (!mapped || error.status !== mapped.status || res.headersSent) return next(error);
  return res.status(mapped.status).json({ code: mapped.code, message: mapped.message });
};
