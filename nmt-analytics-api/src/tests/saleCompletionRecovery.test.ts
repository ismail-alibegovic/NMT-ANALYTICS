import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../lib/supabase', () => ({ supabaseAdmin: {}, handleSupabaseError: vi.fn() }));
import { resumeSaleCompletion } from '../lib/saleCompletionRecovery';

let stored: any; let payments: any[]; let rpcError: any; let loseClaim: boolean;
const calls: Array<{ table: string; orgIds: unknown[] }> = [];
const rpc = vi.fn(async (_name: string, args: any) => {
  if (rpcError) return { data: null, error: rpcError };
  payments = args.p_schedule.map((row: any, index: number) => ({ id: 'installment-' + index, ...row }));
  return { data: payments, error: null };
});
const database: any = {
  rpc,
  from: vi.fn((table: string) => {
    const filters: Array<(row: any) => boolean> = []; let update: any;
    const call = { table, orgIds: [] as unknown[] }; calls.push(call);
    const execute = async (single = false) => {
      if (loseClaim && update?.creation_state === 'in_progress') { stored.creation_state = 'in_progress'; loseClaim = false; }
      const rows = (table === 'reservations' ? [stored] : payments).filter(row => filters.every(filter => filter(row)));
      if (update) rows.forEach(row => Object.assign(row, update));
      return { data: single ? rows[0] || null : rows, error: null };
    };
    const builder: any = {
      update: (value: any) => { update = value; return builder; }, select: () => builder,
      eq: (key: string, value: unknown) => { if (key === 'org_id') call.orgIds.push(value); filters.push(row => row[key] === value); return builder; },
      neq: (key: string, value: unknown) => { filters.push(row => row[key] !== value); return builder; },
      not: () => builder, order: () => builder, maybeSingle: () => execute(true),
      then: (resolve: any) => execute().then(resolve),
    }; return builder;
  }),
};
beforeEach(() => {
  stored = { id: 'sale-a', org_id: 'org-a', status: 'pending', creation_state: 'recovery_required', creation_error_stage: 'installments', total_amount: 180, currency: 'BAM', created_at: '2026-10-14T10:00:00Z' };
  payments = []; rpcError = null; loseClaim = false; calls.length = 0; vi.clearAllMocks();
});
describe('saved sale completion recovery', () => {
  it('creates the missing schedule once on the same reservation', async () => {
    const result = await resumeSaleCompletion({ ...stored }, 'org-a', 2, database);
    expect(result.recovered).toBe(true); expect(result.sale.id).toBe('sale-a');
    expect(stored.creation_state).toBe('completed');
    expect(payments.map(row => row.amount)).toEqual([90, 90]);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(calls.every(call => call.orgIds.includes('org-a'))).toBe(true);
  });
  it('reuses a valid schedule including paid history without replacing rows', async () => {
    payments = [1, 2].map(number => ({ id: 'existing-' + number, org_id: 'org-a', reservation_id: 'sale-a', amount: 90, currency: 'BAM', installment_number: number, status: 'succeeded' }));
    await resumeSaleCompletion({ ...stored }, 'org-a', 2, database);
    expect(payments.map(row => row.id)).toEqual(['existing-1', 'existing-2']); expect(rpc).not.toHaveBeenCalled();
  });
  it('preserves incompatible historical or manually changed terms', async () => {
    payments = [{ id: 'history', org_id: 'org-a', reservation_id: 'sale-a', amount: 180, currency: 'BAM', installment_number: 1 }];
    await expect(resumeSaleCompletion({ ...stored }, 'org-a', 2, database)).rejects.toMatchObject({ code: 'SALE_MANUAL_RECOVERY_REQUIRED', status: 409 });
    expect(stored.creation_state).toBe('recovery_required'); expect(payments).toHaveLength(1); expect(rpc).not.toHaveBeenCalled();
  });
  it('does not create another schedule when a concurrent request wins the claim', async () => {
    loseClaim = true;
    const result = await resumeSaleCompletion({ ...stored }, 'org-a', 2, database);
    expect(result.recovered).toBe(false); expect(result.sale.creation_state).toBe('in_progress'); expect(rpc).not.toHaveBeenCalled();
  });
  it('restores visible recovery state after schedule failure', async () => {
    rpcError = new Error('schedule unavailable');
    await expect(resumeSaleCompletion({ ...stored }, 'org-a', 2, database)).rejects.toThrow('schedule unavailable');
    expect(stored.creation_state).toBe('recovery_required'); expect(stored.creation_error_stage).toBe('installments'); expect(payments).toHaveLength(0);
  });
  it('retries finalization without recreating business data', async () => {
    stored.creation_error_stage = 'completion';
    await resumeSaleCompletion({ ...stored }, 'org-a', undefined, database);
    expect(stored.creation_state).toBe('completed'); expect(rpc).not.toHaveBeenCalled();
  });
  it('does not revive cancelled sales or claim another tenant sale', async () => {
    stored.status = 'cancelled';
    await expect(resumeSaleCompletion({ ...stored }, 'org-a', 2, database)).rejects.toMatchObject({ code: 'SALE_CANCELLED' });
    expect(database.from).not.toHaveBeenCalled(); stored.status = 'pending';
    await expect(resumeSaleCompletion({ ...stored }, 'org-b', 2, database)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(stored.creation_state).toBe('recovery_required');
  });
  it.each(['passengers', 'passenger_group', 'accommodation', 'snapshot'])('keeps %s failures for explicit manual review', async stage => {
    stored.creation_error_stage = stage;
    const result = await resumeSaleCompletion({ ...stored }, 'org-a', 2, database);
    expect(result.recovered).toBe(false); expect(stored.creation_state).toBe('recovery_required'); expect(database.from).not.toHaveBeenCalled();
  });
});
