import { readFileSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import {
  PRODUCTION_SUPABASE_PROJECT_REF,
  checkSupabaseEnvironment,
  supabaseRefFromUrl,
} from '../lib/supabaseEnvironmentGuard';

const PROD = PRODUCTION_SUPABASE_PROJECT_REF;
const STAGING = 'stagingprojectref000';
const url = (ref: string) => `https://${ref}.supabase.co`;
const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
const jwt = (payload: object) => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}.signature`;

describe('supabase environment guard', () => {
  it('matches the build-time deployment guard configuration', () => {
    const guardFile = path.resolve(__dirname, '../../../scripts/deployment-guard.json');
    const guard = JSON.parse(readFileSync(guardFile, 'utf8'));
    expect(guard.productionSupabaseProjectRef).toBe(PRODUCTION_SUPABASE_PROJECT_REF);
  });

  it('extracts project refs only from Supabase hosts', () => {
    expect(supabaseRefFromUrl(url(STAGING))).toBe(STAGING);
    expect(supabaseRefFromUrl('http://127.0.0.1:54321')).toBeNull();
    expect(supabaseRefFromUrl('not a url')).toBeNull();
  });

  it('refuses a preview runtime wired to the production project', () => {
    const errors = checkSupabaseEnvironment({
      supabaseUrl: url(PROD), vercelEnv: 'preview', nodeEnv: 'production',
      serviceRoleKey: jwt({ role: 'service_role', ref: PROD }),
    });
    expect(errors.join('\n')).toMatch(/preview runtime must not use the production/);
  });

  it('allows a preview runtime on a separate project', () => {
    expect(checkSupabaseEnvironment({
      supabaseUrl: url(STAGING), vercelEnv: 'preview', nodeEnv: 'production',
      anonKey: jwt({ role: 'anon', ref: STAGING }),
      serviceRoleKey: jwt({ role: 'service_role', ref: STAGING }),
    })).toEqual([]);
  });

  it('preserves valid production configuration (Vercel and ZO)', () => {
    const keys = { anonKey: jwt({ role: 'anon', ref: PROD }), serviceRoleKey: jwt({ role: 'service_role', ref: PROD }) };
    expect(checkSupabaseEnvironment({ supabaseUrl: url(PROD), vercelEnv: 'production', nodeEnv: 'production', ...keys })).toEqual([]);
    expect(checkSupabaseEnvironment({ supabaseUrl: url(PROD), nodeEnv: 'production', ...keys })).toEqual([]);
  });

  it('refuses keys that belong to another project than the URL', () => {
    const errors = checkSupabaseEnvironment({
      supabaseUrl: url(STAGING), vercelEnv: 'preview', nodeEnv: 'production',
      serviceRoleKey: jwt({ role: 'service_role', ref: PROD }),
      anonKey: jwt({ role: 'anon', ref: PROD }),
    });
    expect(errors).toHaveLength(2);
    expect(errors.join('\n')).not.toContain('signature');
  });

  it('never allows dev auth bypass against production', () => {
    const errors = checkSupabaseEnvironment({
      supabaseUrl: url(PROD), nodeEnv: 'development', devBypassAuth: true, allowLocalProductionAccess: true,
    });
    expect(errors.join('\n')).toMatch(/DEV_BYPASS_AUTH/);
  });

  it('requires explicit acknowledgement for local development against production', () => {
    expect(checkSupabaseEnvironment({ supabaseUrl: url(PROD), nodeEnv: 'development' })).toHaveLength(1);
    expect(checkSupabaseEnvironment({ supabaseUrl: url(PROD), nodeEnv: 'development', allowLocalProductionAccess: true })).toEqual([]);
    expect(checkSupabaseEnvironment({ supabaseUrl: 'http://127.0.0.1:54321', nodeEnv: 'development' })).toEqual([]);
  });

  it('keeps the unit-test environment on a local placeholder project', () => {
    expect(checkSupabaseEnvironment({
      supabaseUrl: process.env.TRAVLINE_SUPABASE_URL!, nodeEnv: 'test',
      anonKey: process.env.TRAVLINE_SUPABASE_ANON_KEY, serviceRoleKey: process.env.TRAVLINE_SUPABASE_SERVICE_ROLE_KEY,
    })).toEqual([]);
  });
});
