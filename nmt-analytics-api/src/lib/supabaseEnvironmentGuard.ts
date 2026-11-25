// Runtime guard against cross-environment Supabase access.
//
// The build-time guard (scripts/deployment-env.cjs) blocks unsafe deployments
// before they ship. This runtime check is the second line of defence: the API
// refuses to start if a non-production runtime is wired to the production
// project, or if keys from different projects are mixed. It never logs keys.

/**
 * Production Supabase project ref. Used ONLY as a denylist for non-production
 * runtimes; it never selects an endpoint. Must equal
 * scripts/deployment-guard.json (enforced by tests).
 */
export const PRODUCTION_SUPABASE_PROJECT_REF = 'hacutwknfgufrqlgdiia';

const SUPABASE_HOST = /^([a-z0-9]{20})\.supabase\.co$/;

export interface SupabaseEnvironmentInput {
  supabaseUrl: string;
  anonKey?: string;
  serviceRoleKey?: string;
  nodeEnv?: string;
  vercelEnv?: string;
  devBypassAuth?: boolean;
  devAutoBootstrap?: boolean;
  allowLocalProductionAccess?: boolean;
}

export function supabaseRefFromUrl(value: string): string | null {
  try {
    const match = SUPABASE_HOST.exec(new URL(value).hostname);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

export interface SupabaseJwtPayload {
  role?: unknown;
  ref?: unknown;
}

export function decodeSupabaseJwtPayload(key: string | undefined): SupabaseJwtPayload | null {
  if (!key || !key.startsWith('ey')) return null;
  const parts = key.split('.');
  if (parts.length !== 3 || parts.some((part) => !part)) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    return payload && typeof payload === 'object' ? (payload as SupabaseJwtPayload) : null;
  } catch {
    return null;
  }
}

function jwtRef(key: string | undefined): string | null {
  const payload = decodeSupabaseJwtPayload(key);
  return typeof payload?.ref === 'string' ? payload.ref : null;
}

export function isSupportedSupabaseServiceKey(key: string): boolean {
  if (!key || /\s/.test(key)) return false;
  if (/^sb_secret_[A-Za-z0-9_-]{8,}$/.test(key)) return true;
  if (!key.startsWith('ey')) return false;
  const parts = key.split('.');
  if (parts.length !== 3 || parts.some((part) => !part)) return false;
  const payload = decodeSupabaseJwtPayload(key);
  if (payload && typeof payload.role === 'string') {
    return payload.role === 'service_role';
  }
  return true;
}

export function isSupportedSupabaseAnonKey(key: string): boolean {
  if (!key || /\s/.test(key)) return false;
  if (key.startsWith('sb_secret_')) return false;
  const payload = decodeSupabaseJwtPayload(key);
  if (payload?.role === 'service_role') return false;
  return true;
}

/** Returns human-readable violations; empty when the environment is safe. */
export function checkSupabaseEnvironment(
  input: SupabaseEnvironmentInput,
  productionRef: string = PRODUCTION_SUPABASE_PROJECT_REF,
): string[] {
  const errors: string[] = [];
  const ref = supabaseRefFromUrl(input.supabaseUrl);
  const isProductionProject = ref !== null && ref === productionRef;

  if (input.vercelEnv && input.vercelEnv !== 'production' && isProductionProject) {
    errors.push(`Vercel ${input.vercelEnv} runtime must not use the production Supabase project`);
  }

  if (!input.vercelEnv && isProductionProject && (input.devBypassAuth || input.devAutoBootstrap)) {
    errors.push('DEV_BYPASS_AUTH / DEV_AUTO_BOOTSTRAP must never be enabled against the production Supabase project');
  }

  if (!input.vercelEnv && isProductionProject && input.nodeEnv === 'development' && !input.allowLocalProductionAccess) {
    errors.push('Local development is pointed at the production Supabase project. Use a local or staging project, or set TRAVLINE_ALLOW_LOCAL_PRODUCTION_ACCESS=true to acknowledge production access explicitly');
  }

  if (input.serviceRoleKey) {
    if (input.serviceRoleKey.startsWith('sb_publishable_')) {
      errors.push('TRAVLINE_SUPABASE_SERVICE_ROLE_KEY must not contain a publishable key');
    } else {
      const servicePayload = decodeSupabaseJwtPayload(input.serviceRoleKey);
      if (typeof servicePayload?.role === 'string' && servicePayload.role !== 'service_role') {
        errors.push('TRAVLINE_SUPABASE_SERVICE_ROLE_KEY is not a service_role key');
      }
    }
  }

  if (input.anonKey) {
    const anonPayload = decodeSupabaseJwtPayload(input.anonKey);
    if (input.anonKey.startsWith('sb_secret_') || anonPayload?.role === 'service_role') {
      errors.push('TRAVLINE_SUPABASE_ANON_KEY must not contain a privileged key');
    }
  }

  if (ref) {
    const serviceRef = jwtRef(input.serviceRoleKey);
    if (serviceRef && serviceRef !== ref) {
      errors.push('TRAVLINE_SUPABASE_SERVICE_ROLE_KEY belongs to a different Supabase project than TRAVLINE_SUPABASE_URL');
    }
    const anonRef = jwtRef(input.anonKey);
    if (anonRef && anonRef !== ref) {
      errors.push('TRAVLINE_SUPABASE_ANON_KEY belongs to a different Supabase project than TRAVLINE_SUPABASE_URL');
    }
  }

  return errors;
}
