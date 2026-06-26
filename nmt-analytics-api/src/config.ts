import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';

if (process.env.NODE_ENV !== 'production') {
  dotenv.config({
    path: path.resolve(process.cwd(), '.env'),
    override: true,
  });
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().transform(val => parseInt(val)).default(3001),

  // Supabase
  SUPABASE_URL: z.string().url('SUPABASE_URL must be a valid URL'),
  SUPABASE_ANON_KEY: z.string().optional(),
  // Service role key is STRICTLY required for the backend to function correctly
  SUPABASE_SERVICE_ROLE_KEY: z.string()
    .min(1, 'SUPABASE_SERVICE_ROLE_KEY is required')
    .refine(val => val.startsWith('ey'), 'SUPABASE_SERVICE_ROLE_KEY must be a valid JWT (starts with "ey")'),

  // Admin URL for CORS
  ADMIN_URL: z.string().url('ADMIN_URL must be a valid URL').default('http://localhost:5173'),

  // Dev-only bypass
  DEV_BYPASS_AUTH: z.string().optional().transform(val => val === 'true'),
  DEV_ORG_ID: z.string().uuid('DEV_ORG_ID must be a valid UUID').optional(),

  // Dev auto-bootstrap (creates org/profile/modules automatically)
  DEV_AUTO_BOOTSTRAP: z.string().optional().transform(val => val === 'true'),
  DEV_DEFAULT_ORG_NAME: z.string().default('NMT Analytics'),
  DEV_DEFAULT_ROLE: z.string().default('director'),
  DEV_DEFAULT_MODULES: z.string().default('dashboard,customers,packages,reservations,departures,payments,transactions'),
});

export type EnvConfig = z.infer<typeof envSchema>;

export function validateEnv(): EnvConfig {
  try {
    const parsed = envSchema.parse(process.env);

    // Safety & Diagnostic logs
    const url = new URL(parsed.SUPABASE_URL);
    console.log(`[CONFIG] Supabase Host: ${url.host}`);
    console.log(`[CONFIG] Service Role Key: ${parsed.SUPABASE_SERVICE_ROLE_KEY.substring(0, 8)}***`);

    // HARD PRODUCTION GUARD
    // Dev convenience flags must NEVER be active in production. Failing fast at
    // boot is safer than silently disabling: a misconfigured deploy will refuse
    // to serve rather than risk bypassed auth or auto-creating orgs for anyone
    // who signs up. Belt-and-suspenders with the per-request checks in auth.
    if (parsed.NODE_ENV === 'production') {
      const unsafeFlags: string[] = [];
      if (parsed.DEV_BYPASS_AUTH) unsafeFlags.push('DEV_BYPASS_AUTH');
      if (parsed.DEV_AUTO_BOOTSTRAP) unsafeFlags.push('DEV_AUTO_BOOTSTRAP');

      if (unsafeFlags.length > 0) {
        console.error('');
        console.error('❌ ========================================');
        console.error('❌  REFUSING TO START IN PRODUCTION');
        console.error(`❌  The following dev-only flags are set: ${unsafeFlags.join(', ')}`);
        console.error('❌  These flags disable authentication / auto-create tenants');
        console.error('❌  and MUST NOT be enabled in production.');
        console.error('❌  Remove them from the environment and redeploy.');
        console.error('❌  ========================================');
        console.error('');
        process.exit(1);
      }
    }

    if (parsed.DEV_BYPASS_AUTH) {
      console.warn('');
      console.warn('⚠️  ========================================');
      console.warn('⚠️  DEV_BYPASS_AUTH IS ENABLED');
      console.warn('⚠️  Requests without JWT will be accepted');
      console.warn('⚠️  This is for DEVELOPMENT ONLY');
      console.warn('⚠️  ========================================');
      console.warn('');
    }

    if (parsed.DEV_AUTO_BOOTSTRAP) {
      console.log('ℹ️  DEV_AUTO_BOOTSTRAP is enabled - will auto-create org/profile/modules for new users');
    }

    return parsed;
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('❌ Environment validation failed!');
      console.error('Missing or invalid environment variables:');

      error.issues.forEach((err) => {
        const path = err.path.join('.');
        console.error(`  - ${path}: ${err.message}`);
      });

      console.error('\nPlease check your .env file and ensure all required variables are set.');
      console.error('Required variables: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
    } else {
      console.error('❌ Unexpected error during environment validation:', error);
    }

    process.exit(1);
  }
}

// Export validated config
export const config = validateEnv();
