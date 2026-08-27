import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';

/**
 * Route-contract tests for the Communication Center send/preview endpoints.
 * Exact status codes only — no permissive status arrays.
 */

const ORG = '00000000-0000-0000-0000-0000000000aa';

const resolveRecipientsMock = vi.fn();
const sendEmailMock = vi.fn();
const sendSmsMock = vi.fn();

class NotFound extends Error {
  constructor(msg = 'Target not found') {
    super(msg);
    this.name = 'RecipientTargetNotFoundError';
  }
}

vi.mock('../lib/recipientResolver', () => ({
  resolveRecipients: resolveRecipientsMock,
  isBulkTarget: (t: string) => t === 'group' || t === 'departure',
  RecipientTargetNotFoundError: NotFound,
}));

vi.mock('../lib/manualMessaging', () => ({
  sendManualEmailForOrg: sendEmailMock,
  sendManualSmsForOrg: sendSmsMock,
}));

vi.mock('../middleware/authenticateToken', () => ({
  authenticateToken: (_req: Request, _res: Response, next: NextFunction) => next(),
}));

vi.mock('../middleware/requireOrgContext', () => ({
  requireOrgContext: (req: Request, _res: Response, next: NextFunction) => {
    (req as any).orgId = ORG;
    next();
  },
}));

vi.mock('../middleware/requireRole', () => ({
  requireMinimumRole: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));

function resolution(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    targetType: 'direct',
    channel: 'email',
    totalCandidates: 1,
    sendableRecipients: 1,
    skippedEmpty: 0,
    skippedInvalid: 0,
    skippedDuplicates: 0,
    recipients: [{ contact: 'a@x.com', name: 'A', passengerId: null, reservationId: null, departureId: null }],
    skipped: [],
    relatedReservationId: null,
    relatedDepartureId: null,
    ...overrides,
  };
}

let app: express.Express;

beforeAll(async () => {
  const router = (await import('../routes/communicationSend')).default;
  app = express();
  app.use(express.json());
  app.use('/api', router);
});

beforeEach(() => {
  resolveRecipientsMock.mockReset();
  sendEmailMock.mockReset();
  sendSmsMock.mockReset();
});

describe('POST /api/communication/recipients/preview', () => {
  it('returns 200 with the resolution and never sends', async () => {
    resolveRecipientsMock.mockResolvedValue(resolution());
    const res = await request(app)
      .post('/api/communication/recipients/preview')
      .send({ channel: 'email', targetType: 'direct', email: 'a@x.com' });
    expect(res.status).toBe(200);
    expect(res.body.resolution.sendableRecipients).toBe(1);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('returns 404 when the target is in another org', async () => {
    resolveRecipientsMock.mockRejectedValue(new NotFound('Reservation not found'));
    const res = await request(app)
      .post('/api/communication/recipients/preview')
      .send({ channel: 'email', targetType: 'reservation', targetId: '11111111-1111-4111-8111-111111111111' });
    expect(res.status).toBe(404);
  });
});

describe('POST /api/communication/send', () => {
  it('returns 200 and sends one email for a direct target', async () => {
    resolveRecipientsMock.mockResolvedValue(resolution());
    sendEmailMock.mockResolvedValue(undefined);
    const res = await request(app)
      .post('/api/communication/send')
      .send({ channel: 'email', targetType: 'direct', email: 'a@x.com', subject: 'Hi', body: 'Body' });
    expect(res.status).toBe(200);
    expect(res.body.sent).toBe(1);
    expect(res.body.failed).toBe(0);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
  });

  it('returns 400 when an email send has no subject', async () => {
    const res = await request(app)
      .post('/api/communication/send')
      .send({ channel: 'email', targetType: 'direct', email: 'a@x.com', body: 'Body' });
    expect(res.status).toBe(400);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('returns 409 for a bulk group target without explicit confirmation', async () => {
    resolveRecipientsMock.mockResolvedValue(
      resolution({ targetType: 'group', totalCandidates: 2, sendableRecipients: 2 }),
    );
    const res = await request(app)
      .post('/api/communication/send')
      .send({ channel: 'email', targetType: 'group', targetId: '22222222-2222-4222-8222-222222222222', subject: 'Hi', body: 'B' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('CONFIRMATION_REQUIRED');
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('returns 200 and sends to every member for a confirmed bulk group target', async () => {
    resolveRecipientsMock.mockResolvedValue(
      resolution({
        targetType: 'group',
        totalCandidates: 2,
        sendableRecipients: 2,
        recipients: [
          { contact: 'a@x.com', name: 'A', passengerId: 'p1', reservationId: null, departureId: 'd1' },
          { contact: 'b@x.com', name: 'B', passengerId: 'p2', reservationId: null, departureId: 'd1' },
        ],
        relatedDepartureId: 'd1',
      }),
    );
    sendEmailMock.mockResolvedValue(undefined);
    const res = await request(app)
      .post('/api/communication/send')
      .send({ channel: 'email', targetType: 'group', targetId: '22222222-2222-4222-8222-222222222222', subject: 'Hi', body: 'B', confirm: true });
    expect(res.status).toBe(200);
    expect(res.body.sent).toBe(2);
    expect(sendEmailMock).toHaveBeenCalledTimes(2);
  });

  it('returns 422 when there are no sendable recipients', async () => {
    resolveRecipientsMock.mockResolvedValue(
      resolution({ totalCandidates: 1, sendableRecipients: 0, skippedEmpty: 1, recipients: [] }),
    );
    const res = await request(app)
      .post('/api/communication/send')
      .send({ channel: 'email', targetType: 'passenger', targetId: '33333333-3333-4333-8333-333333333333', subject: 'Hi', body: 'B' });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('NO_SENDABLE_RECIPIENTS');
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('returns 404 when the send target is in another org', async () => {
    resolveRecipientsMock.mockRejectedValue(new NotFound('Departure not found'));
    const res = await request(app)
      .post('/api/communication/send')
      .send({ channel: 'sms', targetType: 'departure', targetId: '44444444-4444-4444-8444-444444444444', body: 'B' });
    expect(res.status).toBe(404);
  });

  it('returns 200 and sends one SMS for a direct target (no subject needed)', async () => {
    resolveRecipientsMock.mockResolvedValue(
      resolution({ channel: 'sms', recipients: [{ contact: '+38761000001', name: null, passengerId: null, reservationId: null, departureId: null }] }),
    );
    sendSmsMock.mockResolvedValue(undefined);
    const res = await request(app)
      .post('/api/communication/send')
      .send({ channel: 'sms', targetType: 'direct', phone: '+38761000001', body: 'B' });
    expect(res.status).toBe(200);
    expect(res.body.sent).toBe(1);
    expect(sendSmsMock).toHaveBeenCalledTimes(1);
  });
});
