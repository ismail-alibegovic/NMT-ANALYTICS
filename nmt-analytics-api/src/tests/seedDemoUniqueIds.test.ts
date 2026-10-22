import { describe, expect, it, vi } from 'vitest';
import { supabaseAdmin } from '../lib/supabase';
import { uniqueIds } from '../scripts/seed_demo';

vi.mock('../lib/supabase', () => ({ supabaseAdmin: { from: vi.fn() } }));

describe('uniqueIds (golden demo seed helper)', () => {
  it('does not start database operations when imported', () => {
    expect(supabaseAdmin.from).not.toHaveBeenCalled();
  });
  it('deduplicates and drops null/undefined entries', () => {
    expect(uniqueIds(['a', 'b', 'a', null, undefined, 'b'])).toEqual(['a', 'b']);
  });

  it('returns an empty array when the registry has no ids for an entity (first run)', () => {
    expect(uniqueIds(undefined)).toEqual([]);
    expect(uniqueIds(null)).toEqual([]);
  });
});
