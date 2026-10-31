'use strict';
// Run: node --test scripts/deployment-env.test.cjs scripts/check-bundle-secrets.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const { validateDeploymentEnv, resolveTarget, main } = require('./deployment-env.cjs');
const guard = require('./deployment-guard.json');

const PROD = guard.productionSupabaseProjectRef;
const STAGING = 'stagingprojectref000';
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (payload) => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}.signature-part`;
const url = (ref) => `https://${ref}.supabase.co`;

function envFor(target, ref, overrides = {}) {
  return {
    VERCEL: '1',
    VERCEL_ENV: target,
    TRAVLINE_SUPABASE_URL: url(ref),
    TRAVLINE_SUPABASE_PROJECT_REF: ref,
    TRAVLINE_SUPABASE_ANON_KEY: jwt({ role: 'anon', ref }),
    TRAVLINE_SUPABASE_SERVICE_ROLE_KEY: jwt({ role: 'service_role', ref }),
    VITE_SUPABASE_URL: url(ref),
    VITE_SUPABASE_ANON_KEY: 'sb_publishable_examplepublickey',
    ADMIN_URL: 'https://example.vercel.app',
    DEV_BYPASS_AUTH: 'false',
    DEV_AUTO_BOOTSTRAP: 'false',
    ...overrides,
  };
}
const errorsOf = (env) => validateDeploymentEnv(env).errors.join('\n');

test('target selection follows VERCEL_ENV, then explicit target, then local', () => {
  assert.equal(resolveTarget({ VERCEL: '1', VERCEL_ENV: 'production' }).target, 'production');
  assert.equal(resolveTarget({ VERCEL: '1', VERCEL_ENV: 'preview', TRAVLINE_DEPLOY_TARGET: 'production' }).target, 'preview');
  assert.equal(resolveTarget({ TRAVLINE_DEPLOY_TARGET: 'ci' }).target, 'ci');
  assert.equal(resolveTarget({}).target, 'local');
  assert.ok(resolveTarget({ VERCEL: '1' }).error, 'missing VERCEL_ENV on Vercel must not default');
  assert.ok(resolveTarget({ VERCEL: '1', VERCEL_ENV: 'staging' }).error);
  assert.ok(resolveTarget({ TRAVLINE_DEPLOY_TARGET: 'prod' }).error);
});

test('valid production configuration is accepted (existing behaviour preserved)', () => {
  const result = validateDeploymentEnv(envFor('production', PROD));
  assert.deepEqual(result.errors, []);
  assert.equal(result.summary.isProductionProject, true);
});

test('valid preview configuration on a separate project is accepted', () => {
  const result = validateDeploymentEnv(envFor('preview', STAGING));
  assert.deepEqual(result.errors, []);
  assert.equal(result.summary.isProductionProject, false);
});

test('preview cannot use the production Supabase project', () => {
  assert.match(errorsOf(envFor('preview', PROD)), /"preview" must not use the production Supabase project/);
  assert.match(errorsOf(envFor('development', PROD)), /"development" must not use the production/);
});

test('preview cannot silently reuse production keys with a staging URL', () => {
  const errors = errorsOf(envFor('preview', STAGING, {
    TRAVLINE_SUPABASE_SERVICE_ROLE_KEY: jwt({ role: 'service_role', ref: PROD }),
    TRAVLINE_SUPABASE_ANON_KEY: jwt({ role: 'anon', ref: PROD }),
  }));
  assert.match(errors, /SERVICE_ROLE_KEY belongs to a different Supabase project/);
  assert.match(errors, /ANON_KEY belongs to a different Supabase project/);
});

test('production cannot be pointed at a non-production project', () => {
  assert.match(errorsOf(envFor('production', STAGING)), /Production deployment is not configured with the production/);
});

