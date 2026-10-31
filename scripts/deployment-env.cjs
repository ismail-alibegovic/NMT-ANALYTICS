#!/usr/bin/env node
// Travline deployment environment guard.
//
// Validates that a build is about to use the Supabase project that belongs to
// its deployment target, and blocks the build otherwise. It never selects or
// falls back to an endpoint: every value comes from the deployment's own
// environment variables. Output never contains key material.
//
// Usage: node scripts/deployment-env.cjs check
'use strict';

const guard = require('./deployment-guard.json');

const HOSTED_TARGETS = new Set(['production', 'preview', 'development']);
const EXPLICIT_TARGETS = new Set(['production', 'preview', 'local', 'ci']);
const SUPABASE_HOST = /^([a-z0-9]{20})\.supabase\.co$/;

/** Decide the deployment target. Vercel's own VERCEL_ENV always wins. */
function resolveTarget(env) {
  if (env.VERCEL === '1' || env.VERCEL_ENV) {
    if (HOSTED_TARGETS.has(env.VERCEL_ENV)) return { target: env.VERCEL_ENV, source: 'VERCEL_ENV' };
    return { target: null, source: 'VERCEL_ENV', error: `Unknown or missing VERCEL_ENV on a Vercel build (got "${env.VERCEL_ENV || ''}")` };
  }
  if (env.TRAVLINE_DEPLOY_TARGET) {
    if (EXPLICIT_TARGETS.has(env.TRAVLINE_DEPLOY_TARGET)) return { target: env.TRAVLINE_DEPLOY_TARGET, source: 'TRAVLINE_DEPLOY_TARGET' };
    return { target: null, source: 'TRAVLINE_DEPLOY_TARGET', error: `Unsupported TRAVLINE_DEPLOY_TARGET "${env.TRAVLINE_DEPLOY_TARGET}"` };
  }
  return { target: 'local', source: 'default' };
}

