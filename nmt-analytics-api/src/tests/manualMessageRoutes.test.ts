import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

let currentOrgId = 'org-1';

const sendManualEmailForOrg = vi.fn(async () => undefined);
const sendManualSmsForOrg = vi.fn(async () => undefined);

vi.mock('../middleware/authenticateToken', () => ({
  authenticateToken: (req: any, _res: any, next: any) => {
    req.user = { id: 'user-1', email: 'director@example.ba', role: 'director' };
    next();
  },
}));

vi.mock('../middleware/requireOrgContext', () => ({
  requireOrgContext: (req: any, _res: any, next: any) => {
    req.orgId = currentOrgId;
    next();
  },
}));

vi.mock('../middleware/requireRole', () => ({
  requireMinimumRole: () => (_req: any, _res: any, next: any) => next(),
}));

vi.mock('../middleware/auditLogger', () => ({
  auditReservationCreate: (_req: any, _res: any, next: any) => next(),
  auditReservationUpdate: (_req: any, _res: any, next: any) => next(),
  auditReservationDelete: (_req: any, _res: any, next: any) => next(),
  auditDepartureCreate: (_req: any, _res: any, next: any) => next(),
  auditDepartureUpdate: (_req: any, _res: any, next: any) => next(),
  auditDepartureDelete: (_req: any, _res: any, next: any) => next(),
}));

vi.mock('../lib/notificationService', () => ({
  notifyNewReservation: vi.fn(async () => undefined),
}));

vi.mock('../lib/email/EmailService', () => ({
  EmailService: {
    sendBookingConfirmation: vi.fn(async () => undefined),
  },
}));

vi.mock('../lib/orgBranding', () => ({
  getOrgBranding: vi.fn(async () => ({})),
}));

vi.mock('../lib/pdfGenerator', () => ({
  generateVoucherPDF: vi.fn(async () => Buffer.from('pdf')),
  generateInvoicePDF: vi.fn(async () => Buffer.from('pdf')),
}));

vi.mock('../lib/audit', () => ({
  logAction: vi.fn(async () => undefined),
}));

vi.mock('../lib/manualMessaging', () => ({
  manualMessageSchema: {
    safeParse: (value: any) => ({ success: true, data: value }),
  },
  sendManualEmailForOrg,
  sendManualSmsForOrg,
}));

vi.mock('../lib/supabase', () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => {
      const filters: Record<string, any> = {};
      const builder: any = {
        select: vi.fn(() => builder),
        eq: vi.fn((column: string, value: any) => {
          filters[column] = value;
          return builder;
        }),
        single: vi.fn(async () => {
          if (table === 'reservations') {
            if (filters.id === 'res-1' && filters.org_id === 'org-1') {
              return { data: { id: 'res-1', org_id: 'org-1', departure_id: 'dep-1' }, error: null };
            }
            return { data: null, error: { code: 'PGRST116' } };
          }
          if (table === 'departures') {
            if (filters.id === 'dep-1' && filters.org_id === 'org-1') {
              return { data: { id: 'dep-1', org_id: 'org-1' }, error: null };
            }
            return { data: null, error: { code: 'PGRST116' } };
          }
          throw new Error(`Unhandled table: ${table}`);
        }),
      };
      return builder;
    }),
  },
  handleSupabaseError: (res: any, _error: unknown, message: string) =>
    res.status(500).json({ code: 'DB_ERROR', message }),
}));

let app: express.Express;

beforeAll(async () => {
  app = express();
  app.use(express.json());
  const reservations = await import('../routes/reservations');
  const departures = await import('../routes/departures');
  app.use('/api', reservations.default);
  app.use('/api', departures.default);
});

beforeEach(() => {
  currentOrgId = 'org-1';
  sendManualEmailForOrg.mockClear();
  sendManualSmsForOrg.mockClear();
});

describe('manual message routes', () => {
  it('sends reservation email with reservation/departure linkage', async () => {
    const res = await request(app)
      .post('/api/reservations/res-1/manual-message')
      .send({ channel: 'email', recipient: 'guest@example.ba', subject: 'Subject', body: 'Body' });

    expect(res.status).toBe(200);
    expect(sendManualEmailForOrg).toHaveBeenCalledWith(expect.objectContaining({
      channel: 'email',
      recipient: 'guest@example.ba',
      orgId: 'org-1',
      relatedReservationId: 'res-1',
      relatedDepartureId: 'dep-1',
    }));
  });

  it('sends reservation SMS', async () => {
    const res = await request(app)
      .post('/api/reservations/res-1/manual-message')
      .send({ channel: 'sms', recipient: '+38761111000', body: 'Body' });

    expect(res.status).toBe(200);
    expect(sendManualSmsForOrg).toHaveBeenCalledWith(expect.objectContaining({
      channel: 'sms',
      recipient: '+38761111000',
      orgId: 'org-1',
      relatedReservationId: 'res-1',
      relatedDepartureId: 'dep-1',
    }));
  });

  it('sends departure email', async () => {
    const res = await request(app)
      .post('/api/departures/dep-1/manual-message')
      .send({ channel: 'email', recipient: 'ops@example.ba', subject: 'Subject', body: 'Body' });

    expect(res.status).toBe(200);
    expect(sendManualEmailForOrg).toHaveBeenCalledWith(expect.objectContaining({
      orgId: 'org-1',
      relatedDepartureId: 'dep-1',
    }));
  });

  it('sends departure SMS', async () => {
    const res = await request(app)
      .post('/api/departures/dep-1/manual-message')
      .send({ channel: 'sms', recipient: '+38761111000', body: 'Body' });

    expect(res.status).toBe(200);
    expect(sendManualSmsForOrg).toHaveBeenCalledWith(expect.objectContaining({
      orgId: 'org-1',
      relatedDepartureId: 'dep-1',
    }));
  });

  it('keeps org isolation for wrong-org reservation', async () => {
    currentOrgId = 'org-2';

    const res = await request(app)
      .post('/api/reservations/res-1/manual-message')
      .send({ channel: 'email', recipient: 'guest@example.ba', subject: 'Subject', body: 'Body' });

    expect(res.status).toBe(404);
    expect(sendManualEmailForOrg).not.toHaveBeenCalled();
  });
});
