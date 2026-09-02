import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiGet = vi.fn();
const apiPost = vi.fn();
const apiPatch = vi.fn();
const apiDelete = vi.fn();

vi.mock('../api/client', () => ({
  get: (...args: any[]) => apiGet(...args),
  post: (...args: any[]) => apiPost(...args),
  patch: (...args: any[]) => apiPatch(...args),
  del: (...args: any[]) => apiDelete(...args),
}));

describe('package services admin API contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads package services through the canonical query endpoint', async () => {
    apiGet.mockResolvedValue({ data: { data: [] } });

    const { getPackageServices } = await import('../api/operations');
    await getPackageServices('package-1');

    expect(apiGet).toHaveBeenCalledWith('/package-services', {
      params: { packageId: 'package-1', limit: 200 },
    });
  });

  it('creates package services through the canonical body contract', async () => {
    const created = {
      id: 'service-1',
      packageId: 'package-1',
      serviceType: 'insurance',
      providerName: 'Travel insurance',
      providerContact: null,
      unitPrice: 50,
      currency: 'BAM',
      quantity: 1,
      totalPrice: 50,
      description: null,
      isOptional: true,
      createdAt: '2027-01-01T00:00:00.000Z',
    };
    apiPost.mockResolvedValue({ data: created });

    const { createPackageService } = await import('../api/operations');
    await createPackageService('package-1', {
      serviceType: 'insurance',
      providerName: 'Travel insurance',
      unitPrice: 50,
      quantity: 1,
      description: 'Coverage',
      isOptional: true,
    });

    expect(apiPost).toHaveBeenCalledWith('/package-services', {
      packageId: 'package-1',
      serviceType: 'insurance',
      providerName: 'Travel insurance',
      unitPrice: 50,
      quantity: 1,
      description: 'Coverage',
      isOptional: true,
    });
  });
});
