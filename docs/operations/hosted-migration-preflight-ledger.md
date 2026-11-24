# Hosted Supabase Preflight, Migration Order, and Recovery Ledger

**Recorded:** 2026-11-23  
**Release status:** **NO-GO for commercial production**  
**Hosted target observed (READ-ONLY):** Supabase project `hacutwknfgufrqlgdiia`; Vercel production READY on GitHub `main` `43da03c`.

> [!CAUTION]
> This document is a **read-only preflight and approval-gated operational ledger**. It grants **NO authorization** to run hosted migrations, mutate live/customer records, activate SMTP/SMS/payment providers, or bypass transactional RPC integrity with non-atomic fallbacks.

## 1. Confirmed P0/P4 Hosted Schema Gap (2026-11-23 READ-ONLY Evidence)

Read-only inspection of hosted Supabase `hacutwknfgufrqlgdiia` confirmed:

- Hosted `supabase_migrations.schema_migrations` count: **115**, latest applied version: **`20261022192823`**.
- Repository migration count on `main` (`43da03c`): **120** (plus **1** append-only migration added in `fix/commercial-allocation-edit-and-transport-integrity` → **121** once merged).
- Read-only `information_schema.routines` confirmed `public.create_hotel_inventory` and `public.create_hotel_room_inventory` do **not** exist on the hosted database.
- **Hosted Backup & Plan Status (READ-ONLY dashboard, 2026-11-23):** Supabase organization plan is **FREE**; `Database > Backups` reports *"Free Plan does not include project backups"* and overview reports *"No backups"*. **No confirmed hosted restore point exists.** This is a hard P0/P4 release blocker — hosted migrations MUST NOT proceed until verifiable DB + Storage backup/restore capability is provisioned and rehearsed.
- **Read-Only Metadata Inventory (2026-11-23):** `15` hotels; `0` invalid room stock/labels, orphan/cross-org rooms, or parent-below-stock rows; `0` public tables without RLS; `documents` Storage bucket is private with `0` objects. These read-only checks confirm clean current metadata, **not** backup/recovery readiness or hosted operational acceptance.
- Consequence: any hosted API request targeting those RPCs (and the new atomic allotment edit RPC once deployed) will fail closed with `503 MIGRATION_PENDING` rather than falling back to unsafe partial writes. **Do not weaken fail-closed behavior.**

## 2. Exact Pending Migration Order (116 → 122)

When an explicit, separately approved maintenance window is authorized after verified backup/restore readiness, migrations must be applied in strict timestamp order:

| Seq | File | Source PR / Batch | Key DB Objects & Risk Notes |
| --- | --- | --- | --- |
| 116 | `20261024120000_atomic_reservation_editor.sql` | PR #161 | Service-only atomic reservation editor RPC (`edit_reservation_atomic`) |
| 117 | `20261025090000_reservation_mutation_transactions.sql` | PR #163 | Transactional reservation core/status/batch/delete capacity RPCs |
| 118 | `20261025100000_cancelled_reservation_operations.sql` | PR #163 | Atomic seat/room release on cancellation with lock protection |
| 119 | `20261025120000_atomic_signup_provisioning.sql` | PR #164 | Fail-closed `auth.users` signup bootstrap (`handle_new_user` + collision-safe slug) |
| 120 | `20261026120000_hotel_inventory_integrity.sql` | PR #169 | `NOT VALID` stock constraints (preserves legacy rows), `guard_hotel_stock_total`, `create_hotel_inventory`, `create_hotel_room_inventory` |
| 121 | `20261123120000_atomic_allotment_and_vehicle_integrity.sql` | Current batch (`fix/commercial-allocation-edit-and-transport-integrity`) | Service-only `update_departure_accommodation_allotment_atomic`, hardened `update_vehicle_atomic` (keeps exact 6-arg signature, `search_path = ''`, explicit registration clear via `''`) |
| 122 | `20261124120000_staff_lifecycle_and_revocation.sql` | PR #175 | `profiles.revoked_at`, service-only `assign_staff_profile_atomic`, app-metadata-only staff bootstrap; preserves public signup tenant isolation |

## 3. Verifiable Read-Only Preflight Procedure (Before Any Hosted Apply)

Run ONLY against a read-only connection or isolated clone first:

1. **Confirm exact hosted migration head (read-only):**
   ```sql
   SELECT COUNT(*) AS applied_count, MAX(version) AS latest_version
   FROM supabase_migrations.schema_migrations;
   ```
   Expected before rollout: `115` and `20261022192823`.

