import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
vi.mock('../lib/supabase', () => ({ supabaseAdmin: {} }));
import { campaignCreateSchema, campaignUpdateSchema } from '../lib/campaigns';

describe('bounded collection validation resource safety', () => {
  it('rejects an oversized array without parsing attacker-controlled entries', () => {
    let reads = 0;
    const payload = new Proxy(new Array(1000), {
      get(target, key, receiver) {
        if (typeof key === 'string' && /^\d+$/.test(key)) { reads++; return 'synthetic'; }
        return Reflect.get(target, key, receiver);
      },
    });
    const result = z.array(z.string()).max(10).safeParse(payload);
    expect(result.success).toBe(false);
    expect(reads).toBe(0);
  });
  it('still validates every entry within an allowed collection', () => {
    const schema = z.array(z.string().min(1)).max(10);
    expect(schema.safeParse(['valid', 'values']).success).toBe(true);
    expect(schema.safeParse(['valid', '']).success).toBe(false);
  });
});

describe('patched validator preserves disabled integration schema startup', () => {
  it('accepts partial edits without removing full-create channel constraints', () => {
    expect(campaignUpdateSchema.safeParse({ name: 'Synthetic renamed draft' }).success).toBe(true);
    expect(campaignUpdateSchema.safeParse({ body: '' }).success).toBe(false);
    expect(campaignCreateSchema.safeParse({ name: 'Synthetic', channel: 'email', body: 'Message' }).success).toBe(false);
    expect(campaignCreateSchema.safeParse({ name: 'Synthetic', channel: 'sms', subject: 'Forbidden subject', body: 'Message' }).success).toBe(false);
    expect(campaignCreateSchema.safeParse({ name: 'Synthetic', channel: 'sms', body: 'a'.repeat(321) }).success).toBe(false);
    expect(campaignCreateSchema.safeParse({ name: 'Synthetic', channel: 'email', subject: 'Required subject', body: 'Message' }).success).toBe(true);
  });
});
