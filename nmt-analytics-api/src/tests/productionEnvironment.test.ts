import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const fixtures: string[] = [];
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  fixtures.splice(0).forEach(dir => rmSync(dir, { recursive: true, force: true }));
});

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'travline-start-'));
  fixtures.push(root);
  for (const dir of ['scripts', 'bin', 'nmt-analytics-api/dist', 'nmt-analytics-api/node_modules', 'nmt-analytics-admin/node_modules']) {
    mkdirSync(path.join(root, dir), { recursive: true });
  }
  const repository = path.resolve(__dirname, '../../..');
  copyFileSync(path.join(repository, 'start-production.sh'), path.join(root, 'start-production.sh'));
  copyFileSync(path.join(repository, 'scripts/require-node-runtime.cjs'), path.join(root, 'scripts/require-node-runtime.cjs'));
  copyFileSync(path.join(repository, 'scripts/start-production.cjs'), path.join(root, 'scripts/start-production.cjs'));
  writeFileSync(path.join(root, 'bin/npm'), `#!/bin/sh
echo invoked >> "$(dirname "$0")/../npm-invocations"
exit 0
`, { mode: 0o755 });
  writeFileSync(path.join(root, 'nmt-analytics-api/dist/index.js'),
    'console.log(JSON.stringify({mode:process.env.NODE_ENV,bypass:process.env.DEV_BYPASS_AUTH,host:process.env.ADMIN_URL,port:process.env.PORT}));');
  return root;
}
function start(root: string, extra: Record<string, string> = {}) {
  // Explicit safe child environment: never forward developer/CI credentials.
  return spawnSync('bash', [path.join(root, 'start-production.sh')], {
    cwd: root, encoding: 'utf8', timeout: 10000,
    env: { PATH: `${root}/bin:${process.env.PATH}`, ...extra },
  });
}

describe('production launcher boundary', () => {
  it.each(['20.20.0', '22.20.0', '26.0.0'])('rejects project-unsupported Node %s before shell-entry builds/start', version => {
    const root = fixture();
    const shim = path.join(root, 'version-shim.cjs');
    writeFileSync(shim, `Object.defineProperty(process.versions, 'node', { value: ${JSON.stringify(version)} });`);
    const result = start(root, { NODE_OPTIONS: `--require=${shim}` });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Travline requires Node.js 24 LTS');
    expect(result.stdout).toBe('');
    expect(existsSync(path.join(root, 'npm-invocations'))).toBe(false);
  });

  it('cannot bypass the runtime check through the direct JS launcher', () => {
    const root = fixture();
    const shim = path.join(root, 'version-shim.cjs');
    writeFileSync(shim, "Object.defineProperty(process.versions, 'node', { value: '20.20.0' });");
    const result = spawnSync(process.execPath, [path.join(root, 'scripts/start-production.cjs')], {
      cwd: root, encoding: 'utf8', timeout: 10000,
      env: { PATH: `${root}/bin:${process.env.PATH}`, NODE_OPTIONS: `--require=${shim}` },
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Travline requires Node.js 24 LTS');
    expect(result.stdout).toBe('');
    expect(existsSync(path.join(root, 'npm-invocations'))).toBe(false);
  });
  it('forces production despite a development mode in the selected file and preserves process config', () => {
    const root = fixture();
    writeFileSync(path.join(root, 'nmt-analytics-api/.env.production.local'),
      'NODE_ENV=development\nADMIN_URL=https://file.example.test\nPORT=9000\n');
    const result = start(root, { NODE_ENV: 'test', ADMIN_URL: 'https://runtime.example.test' });
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout.trim())).toEqual({ mode: 'production', bypass: 'false', host: 'https://runtime.example.test', port: '9000' });
  });
  it.each(['DEV_BYPASS_AUTH', 'DEV_AUTO_BOOTSTRAP'])('refuses unsafe %s from the production file before builds/start', flag => {
    const root = fixture();
    writeFileSync(path.join(root, 'nmt-analytics-api/.env.production.local'), `${flag}=true\n`);
    const result = start(root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`${flag} must be false or unset`);
    expect(result.stdout).toBe('');
  });
  it('keeps root fallback compatibility without executing shell content', () => {
    const root = fixture();
    writeFileSync(path.join(root, '.env'), 'ADMIN_URL=https://fallback.example.test\nIGNORED=$(touch injected)\n');
    const result = start(root);
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout.trim()).host).toBe('https://fallback.example.test');
    const { existsSync } = require('node:fs');
    expect(existsSync(path.join(root, 'injected'))).toBe(false);
  });
  it('uses the production file exclusively when both files exist', () => {
    const root = fixture();
    writeFileSync(path.join(root, '.env'), 'DEV_BYPASS_AUTH=true\n');
    writeFileSync(path.join(root, 'nmt-analytics-api/.env.production.local'), 'PORT=9001\n');
    const result = start(root);
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout.trim()).port).toBe('9001');
  });
});

it.each(['production', 'test'])('does not call dotenv in %s', async mode => {
  vi.resetModules();
  vi.stubEnv('NODE_ENV', mode);
  const dotenv = await import('dotenv');
  const load = vi.spyOn(dotenv.default, 'config');
  await import('../environment');
  expect(load).not.toHaveBeenCalled();
  load.mockRestore();
});
