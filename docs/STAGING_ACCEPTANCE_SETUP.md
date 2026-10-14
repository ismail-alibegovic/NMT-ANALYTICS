# Travline staging and pilot acceptance setup

This is a local-only, disposable acceptance environment. It is intentionally based on the
repository's Supabase CLI project rather than a hosted Supabase project, so reset, Auth,
Storage, and the local SMTP inbox cannot touch production.

## Prerequisites

- Docker Engine with at least 6 GB RAM available
- Supabase CLI 2.x
- Node.js 20.x
- Chromium installed by Playwright

The repository declares PostgreSQL 17 in `nmt-analytics-api/supabase/config.toml`. Do not
substitute a PostgreSQL 15 container for acceptance evidence.

## Start the isolated stack

From `nmt-analytics-api/`:

```bash
npm ci
npm run staging:up
supabase db reset --local --yes
supabase status
```

`supabase start` creates local PostgreSQL 17, Auth, REST, Storage, Studio, and the Inbucket
SMTP test inbox. The reset replays every migration from zero. The generated service-role key
must remain local and must never be placed in the admin environment or committed.

Create local env files from `.env.staging.example` using the values printed by `supabase status`.
Run the API and admin in separate terminals:

```bash
cd nmt-analytics-api && npm run dev
cd nmt-analytics-admin && npm ci && npm run dev -- --host 127.0.0.1
```

Seed only the disposable local project:

```bash
cd nmt-analytics-api
E2E_SEED_PASSWORD='a-new-local-password' npm run seed:acceptance
```

The seed creates two organizations, a manager and staff user in Pilot A, a manager in Pilot B,
one BAM-only package/departure, and one passenger. It prints IDs needed by Playwright. It is
refused unless `TRAVLINE_SUPABASE_URL` is localhost/127.0.0.1 and `NODE_ENV` is not production.

Install and run browser acceptance:

```bash
cd nmt-analytics-admin
npx playwright install --with-deps chromium
E2E_RUN_BROWSER=1 npm run test:e2e
```

The API New Sale test is skipped and reported as blocked unless all `E2E_*` values are set.
The shell test remains useful for checking that the admin is reachable, but it is not
authentication or business-workflow evidence.

## Acceptance scenarios

| Scenario | Test surface | Required evidence |
|---|---|---|
| Fresh migration replay | `supabase db reset --local --yes` and `scripts/migration-replay.sh` | PostgreSQL 17 migration log with no production URL |
| Auth and role matrix | Playwright API requests with seeded JWTs | Manager/staff allowed operations and viewer/staff denials |
| Tenant isolation | Authenticated requests using Pilot A and Pilot B tokens | Cross-tenant reads/writes rejected |
| New Sale | `e2e/pilot.spec.ts` plus API data assertions | One reservation for concurrent identical requests |
| Retry/recovery | Playwright request retry with identical `Idempotency-Key` | Same reservation ID, no capacity leak |
| Capacity | API/database query after sale and failed sale | `booked` equals active reservation occupancy |
| Manual seating and rooming | Browser workflow against seeded departure | Seat/room rows belong to the reservation and tenant |
| Canonical payment | Authenticated payment request plus database query | Ledger total equals reservation financial cache |
| Documents and storage | Generated document download from local Storage | Fields match canonical reservation/passenger/accommodation rows |
| SMTP | Inbucket UI at `http://127.0.0.1:54324` | Controlled recipient only; no external delivery |

No row is PASS merely because a unit or component test passes. Missing Docker, credentials,
browser binaries, or an isolated local stack is BLOCKED.

## Safe credentials and delivery

Use only `.test` recipient addresses and the local Inbucket SMTP service. Never configure a
real SMTP provider, production Supabase URL, production service-role key, or copied customer
data in this setup. The local service-role key is for the API seed process only.

## Cost and manual actions

Local Docker/Supabase has no hosted operating cost beyond the developer machine. A hosted
staging Supabase project, CI Docker runner, SMTP provider, object storage, or browser device
service requires explicit approval and separate non-production credentials. Manual actions are
installing Docker/Supabase/Playwright browsers and copying local values from `supabase status`.

Stop and remove the local stack with:

```bash
cd nmt-analytics-api
npm run staging:down
```
