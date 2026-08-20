import { describe, expect, it } from 'vitest';
import { resolveAgencyConfiguration } from '../lib/agencyCapabilities';

describe('resolveAgencyConfiguration', () => {
  it('keeps legacy organizations unconfigured for fail-open compatibility', () => {
    expect(resolveAgencyConfiguration(null, null)).toEqual({
      profiles: [],
      capabilities: [],
      configured: false,
    });
  });

  it('combines capabilities for multi-model agencies without duplicates', () => {
    const result = resolveAgencyConfiguration(
      ['group_tours', 'dmc_incoming'],
      ['b2b_distribution'],
    );

    expect(result.configured).toBe(true);
    expect(result.profiles).toEqual(['group_tours', 'dmc_incoming']);
    expect(result.capabilities).toContain('group_operations');
    expect(result.capabilities).toContain('tailor_made_itineraries');
    expect(result.capabilities).toContain('b2b_distribution');
    expect(new Set(result.capabilities).size).toBe(result.capabilities.length);
  });

  it('ignores unknown profile and capability values', () => {
    expect(resolveAgencyConfiguration(['unknown'], ['invalid'])).toEqual({
      profiles: [],
      capabilities: [],
      configured: false,
    });
  });
});