/** Extract the Supabase project ref from a *.supabase.co URL, or null. */
function supabaseRefFromUrl(value) {
  try {
    const match = SUPABASE_HOST.exec(new URL(value).hostname);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

/** Decode a JWT payload without verifying it. Returns null for non-JWT keys. */
function decodeJwtPayload(key) {
  if (typeof key !== 'string') return null;
  const parts = key.split('.');
  if (parts.length !== 3 || !key.startsWith('ey')) return null;
  try {
    const json = Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    const payload = JSON.parse(json);
    return payload && typeof payload === 'object' ? payload : null;
  } catch {
    return null;
  }
}

/** Describe a key without revealing it. */
function describeKey(key) {
  if (!key) return { kind: 'missing' };
  if (key.startsWith('sb_secret_')) return { kind: 'secret' };
  if (key.startsWith('sb_publishable_')) return { kind: 'publishable' };
  const payload = decodeJwtPayload(key);
  if (payload) return { kind: 'jwt', role: payload.role, ref: payload.ref };
  return { kind: 'opaque' };
}

function isPrivileged(desc) {
  return desc.kind === 'secret' || (desc.kind === 'jwt' && desc.role === 'service_role');
}

function originOf(value) {
  try { return new URL(value).origin; } catch { return null; }
}

/**
 * Validate the environment for a deployment build.
 * Returns { target, errors, warnings, summary }; never includes key values.
 */
function validateDeploymentEnv(env, options = {}) {
  const productionRef = options.productionRef || guard.productionSupabaseProjectRef;
  const errors = [];
  const warnings = [];
  const resolved = resolveTarget(env);
  if (resolved.error) errors.push(resolved.error);
  const target = resolved.target;
  const hosted = HOSTED_TARGETS.has(target);

  // --- Server-side Supabase project -------------------------------------
  const url = env.TRAVLINE_SUPABASE_URL;
  let ref = null;
  if (!url) {
    errors.push('TRAVLINE_SUPABASE_URL is not set for this deployment target');
  } else if (!originOf(url)) {
    errors.push('TRAVLINE_SUPABASE_URL is not a valid URL');
  } else {
    ref = supabaseRefFromUrl(url);
    if (hosted) {
      if (new URL(url).protocol !== 'https:') errors.push('TRAVLINE_SUPABASE_URL must use https on hosted deployments');
      if (!ref) errors.push('TRAVLINE_SUPABASE_URL must be a https://<project-ref>.supabase.co URL so isolation can be verified');
    }
  }

  // Explicit per-environment declaration of the intended project.
  const declaredRef = env.TRAVLINE_SUPABASE_PROJECT_REF;
  if (hosted && !declaredRef) {
    errors.push('TRAVLINE_SUPABASE_PROJECT_REF must be set explicitly for this deployment target');
  }
  if (declaredRef && ref && declaredRef !== ref) {
    errors.push('TRAVLINE_SUPABASE_PROJECT_REF does not match the project in TRAVLINE_SUPABASE_URL');
  }

  // Cross-environment rules.
  if (ref && productionRef) {
    if (target === 'production' && ref !== productionRef) {
      errors.push('Production deployment is not configured with the production Supabase project');
    }
    if (target && target !== 'production' && ref === productionRef) {
      const allowLocal = target === 'local' && env.TRAVLINE_ALLOW_LOCAL_PRODUCTION_ACCESS === 'true';
      if (allowLocal) warnings.push('Local build explicitly targets the PRODUCTION Supabase project (TRAVLINE_ALLOW_LOCAL_PRODUCTION_ACCESS=true)');
      else errors.push(`Deployment target "${target}" must not use the production Supabase project`);
    }
  }

  // --- Keys ---------------------------------------------------------------
  const anon = describeKey(env.TRAVLINE_SUPABASE_ANON_KEY);
  if (anon.kind === 'missing') errors.push('TRAVLINE_SUPABASE_ANON_KEY is not set for this deployment target');
  if (isPrivileged(anon)) errors.push('TRAVLINE_SUPABASE_ANON_KEY contains a privileged key');
  if (anon.ref && ref && anon.ref !== ref) errors.push('TRAVLINE_SUPABASE_ANON_KEY belongs to a different Supabase project than TRAVLINE_SUPABASE_URL');

  const serviceKey = env.TRAVLINE_SUPABASE_SERVICE_ROLE_KEY;
  const service = describeKey(serviceKey);
  if (service.kind === 'missing') {
    if (hosted) warnings.push('TRAVLINE_SUPABASE_SERVICE_ROLE_KEY is not visible at build time; the API refuses to start without it');
  } else {
    if (service.kind === 'publishable') errors.push('TRAVLINE_SUPABASE_SERVICE_ROLE_KEY contains a publishable key');
    if (service.kind === 'jwt' && service.role !== 'service_role') errors.push('TRAVLINE_SUPABASE_SERVICE_ROLE_KEY is not a service_role key');
    if (service.ref && ref && service.ref !== ref) errors.push('TRAVLINE_SUPABASE_SERVICE_ROLE_KEY belongs to a different Supabase project than TRAVLINE_SUPABASE_URL');
  }

  // --- Browser (Vite) configuration ------------------------------------------
  const viteUrl = env.VITE_SUPABASE_URL;
  if (!viteUrl) errors.push('VITE_SUPABASE_URL is not set');
  else if (url && originOf(viteUrl) !== originOf(url)) errors.push('VITE_SUPABASE_URL does not match TRAVLINE_SUPABASE_URL (frontend and API must use the same project)');

  const browser = describeKey(env.VITE_SUPABASE_ANON_KEY);
  if (browser.kind === 'missing') errors.push('VITE_SUPABASE_ANON_KEY is not set');
  if (isPrivileged(browser)) errors.push('VITE_SUPABASE_ANON_KEY contains a privileged key and would be shipped to browsers');
  if (browser.ref && ref && browser.ref !== ref) errors.push('VITE_SUPABASE_ANON_KEY belongs to a different Supabase project than TRAVLINE_SUPABASE_URL');

  // No VITE_* variable may carry a server secret (Vite inlines them all).
  const serverSecrets = ['TRAVLINE_SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'CRON_SECRET', 'TRAVLINE_SUPABASE_MANAGEMENT_TOKEN']
    .map((name) => env[name]).filter((value) => typeof value === 'string' && value.length >= 16);
  for (const [name, value] of Object.entries(env)) {
    if (!name.startsWith('VITE_') || typeof value !== 'string') continue;
    if (/SERVICE_ROLE|SECRET|MANAGEMENT_TOKEN/i.test(name)) errors.push(`${name}: server-side secret names must not use the VITE_ prefix`);
    else if (serverSecrets.includes(value)) errors.push(`${name} contains a server-side secret`);
    else if (isPrivileged(describeKey(value))) errors.push(`${name} contains a privileged Supabase key`);
  }

  // --- Runtime safety flags and URLs -----------------------------------------
  if (hosted || target === 'ci') {
    for (const flag of ['DEV_BYPASS_AUTH', 'DEV_AUTO_BOOTSTRAP']) {
      if (env[flag] && env[flag] !== 'false') errors.push(`${flag} must be false or unset on ${target} deployments`);
    }
  }
  if (target === 'production' || target === 'preview') {
    const admin = env.ADMIN_URL;
    if (!admin) errors.push('ADMIN_URL must be set explicitly for this deployment target');
    else if (!originOf(admin) || new URL(admin).protocol !== 'https:') errors.push('ADMIN_URL must be a valid https URL');
  }

  return {
    target,
    errors,
    warnings,
    summary: {
      target: target || 'unknown',
      targetSource: resolved.source,
      supabaseProjectRef: ref || 'unverified',
      isProductionProject: Boolean(ref && ref === productionRef),
      browserKey: browser.kind,
      serviceKey: service.kind,
    },
  };
}

function main(argv, env) {
  const command = argv[0] || 'check';
  if (command !== 'check') {
    console.error('Usage: node scripts/deployment-env.cjs check');
    return 2;
  }
  const result = validateDeploymentEnv(env);
  const s = result.summary;
  console.log(`[deployment-env] target=${s.target} (from ${s.targetSource}) supabase_ref=${s.supabaseProjectRef} production_project=${s.isProductionProject} browser_key=${s.browserKey} service_key=${s.serviceKey}`);
  for (const warning of result.warnings) console.warn(`[deployment-env] WARNING: ${warning}`);
  if (result.errors.length) {
    console.error('[deployment-env] BLOCKED: unsafe or incomplete deployment configuration:');
    for (const error of result.errors) console.error(`  - ${error}`);
    console.error('[deployment-env] See docs/operations/environment-isolation.md');
    return 1;
  }
  console.log('[deployment-env] OK');
  return 0;
}

module.exports = { resolveTarget, supabaseRefFromUrl, decodeJwtPayload, describeKey, validateDeploymentEnv, main };

if (require.main === module) process.exit(main(process.argv.slice(2), process.env));
