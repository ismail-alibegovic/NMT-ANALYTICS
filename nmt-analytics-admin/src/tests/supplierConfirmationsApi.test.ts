import { beforeEach, describe, expect, it, vi } from 'vitest';

const get = vi.fn();
const post = vi.fn();

vi.mock('../api/client', () => ({ get, post }));

describe('supplier confirmation admin API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sets a cost item confirmation status with an optional note', async () => {
    post.mockResolvedValueOnce({ data: { costItem: { id: 'cost-1', confirmationStatus: 'confirmed' } } });

    const { setCostItemConfirmation } = await import('../api/departures');
    const result = await setCostItemConfirmation('departure-1', 'cost-1', 'confirmed', 'Voucher 123 received');

    expect(post).toHaveBeenCalledWith(
      '/departures/departure-1/cost-items/cost-1/confirmation',
      { status: 'confirmed', note: 'Voucher 123 received' }
    );
    expect(result.confirmationStatus).toBe('confirmed');
  });

  it('omits the note key when no note is provided', async () => {
    post.mockResolvedValueOnce({ data: { costItem: { id: 'cost-1', confirmationStatus: 'requested' } } });

    const { setCostItemConfirmation } = await import('../api/departures');
    await setCostItemConfirmation('departure-1', 'cost-1', 'requested');

    expect(post).toHaveBeenCalledWith(
      '/departures/departure-1/cost-items/cost-1/confirmation',
      { status: 'requested' }
    );
  });

  it('loads the confirmation events history with the default limit', async () => {
    get.mockResolvedValueOnce({ data: { departureId: 'departure-1', events: [{ id: 'event-1', status: 'confirmed' }] } });

    const { getSupplierConfirmationEvents } = await import('../api/departures');
    const events = await getSupplierConfirmationEvents('departure-1');

    expect(get).toHaveBeenCalledWith(
      '/departures/departure-1/supplier-confirmation-events',
      { params: { limit: 100 } }
    );
    expect(events).toHaveLength(1);
    expect(events[0].status).toBe('confirmed');
  });
});
