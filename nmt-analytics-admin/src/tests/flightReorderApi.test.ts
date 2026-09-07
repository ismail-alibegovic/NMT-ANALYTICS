import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiGet = vi.fn();
const apiPost = vi.fn();
const apiPatch = vi.fn();
const apiPut = vi.fn();
const apiDelete = vi.fn();

vi.mock('../api/client', () => ({
  get: (...args: any[]) => apiGet(...args),
  post: (...args: any[]) => apiPost(...args),
  patch: (...args: any[]) => apiPatch(...args),
  put: (...args: any[]) => apiPut(...args),
  del: (...args: any[]) => apiDelete(...args),
}));

import { reorderFlightSegments } from '../api/flights';

describe('reorderFlightSegments API contract (M13.1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiPut.mockResolvedValue({ data: [] });
  });

  it('sends PUT to the canonical backend reorder route', async () => {
    await reorderFlightSegments('dep-1', [
      { id: 'seg-a', direction: 'outbound', segmentOrder: 1 },
      { id: 'seg-b', direction: 'outbound', segmentOrder: 2 },
    ]);

    expect(apiPut).toHaveBeenCalledTimes(1);
    expect(apiPut).toHaveBeenCalledWith('/departures/dep-1/flights/reorder', {
      segments: [
        { id: 'seg-a', direction: 'outbound', segmentOrder: 1 },
        { id: 'seg-b', direction: 'outbound', segmentOrder: 2 },
      ],
    });
    expect(apiPatch).not.toHaveBeenCalled();
  });

  it('passes the complete segment set through unchanged', async () => {
    const segments = [
      { id: 'a', direction: 'outbound', segmentOrder: 1 },
      { id: 'b', direction: 'outbound', segmentOrder: 2 },
      { id: 'c', direction: 'outbound', segmentOrder: 3 },
      { id: 'd', direction: 'return', segmentOrder: 1 },
    ];

    await reorderFlightSegments('dep-2', segments);

    const payload = apiPut.mock.calls[0][1];
    expect(payload.segments).toHaveLength(4);
    expect(payload.segments).toEqual(segments);
  });
});
