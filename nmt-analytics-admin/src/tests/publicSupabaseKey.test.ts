import { expect, it } from 'vitest';
import { assertPublicSupabaseKey } from '../lib/publicSupabaseKey';
const jwt = (role: string) => `header.${btoa(JSON.stringify({ role }))}.signature`;
it.each([jwt('anon'), 'sb_publishable_synthetic', 'legacy-public', undefined])('preserves supported public configuration', key => {
  expect(() => assertPublicSupabaseKey(key)).not.toThrow();
});
it.each([jwt('service_role'), 'sb_secret_synthetic_private'])('rejects privileged keys without disclosing them', key => {
  let error: unknown;
  try { assertPublicSupabaseKey(key); } catch (caught) { error = caught; }
  expect(error).toBeInstanceOf(Error);
  expect((error as Error).message).not.toContain(key);
});
