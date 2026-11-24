import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('../middleware/authenticateToken', () => ({ authenticateToken: (_req: any, _res: any, next: any) => next() }));
vi.mock('../middleware/requireOrgContext', () => ({ requireOrgContext: (_req: any, _res: any, next: any) => next() }));
vi.mock('../middleware/requireRole', () => ({ requireMinimumRole: () => (_req: any, _res: any, next: any) => next() }));
vi.mock('../middleware/auditLogger', () => ({
  auditReservationCreate: (_req: any, _res: any, next: any) => next(),
  auditReservationUpdate: (_req: any, _res: any, next: any) => next(),
  auditReservationDelete: (_req: any, _res: any, next: any) => next(),
}));
vi.mock('../lib/audit', () => ({ logAction: vi.fn() }));
vi.mock('../lib/notificationService', () => ({ notifyNewReservation: vi.fn() }));
vi.mock('../lib/supabase', () => ({ supabaseAdmin: {}, handleSupabaseError: vi.fn() }));

let schema: { safeParse: (value: unknown) => { success: boolean; error?: { issues: Array<{ path: Array<string | number> }> } } };

beforeAll(async () => {
  const routes = await import('../routes/reservations');
  schema = routes.createReservationSchema as typeof schema;
});

// Mirrors the reservation created by e2e/pilot-allocation-vehicle-workflow.spec.ts.
const departureId = '11111111-1111-4111-8111-111111111111';

describe('POST /reservations contract used by the allocation/vehicle acceptance workflow', () => {
  it('rejects a body without customerPhone and reservationAt (HTTP 400 VALIDATION_ERROR)', () => {
    const result = schema.safeParse({ departureId, customerName: 'Synthetic Slot Guest', partySize: 1, totalAmount: 100, status: 'confirmed' });
    expect(result.success).toBe(false);
    const paths = (result.error?.issues || []).map((issue) => issue.path.join('.'));
    expect(paths).toEqual(expect.arrayContaining(['customerPhone', 'reservationAt']));
  });

  it('accepts the complete synthetic body', () => {
    const result = schema.safeParse({
      departureId,
      customerName: 'Synthetic Slot Guest',
      customerPhone: '+38761000099',
      partySize: 1,
      reservationAt: '2042-07-01T10:00:00.000Z',
      totalAmount: 100,
      status: 'confirmed',
    });
    expect(result.success).toBe(true);
  });
});
