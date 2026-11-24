#!/usr/bin/env node
// Scan a built frontend bundle for server-side secrets.
//
// Usage: node scripts/check-bundle-secrets.cjs <dist-dir> [--forbid-supabase-ref <ref>]...
//
// Fails when the bundle contains:
//   - the literal value of any server-side secret present in the environment;
//   - Supabase secret keys (sb_secret_...) or management tokens (sbp_...);
//   - any JWT whose payload role is service_role;
//   - a forbidden Supabase project ref (used to prove preview bundles do not
//     point at production).
// Findings report the file and kind only, never the matched value.
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { decodeJwtPayload } = require('./deployment-env.cjs');

const SERVER_SECRET_ENV = [
  'TRAVLINE_SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'TRAVLINE_SUPABASE_MANAGEMENT_TOKEN',
  'CRON_SECRET',
  'SENTRY_AUTH_TOKEN',
];
const TEXT_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.css', '.html', '.json', '.map', '.txt', '.svg', '.webmanifest']);
const JWT_PATTERN = /eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g;

function listFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(full));
    else if (TEXT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) out.push(full);
  }
  return out;
}

function scanText(text, { secrets = [], forbiddenRefs = [] } = {}) {
  const findings = [];
  for (const { name, value } of secrets) {
    if (text.includes(value)) findings.push(`value of ${name}`);
  }
  if (/sb_secret_[A-Za-z0-9_-]{8,}/.test(text)) findings.push('Supabase secret key (sb_secret_)');
  if (/\bsbp_[A-Za-z0-9]{20,}/.test(text)) findings.push('Supabase management token (sbp_)');
  for (const match of text.matchAll(JWT_PATTERN)) {
    const payload = decodeJwtPayload(match[0]);
    if (payload && payload.role === 'service_role') {
      findings.push('service_role JWT');
      break;
    }
  }
  for (const ref of forbiddenRefs) {
    if (text.includes(ref)) findings.push(`forbidden Supabase project ref ${ref}`);
  }
  return findings;
}

function scanDirectory(dir, env, forbiddenRefs = []) {
  const secrets = SERVER_SECRET_ENV
    .map((name) => ({ name, value: env[name] }))
    .filter(({ value }) => typeof value === 'string' && value.length >= 16);
  const results = [];
  for (const file of listFiles(dir)) {
    const findings = scanText(fs.readFileSync(file, 'utf8'), { secrets, forbiddenRefs });
    if (findings.length) results.push({ file: path.relative(dir, file), findings });
  }
  return results;
}

function main(argv, env) {
  const args = [...argv];
  const dir = args.shift();
  const forbiddenRefs = [];
  while (args.length) {
    const flag = args.shift();
    if (flag === '--forbid-supabase-ref' && args[0]) forbiddenRefs.push(args.shift());
    else { console.error(`Unknown argument: ${flag}`); return 2; }
  }
  if (!dir || !fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    console.error('Usage: node scripts/check-bundle-secrets.cjs <dist-dir> [--forbid-supabase-ref <ref>]');
    return 2;
  }
  const files = listFiles(dir);
  if (files.length === 0) {
    console.error(`[bundle-secrets] No bundle files found in ${dir}`);
    return 1;
  }
  const results = scanDirectory(dir, env, forbiddenRefs);
  if (results.length) {
    console.error('[bundle-secrets] BLOCKED: frontend bundle contains server-side secrets or forbidden references:');
    for (const { file, findings } of results) console.error(`  - ${file}: ${findings.join(', ')}`);
    return 1;
  }
  console.log(`[bundle-secrets] OK: scanned ${files.length} files, no server-side secrets found`);
  return 0;
}

module.exports = { scanText, scanDirectory, main };

if (require.main === module) process.exit(main(process.argv.slice(2), process.env));
