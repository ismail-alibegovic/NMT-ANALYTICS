import { beforeEach, describe, expect, it, vi } from 'vitest';

const get = vi.fn();
const post = vi.fn();
const patch = vi.fn();
const del = vi.fn();

vi.mock('../api/client', () => ({ get, post, patch, del }));

describe('departure profitability admin API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads profitability from the departure-scoped endpoint', async () => {
    get.mockResolvedValueOnce({
      data: {
        departureId: 'departure-1',
        currency: 'BAM',
        revenue: 1000,
        collected: 300,
        outstanding: 700,
        supplierCosts: 250,
        estimatedGrossProfit: 750,
        marginPct: 75,
        supplierObligationsIssued: 250,
        supplierPaid: 100,
        supplierOutstanding: 150,
        realizedCashProfit: 200,
        reservationCount: 1,
        costItems: [],
        costBreakdown: [],
        warnings: [],
      },
    });

    const { getDepartureProfitability } = await import('../api/departures');
    const result = await getDepartureProfitability('departure-1');

    expect(get).toHaveBeenCalledWith('/departures/departure-1/profitability');
    expect(result.collected).toBe(300);
    expect(result.outstanding).toBe(700);
    expect(result.supplierObligationsIssued).toBe(250);
    expect(result.supplierPaid).toBe(100);
    expect(result.supplierOutstanding).toBe(150);
    expect(result.realizedCashProfit).toBe(200);
  });

  it('creates, updates, and deletes departure cost items through scoped endpoints', async () => {
    post.mockResolvedValueOnce({ data: { costItem: { id: 'cost-1' } } });
    patch.mockResolvedValueOnce({ data: { costItem: { id: 'cost-1', label: 'Hotel' } } });
    del.mockResolvedValueOnce({ data: null });

    const { createDepartureCostItem, updateDepartureCostItem, deleteDepartureCostItem } = await import('../api/departures');

    await createDepartureCostItem('departure-1', {
      category: 'hotel',
      label: 'Hotel allotment',
      quantity: 2,
      unitCost: 120,
      currency: 'BAM',
    });
    await updateDepartureCostItem('departure-1', 'cost-1', { label: 'Hotel' });
    await deleteDepartureCostItem('departure-1', 'cost-1');

    expect(post).toHaveBeenCalledWith('/departures/departure-1/cost-items', {
      category: 'hotel',
      label: 'Hotel allotment',
      quantity: 2,
      unitCost: 120,
      currency: 'BAM',
    });
    expect(patch).toHaveBeenCalledWith('/departures/departure-1/cost-items/cost-1', { label: 'Hotel' });
    expect(del).toHaveBeenCalledWith('/departures/departure-1/cost-items/cost-1');
  });
});