2. **Run existing preflight anomaly check (read-only):**
   Execute `nmt-analytics-api/scripts/production-migration-preflight.sql` (read-only) and verify whether legacy data anomalies exist in `hotel_rooms`, `hotels`, `hotel_allocations`, `reservations`, or `departure_vehicle_assignments`.
   - Note: `20261026120000` intentionally adds `NOT VALID` constraints so legacy rows are not rewritten automatically; any legacy anomaly requires a separate reviewed reconciliation plan.

3. **Confirm zero unauthorized function/table privileges before and after:**
   - Every new `SECURITY DEFINER` function must have pinned `search_path` and `EXECUTE` revoked from `PUBLIC`, `anon`, and `authenticated` (granted only to `service_role`).

4. **Mandatory Isolated Rehearsal Gate (Before Hosted Apply):**
   - Run full migration replay from zero (`nmt-analytics-api/scripts/migration-replay.sh`) on disposable PostgreSQL 17.
   - Run upgrade rehearsal (`nmt-analytics-api/scripts/production-upgrade-rehearsal.sh`) and logical recovery + value-corruption rejection (`isolated-recovery-rehearsal.sh`, `isolated-recovery-value-rejection.sh`).
   - Run an isolated restore rehearsal from a real hosted DB backup + Storage object backup, recording measured RPO/RTO and SHA-256 verification.

## 4. Mandatory Backup & Recovery Procedure

Before any separately approved hosted migration window:

1. Capture a verified logical + PITR checkpoint of hosted PostgreSQL **and** verifiable Storage object backup inventory.
2. Confirm restore of that snapshot into a disposable target succeeds and passes schema/row-count/checksum verification.
3. Record operator owner, approval timestamp, pre-apply backup ID, target Git SHA, and rollback decision criteria.
4. **If any migration fails mid-window:** stop immediately (each migration file is wrapped in `BEGIN; ... COMMIT;`), do not hot-patch `schema_migrations`, inspect the error on an isolated clone, and if post-apply regression occurs, restore from the verified pre-window backup/PITR checkpoint rather than running destructive ad-hoc `DROP` statements.

## 5. Post-Apply Read-Only Verification Queries

After an approved window applies 116→122:

```sql
-- 1. Exact migration count and latest version
SELECT COUNT(*) AS applied_count, MAX(version) AS latest_version
FROM supabase_migrations.schema_migrations;
-- Expected: 122 and 20261124120000

-- 2. Required service-only RPCs present with pinned search_path and safe ACLs
SELECT p.oid::regprocedure AS signature,
       p.prosecdef,
       p.proconfig,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec,
       has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_exec
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'edit_reservation_atomic',
    'create_hotel_inventory',
    'create_hotel_room_inventory',
    'update_departure_accommodation_allotment_atomic',
    'update_vehicle_atomic',
    'assign_staff_profile_atomic'
  )
ORDER BY p.proname;
-- Expected: prosecdef=true, search_path pinned, anon_exec=false, auth_exec=false, service_exec=true
```

## 6. Hosted checkpoint — 2026-11-24

- PR #173 merged as `8ab4a4b6ce7d7032107dcf3d7da31eacb65646ff`. Its isolated Preview candidate `5213f2f2c08e7b7afa5a57c0129fd05c594d6278` is READY at Vercel deployment `dpl_5Gb5a4YLd7dcrm6kfpGNpxD41NNK`.
- Separate Staging project `hlyqrwytlrimtrjncmez` is ACTIVE_HEALTHY, with **122** applied migrations, latest `20261124120000`. Preview URL/ref/public keys and the sensitive server key are scoped to Preview; Production retains separate entries. Preview communication jobs remain disabled.
- Build evidence: `production_project=false`; bundle scan passed for 152 files. Health returned HTTP 200, `database: connected`, dev bypass false, email provider false and Sentry false. Runtime logs confirmed anonymous `/api/customers` requests were rejected by the application with 401.
- Native browser acceptance: signed in to a synthetic Staging agency, created a package and departure, then created reservation `2b80f6fe-5d1d-4027-b6f2-5c7be01c0433` through the sale wizard. Staging SQL confirmed pending status, total 100 BAM, paid 0. Production read-only queries found **zero** corresponding organization, user, package or reservation records. The synthetic account was then banned and its Auth sessions removed.
- Production remains at **115** migrations, latest `20261022192823`, with zero Storage objects and zero public tables lacking RLS. No production migration or customer mutation was performed. This Staging exercise is **not** a production backup/restore rehearsal. Commercial release remains **NO-GO** pending recovery, production migrations and monitoring acceptance.
