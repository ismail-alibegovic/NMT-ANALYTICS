'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { scanText, main } = require('./check-bundle-secrets.cjs');

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (payload) => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}.signaturepart123`;

function bundle(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bundle-scan-'));
  fs.mkdirSync(path.join(dir, 'assets'));
  for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), content);
  return dir;
}
function quietly(fn) {
  const original = { log: console.log, error: console.error };
  const lines = [];
  console.log = console.error = (...args) => lines.push(args.join(' '));
  try { return { code: fn(), output: lines.join('\n') }; } finally { Object.assign(console, original); }
}

test('a clean bundle with a public anon key passes', () => {
  const dir = bundle({ 'index.html': '<html></html>', 'assets/app.js': `const k="${jwt({ role: 'anon', ref: 'stagingprojectref000' })}";` });
  assert.equal(quietly(() => main([dir], {})).code, 0);
});

test('service_role JWTs, secret keys and management tokens are detected', () => {
  assert.deepEqual(scanText(`x="${jwt({ role: 'service_role', ref: 'a' })}"`), ['service_role JWT']);
  const fakeSecretKey = ['sb', '_secret_', 'x'.repeat(16)].join('');
  assert.deepEqual(scanText(`x="${fakeSecretKey}"`), ['Supabase secret key (sb_secret_)']);
  // Assembled at runtime so the synthetic fixture is not committed as a token literal.
  const fakeManagementToken = ['sbp', '_', '0'.repeat(40)].join('');
  assert.deepEqual(scanText(`x="${fakeManagementToken}"`), ['Supabase management token (sbp_)']);
});

test('exact server secret values from the environment are detected without printing them', () => {
  const secret = 'opaque-server-secret-value-123456';
  const dir = bundle({ 'assets/app.js': `const s="${secret}";` });
  const { code, output } = quietly(() => main([dir], { CRON_SECRET: secret }));
  assert.equal(code, 1);
  assert.match(output, /value of CRON_SECRET/);
  assert.ok(!output.includes(secret));
});

test('forbidden project refs fail the scan (preview must not reference production)', () => {
  const dir = bundle({ 'assets/app.js': 'fetch("https://forbiddenref000000000.supabase.co")' });
  assert.equal(quietly(() => main([dir, '--forbid-supabase-ref', 'forbiddenref000000000'], {})).code, 1);
});

test('empty or missing bundles fail instead of passing vacuously', () => {
  assert.equal(quietly(() => main([fs.mkdtempSync(path.join(os.tmpdir(), 'empty-'))], {})).code, 1);
  assert.equal(quietly(() => main(['/nonexistent-dir-xyz'], {})).code, 2);
});
