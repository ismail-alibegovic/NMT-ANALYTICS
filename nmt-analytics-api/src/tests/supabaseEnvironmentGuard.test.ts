import { readFileSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { envSchema } from '../config';
import {
  PRODUCTION_SUPABASE_PROJECT_REF,
  checkSupabaseEnvironment,
  isSupportedSupabaseAnonKey,
  isSupportedSupabaseServiceKey,
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

  it('accepts modern sb_secret_ and sb_publishable_ keys alongside legacy JWTs in schema and guard', () => {
    const modernSecret = 'sb_secret_synthetic_prod_key_12345678';
    const modernPublishable = 'sb_publishable_synthetic_prod_key_12345678';
    expect(isSupportedSupabaseServiceKey(modernSecret)).toBe(true);
    expect(isSupportedSupabaseAnonKey(modernPublishable)).toBe(true);

    expect(envSchema.safeParse({
      NODE_ENV: 'production',
      SUPABASE_URL: url(PROD),
      SUPABASE_ANON_KEY: modernPublishable,
      SUPABASE_SERVICE_ROLE_KEY: modernSecret,
      ADMIN_URL: 'https://travline-ten.vercel.app',
    }).success).toBe(true);

    expect(envSchema.safeParse({
      NODE_ENV: 'production',
      SUPABASE_URL: url(STAGING),
      SUPABASE_ANON_KEY: modernPublishable,
      SUPABASE_SERVICE_ROLE_KEY: modernSecret,
      ADMIN_URL: 'https://preview.example.test',
    }).success).toBe(true);

    expect(checkSupabaseEnvironment({
      supabaseUrl: url(PROD), vercelEnv: 'production', nodeEnv: 'production',
      anonKey: modernPublishable, serviceRoleKey: modernSecret,
    })).toEqual([]);

    expect(checkSupabaseEnvironment({
      supabaseUrl: url(STAGING), vercelEnv: 'preview', nodeEnv: 'production',
      anonKey: modernPublishable, serviceRoleKey: modernSecret,
    })).toEqual([]);

    expect(envSchema.safeParse({
      NODE_ENV: 'production',
      SUPABASE_URL: url(PROD),
      SUPABASE_ANON_KEY: jwt({ role: 'anon', ref: PROD }),
      SUPABASE_SERVICE_ROLE_KEY: jwt({ role: 'service_role', ref: PROD }),
      ADMIN_URL: 'https://travline-ten.vercel.app',
    }).success).toBe(true);
  });

  it('rejects publishable, anon, or malformed keys in SUPABASE_SERVICE_ROLE_KEY and privileged keys in SUPABASE_ANON_KEY without leaking secrets', () => {
    const fakeSecret = 'sb_secret_leaked_check_value_99999';
    const fakePublishable = 'sb_publishable_wrong_slot_99999';
    const anonJwt = jwt({ role: 'anon', ref: STAGING });
    const serviceJwt = jwt({ role: 'service_role', ref: STAGING });

    const invalidPublishableInService = envSchema.safeParse({
      NODE_ENV: 'production',
      SUPABASE_URL: url(STAGING),
      SUPABASE_SERVICE_ROLE_KEY: fakePublishable,
    });
    expect(invalidPublishableInService.success).toBe(false);

    const invalidAnonJwtInService = envSchema.safeParse({
      NODE_ENV: 'production',
      SUPABASE_URL: url(STAGING),
      SUPABASE_SERVICE_ROLE_KEY: anonJwt,
    });
    expect(invalidAnonJwtInService.success).toBe(false);

    const invalidSecretInAnon = envSchema.safeParse({
      NODE_ENV: 'production',
      SUPABASE_URL: url(STAGING),
      SUPABASE_ANON_KEY: fakeSecret,
      SUPABASE_SERVICE_ROLE_KEY: serviceJwt,
    });
    expect(invalidSecretInAnon.success).toBe(false);

    const invalidServiceJwtInAnon = envSchema.safeParse({
      NODE_ENV: 'production',
      SUPABASE_URL: url(STAGING),
      SUPABASE_ANON_KEY: serviceJwt,
      SUPABASE_SERVICE_ROLE_KEY: fakeSecret,
    });
    expect(invalidServiceJwtInAnon.success).toBe(false);

    for (const badService of ['', 'opaque-key', 'sb_secret_short', 'sb_secret_bad whitespace_1234', 'eyOnlyTwo.parts']) {
      expect(envSchema.safeParse({
        NODE_ENV: 'production',
        SUPABASE_URL: url(STAGING),
        SUPABASE_SERVICE_ROLE_KEY: badService,
      }).success).toBe(false);
    }

    const guardErrors = checkSupabaseEnvironment({
      supabaseUrl: url(STAGING), vercelEnv: 'preview', nodeEnv: 'production',
      anonKey: fakeSecret,
      serviceRoleKey: fakePublishable,
    });
    expect(guardErrors).toHaveLength(2);
    expect(guardErrors.join('\n')).not.toContain(fakeSecret);
    expect(guardErrors.join('\n')).not.toContain(fakePublishable);
  });
});