test('missing configuration blocks the build instead of defaulting', () => {
  const base = envFor('preview', STAGING);
  for (const name of ['TRAVLINE_SUPABASE_URL', 'TRAVLINE_SUPABASE_PROJECT_REF', 'TRAVLINE_SUPABASE_ANON_KEY', 'VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'ADMIN_URL']) {
    const env = { ...base };
    delete env[name];
    assert.ok(validateDeploymentEnv(env).errors.length > 0, `${name} missing must block`);
  }
  const empty = validateDeploymentEnv({ VERCEL: '1', VERCEL_ENV: 'preview' });
  assert.ok(empty.errors.length >= 4);
});

test('declared project ref must match the URL', () => {
  assert.match(errorsOf(envFor('preview', STAGING, { TRAVLINE_SUPABASE_PROJECT_REF: PROD })), /does not match/);
});

test('hosted deployments require a verifiable https Supabase URL', () => {
  assert.match(errorsOf(envFor('preview', STAGING, { TRAVLINE_SUPABASE_URL: 'http://127.0.0.1:54321', VITE_SUPABASE_URL: 'http://127.0.0.1:54321' })), /must use https|isolation can be verified/);
});

test('frontend and API must use the same project', () => {
  assert.match(errorsOf(envFor('preview', STAGING, { VITE_SUPABASE_URL: url('otherprojectref00000') })), /VITE_SUPABASE_URL does not match/);
  assert.match(errorsOf(envFor('preview', STAGING, { VITE_SUPABASE_ANON_KEY: jwt({ role: 'anon', ref: PROD }) })), /VITE_SUPABASE_ANON_KEY belongs to a different/);
});

test('service-role credentials can never reach the client bundle', () => {
  const serviceKey = jwt({ role: 'service_role', ref: STAGING });
  assert.match(errorsOf(envFor('preview', STAGING, { VITE_SUPABASE_ANON_KEY: serviceKey })), /VITE_SUPABASE_ANON_KEY contains a privileged key/);
  assert.match(errorsOf(envFor('preview', STAGING, { VITE_SUPABASE_ANON_KEY: 'sb_secret_abcdefghijkl' })), /privileged/);
  assert.match(errorsOf(envFor('preview', STAGING, { VITE_SUPABASE_SERVICE_ROLE_KEY: 'x' })), /must not use the VITE_ prefix/);
  const env = envFor('preview', STAGING);
  assert.match(errorsOf({ ...env, VITE_EXTRA: env.TRAVLINE_SUPABASE_SERVICE_ROLE_KEY }), /VITE_EXTRA contains a server-side secret/);
});

test('service role variable must hold a service_role key', () => {
  assert.match(errorsOf(envFor('preview', STAGING, { TRAVLINE_SUPABASE_SERVICE_ROLE_KEY: jwt({ role: 'anon', ref: STAGING }) })), /not a service_role key/);
  assert.match(errorsOf(envFor('preview', STAGING, { TRAVLINE_SUPABASE_SERVICE_ROLE_KEY: 'sb_publishable_abc' })), /publishable key/);
});

test('service role key absent at build time is a warning, not a silent pass', () => {
  const env = envFor('preview', STAGING);
  delete env.TRAVLINE_SUPABASE_SERVICE_ROLE_KEY;
  const result = validateDeploymentEnv(env);
  assert.deepEqual(result.errors, []);
  assert.match(result.warnings.join('\n'), /SERVICE_ROLE_KEY is not visible at build time/);
});

test('dev auth bypass flags are blocked on hosted deployments', () => {
  assert.match(errorsOf(envFor('production', PROD, { DEV_BYPASS_AUTH: 'true' })), /DEV_BYPASS_AUTH must be false/);
  assert.match(errorsOf(envFor('preview', STAGING, { DEV_AUTO_BOOTSTRAP: '1' })), /DEV_AUTO_BOOTSTRAP must be false/);
});

test('local builds against production require explicit acknowledgement', () => {
  const local = { ...envFor('local', PROD), VERCEL: undefined, VERCEL_ENV: undefined };
  assert.match(errorsOf(local), /"local" must not use the production/);
  const acknowledged = validateDeploymentEnv({ ...local, TRAVLINE_ALLOW_LOCAL_PRODUCTION_ACCESS: 'true' });
  assert.deepEqual(acknowledged.errors, []);
  assert.equal(acknowledged.warnings.length, 1);
});

test('CLI output never contains key material', () => {
  const env = envFor('preview', PROD);
  const lines = [];
  const original = { log: console.log, warn: console.warn, error: console.error };
  console.log = console.warn = console.error = (...args) => lines.push(args.join(' '));
  let code;
  try { code = main(['check'], env); } finally { Object.assign(console, original); }
  assert.equal(code, 1);
  const output = lines.join('\n');
  assert.match(output, /BLOCKED/);
  for (const secret of [env.TRAVLINE_SUPABASE_SERVICE_ROLE_KEY, env.TRAVLINE_SUPABASE_ANON_KEY, env.VITE_SUPABASE_ANON_KEY]) {
    assert.ok(!output.includes(secret));
  }
});

test('vercel configuration contains no Supabase endpoint or key', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const root = path.resolve(__dirname, '..');
  for (const file of ['vercel.json', 'scripts/vercel-build.sh', 'scripts/vercel-install.sh']) {
    const text = fs.readFileSync(path.join(root, file), 'utf8');
    assert.ok(!text.includes(PROD), `${file} must not reference the production project`);
    assert.ok(!/\.supabase\.co/.test(text), `${file} must not hardcode a Supabase endpoint`);
    assert.ok(!/sb_publishable_|sb_secret_/.test(text), `${file} must not hardcode Supabase keys`);
    assert.ok(!/eyJ[A-Za-z0-9_-]{10,}\.eyJ/.test(text), `${file} must not hardcode JWTs`);
  }
  const vercel = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
  for (const name of Object.keys(vercel.env || {})) {
    assert.ok(!/SUPABASE|ADMIN_URL|SECRET|KEY/.test(name), `vercel.json env must not define ${name}`);
  }
});
