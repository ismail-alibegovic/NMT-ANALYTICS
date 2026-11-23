import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '../../..');
const SCRIPT = path.resolve(__dirname, '../../scripts/allocation-slot-concurrency.sh');

function runGuard(args: string[], env: Record<string, string | undefined>) {
  return spawnSync('bash', [SCRIPT, ...args], {
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH || '/usr/bin:/bin',
      ...env,
    },
  });
}

function withStubPsql(scriptBody: string, fn: (binDir: string) => void) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'travline-psql-stub-'));
  const psqlPath = path.join(dir, 'psql');
  fs.writeFileSync(psqlPath, `#!/usr/bin/env bash\n${scriptBody}\n`, { mode: 0o755 });
  try {
    fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe('allocation-slot-concurrency.sh fail-closed destination guards & CI topology', () => {
  it('refuses positional DB URL arguments without echoing URL or password', () => {
    const secretUrl = 'postgresql://postgres:SUPER_SECRET_PASS@db.example.supabase.co:5432/postgres';
    const res = runGuard([secretUrl], {
      TRAVLINE_ISOLATED_ALLOTMENT_CONCURRENCY: '1',
      PGHOST: 'localhost',
      MIGRATION_REPLAY_DB: 'travline_replay',
    });

    expect(res.status).toBe(1);
    expect(res.stderr).toContain('positional arguments and connection URLs are forbidden');
    expect(res.stdout + res.stderr).not.toContain('SUPER_SECRET_PASS');
    expect(res.stdout + res.stderr).not.toContain('supabase.co');
  });

  it('refuses execution without explicit TRAVLINE_ISOLATED_ALLOTMENT_CONCURRENCY=1', () => {
    const res = runGuard([], {
      PGHOST: 'localhost',
      MIGRATION_REPLAY_DB: 'travline_replay',
    });

    expect(res.status).toBe(1);
    expect(res.stderr).toContain('TRAVLINE_ISOLATED_ALLOTMENT_CONCURRENCY=1');
  });

  it('refuses any non-loopback / hosted PGHOST before connecting', () => {
    const res = runGuard([], {
      TRAVLINE_ISOLATED_ALLOTMENT_CONCURRENCY: '1',
      PGHOST: 'db.hacutwknfgufrqlgdiia.supabase.co',
      MIGRATION_REPLAY_DB: 'travline_replay',
      PGPASSWORD: 'DO_NOT_LEAK_PASSWORD',
    });

    expect(res.status).toBe(1);
    expect(res.stderr).toContain('PGHOST must be localhost or 127.0.0.1');
    expect(res.stdout + res.stderr).not.toContain('DO_NOT_LEAK_PASSWORD');
  });

  it('refuses postgres DB on host port 5432 even with container flag when outside a container', () => {
    const wrongPort = runGuard([], {
      TRAVLINE_ISOLATED_ALLOTMENT_CONCURRENCY: '1',
      PGHOST: '127.0.0.1',
      PGPORT: '5432',
      TRAVLINE_CONCURRENCY_DB: 'postgres',
    });
    expect(wrongPort.status).toBe(1);
    expect(wrongPort.stderr).toContain('127.0.0.1:54322');

    if (!fs.existsSync('/.dockerenv')) {
      const fakeContainerFlag = runGuard([], {
        TRAVLINE_ISOLATED_ALLOTMENT_CONCURRENCY: '1',
        PGHOST: '127.0.0.1',
        PGPORT: '5432',
        TRAVLINE_CONCURRENCY_DB: 'postgres',
        TRAVLINE_CONCURRENCY_CONTAINER_LOOPBACK: '1',
      });
      expect(fakeContainerFlag.status).toBe(1);
      expect(fakeContainerFlag.stderr).toContain('TRAVLINE_CONCURRENCY_CONTAINER_LOOPBACK=1');
    }

    const unknownDb = runGuard([], {
      TRAVLINE_ISOLATED_ALLOTMENT_CONCURRENCY: '1',
      PGHOST: 'localhost',
      TRAVLINE_CONCURRENCY_DB: 'production_db',
    });
    expect(unknownDb.status).toBe(1);
    expect(unknownDb.stderr).toContain('travline_replay');
  });

  it('refuses non-loopback server inet_server_addr (including Docker bridge 172.x) instead of widening to private IPs', () => {
    withStubPsql('echo "travline_replay|172.18.0.2|false"', (binDir) => {
      const res = runGuard([], {
        PATH: `${binDir}:${process.env.PATH || '/usr/bin:/bin'}`,
        TRAVLINE_ISOLATED_ALLOTMENT_CONCURRENCY: '1',
        PGHOST: '127.0.0.1',
        PGPORT: '5432',
        MIGRATION_REPLAY_DB: 'travline_replay',
      });

      expect(res.status).toBe(1);
      expect(res.stderr).toContain('PostgreSQL server address is not local loopback');
    });
  });

  it('refuses postgres DB target when server lacks supabase_admin role', () => {
    withStubPsql('echo "postgres|127.0.0.1|false"', (binDir) => {
      const res = runGuard([], {
        PATH: `${binDir}:${process.env.PATH || '/usr/bin:/bin'}`,
        TRAVLINE_ISOLATED_ALLOTMENT_CONCURRENCY: '1',
        PGHOST: '127.0.0.1',
        PGPORT: '54322',
        TRAVLINE_CONCURRENCY_DB: 'postgres',
      });

      expect(res.status).toBe(1);
      expect(res.stderr).toContain('does not match disposable local Supabase instance');
    });
  });

  it('accepts strict container loopback identity (127.0.0.1) and strips libpq override env vars', () => {
    const markerStub = [
      'if [[ -n "${DATABASE_URL:-}${PGSERVICE:-}${PGHOSTADDR:-}${PGDATABASE:-}" ]]; then',
      '  echo "LEAKED_LIBPQ_OVERRIDE" >&2',
      '  exit 9',
      'fi',
      'if [[ "$*" == *"inet_server_addr"* ]]; then',
      '  echo "travline_replay|127.0.0.1|false"',
      '  exit 0',
      'fi',
      'echo "IDENTITY_GUARD_PASSED" >&2',
      'exit 42',
    ].join('\n');

    withStubPsql(markerStub, (binDir) => {
      const res = runGuard([], {
        PATH: `${binDir}:${process.env.PATH || '/usr/bin:/bin'}`,
        TRAVLINE_ISOLATED_ALLOTMENT_CONCURRENCY: '1',
        PGHOST: '127.0.0.1',
        PGPORT: '5432',
        MIGRATION_REPLAY_DB: 'travline_replay',
        DATABASE_URL: 'postgresql://evil:pass@hosted.supabase.co:5432/postgres',
        PGSERVICE: 'hosted',
        PGHOSTADDR: '10.0.0.1',
        PGDATABASE: 'postgres',
      });

      expect(res.status).toBe(42);
      expect(res.stderr).toContain('IDENTITY_GUARD_PASSED');
      expect(res.stderr).not.toContain('LEAKED_LIBPQ_OVERRIDE');
    });
  });

  it('wires both CI workflows to run inside disposable DB containers over 127.0.0.1:5432 (not runner bridge)', () => {
    const ciYml = fs.readFileSync(path.join(REPO_ROOT, '.github/workflows/ci.yml'), 'utf8');
    const stagingYml = fs.readFileSync(path.join(REPO_ROOT, '.github/workflows/staging-acceptance.yml'), 'utf8');
    const replaySh = fs.readFileSync(path.join(REPO_ROOT, 'nmt-analytics-api/scripts/migration-replay.sh'), 'utf8');

    // migration-replay.sh runs on the runner across Docker bridge, so concurrency must NOT run inside it
    expect(replaySh).not.toContain('allocation-slot-concurrency.sh');

    // ci.yml runs concurrency inside $REPLAY_CONTAINER over 127.0.0.1:5432
    expect(ciYml).toContain('REPLAY_CONTAINER: ${{ job.services.postgres.id }}');
    expect(ciYml).toContain('MIGRATION_REPLAY_DB=travline_replay -e TRAVLINE_ISOLATED_ALLOTMENT_CONCURRENCY=1');
    expect(ciYml).toContain('"$REPLAY_CONTAINER" bash /tmp/travline-concurrency/allocation-slot-concurrency.sh');

    // staging-acceptance.yml runs concurrency inside supabase_db_nmt-analytics-api over 127.0.0.1:5432
    expect(stagingYml).toContain('docker cp nmt-analytics-api/scripts/allocation-slot-concurrency.sh supabase_db_nmt-analytics-api:/tmp/allocation-slot-concurrency.sh');
    expect(stagingYml).toContain('-e PGHOST=127.0.0.1 -e PGPORT=5432 -e PGUSER=postgres -e PGPASSWORD=postgres');
    expect(stagingYml).toContain('-e TRAVLINE_CONCURRENCY_DB=postgres -e TRAVLINE_ISOLATED_ALLOTMENT_CONCURRENCY=1');
    expect(stagingYml).toContain('-e TRAVLINE_CONCURRENCY_CONTAINER_LOOPBACK=1');
    expect(stagingYml).toContain('supabase_db_nmt-analytics-api bash /tmp/allocation-slot-concurrency.sh');
  });
});
