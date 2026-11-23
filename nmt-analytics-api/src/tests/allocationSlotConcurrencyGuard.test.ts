import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

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

describe('allocation-slot-concurrency.sh fail-closed destination guards', () => {
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

  it('refuses postgres DB unless on disposable local Supabase 127.0.0.1:54322', () => {
    const wrongPort = runGuard([], {
      TRAVLINE_ISOLATED_ALLOTMENT_CONCURRENCY: '1',
      PGHOST: '127.0.0.1',
      PGPORT: '5432',
      TRAVLINE_CONCURRENCY_DB: 'postgres',
    });
    expect(wrongPort.status).toBe(1);
    expect(wrongPort.stderr).toContain('127.0.0.1:54322');

    const unknownDb = runGuard([], {
      TRAVLINE_ISOLATED_ALLOTMENT_CONCURRENCY: '1',
      PGHOST: 'localhost',
      TRAVLINE_CONCURRENCY_DB: 'production_db',
    });
    expect(unknownDb.status).toBe(1);
    expect(unknownDb.stderr).toContain('travline_replay');
  });
});
