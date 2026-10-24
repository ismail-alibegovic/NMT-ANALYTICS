// Called by start-production.sh after Node parses the selected environment file.
require('./require-node-runtime.cjs').requireSupportedNode();
const { spawn, spawnSync } = require('node:child_process');
const { existsSync } = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
process.env.NODE_ENV = 'production';
for (const flag of ['DEV_BYPASS_AUTH', 'DEV_AUTO_BOOTSTRAP']) {
  if (process.env[flag] && process.env[flag] !== 'false') {
    console.error(`[production] Refusing startup: ${flag} must be false or unset`);
    process.exit(1);
  }
  process.env[flag] = 'false';
}
process.env.PORT ||= '3001';
process.env.ADMIN_URL ||= `http://localhost:${process.env.PORT}`;

function run(command, args, cwd, env = process.env) {
  const result = spawnSync(command, args, { cwd, env, stdio: 'inherit' });
  if (result.error || result.status !== 0) {
    console.error('[production] Command failed:', command, args.join(' '));
    process.exit(result.status || 1);
  }
}
const admin = path.join(root, 'nmt-analytics-admin');
const api = path.join(root, 'nmt-analytics-api');
// Build tools are devDependencies, even though the resulting app is production.
for (const cwd of [admin, api]) {
  if (!existsSync(path.join(cwd, 'node_modules'))) run('npm', ['ci', '--include=dev'], cwd);
}
run('npm', ['run', 'build'], admin, {
  ...process.env,
  VITE_SUPABASE_URL: process.env.TRAVLINE_SUPABASE_URL || process.env.SUPABASE_URL || '',
  VITE_SUPABASE_ANON_KEY: process.env.TRAVLINE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '',
  VITE_API_URL: '/api',
  VITE_SENTRY_DSN: process.env.VITE_SENTRY_DSN || '',
  VITE_APP_VERSION: process.env.VITE_APP_VERSION || 'travline-admin@1.0.0',
});
run('npm', ['run', 'build'], api);
const server = spawn(process.execPath, [path.join(api, 'dist/index.js')], {
  cwd: api, env: process.env, stdio: 'inherit',
});
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => server.kill(signal));
}
server.on('error', () => process.exit(1));
server.on('exit', (code, signal) => {
  if (signal) { process.removeAllListeners(signal); process.kill(process.pid, signal); }
  else process.exit(code ?? 1);
});
