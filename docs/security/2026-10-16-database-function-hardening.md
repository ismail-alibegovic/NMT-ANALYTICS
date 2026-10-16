# Database function security hardening

Baseline: `origin/main` at `32fbb2df4b69fe13c048cf357a5287c1e2eb7d59` (PR #109). Production recovery documentation PR #110 is separate. Scope: function ACLs and advisor findings, with no production writes, business-code changes, RLS changes, or edits to historical migrations.

## Confirmed findings and migration

Read-only Supabase catalog and security-advisor inspection on 2026-10-16 confirmed:

- `public.recompute_group_member_count()` is a PostgreSQL trigger function (`RETURNS trigger`, owner `postgres`, `SECURITY DEFINER`, `search_path=public`). Its ACL grants EXECUTE to PUBLIC, anon, authenticated and service_role. The only repository reference outside its definition/comment is `trg_group_member_count`, AFTER INSERT OR DELETE, FOR EACH ROW on `trip_passenger_group_members`.
- `src/routes/passengerGroups.ts` uses the server's `supabaseAdmin` client for membership INSERT/DELETE and `replace_passenger_group_members`. Safe passenger removal deletes memberships by FK cascade. None needs a direct call to the count trigger function from a browser role.
- Trigger functions cannot be called as ordinary SQL functions even when EXECUTE is granted. The excessive ACL is a real least-privilege/advisor defect; this review does not claim a demonstrated arbitrary count-update exploit via RPC. Revocation prevents direct execution at the permission boundary (42501), before the trigger-only runtime error.
- `prevent_supplier_confirmation_event_mutation()` is SECURITY INVOKER and only raises the append-only exception. It lacks a pinned search_path. This is advisor hardening, not evidence of a definer/RLS bypass.

Append-only migration `20261016110719_database_function_security.sql` revokes EXECUTE on both trigger functions from PUBLIC, anon and authenticated, retains service_role access, and pins the supplier guard to `pg_catalog, public`. It does not replace function bodies or recreate triggers. PostgreSQL checks trigger-function EXECUTE when creating a trigger, not when firing an existing trigger. The regression temporarily revokes service_role EXECUTE as well, then proves real group INSERT/DELETE still fires the trigger; that test-only revoke and all synthetic data roll back.

The local workstation lacks Supabase CLI, psql and Docker, and outbound Git/npm networking is unavailable. The timestamped migration was prepared directly following the existing append-only naming convention. Verification runs on the existing GitHub Actions runners with PostgreSQL 17 and Supabase CLI 2.109.0.

## Related privileged functions

The live catalog review covered all public SECURITY DEFINER functions, including group replacement, safe passenger removal, capacity reserve/release, rooming, seating, vehicle updates, accommodation requirements, financial recalculation/cache guards, signup and notification triggers, analytics and public-form submission. Except for the count trigger, anon/authenticated EXECUTE was already denied. All inspected definer functions have a pinned search_path. No broad grant/revoke sweep or security-mode change is included.

Fresh replay intentionally allows authenticated access to the identity-bound `get_my_org_id()` and `get_my_role()` helpers for tenant RLS. Their bodies derive identity from `auth.uid()` and do not accept a caller-supplied tenant ID. The inspected production ACLs currently deny authenticated access even to these helpers; that existing environment-parity difference is recorded for production recovery and is not changed here. API paths use service_role and must retain explicit tenant authorization.

## Regression coverage

`nmt-analytics-api/scripts/database-function-security.sql`, executed by both migration replay and isolated Supabase acceptance:

- Catalog-wide public SECURITY DEFINER audit: no PUBLIC/anon EXECUTE, no authenticated EXECUTE except the two identity helpers, every search_path pinned.
- Actual role-switched calls as anon and authenticated must raise insufficient_privilege (42501) for both hardened triggers, the reservation financial guard, group replacement, safe passenger removal, and capacity reserve/release.
- Existing count-trigger attachment, events, row timing and enabled state; unchanged supplier invoker security mode and pinned path.
- Real membership insertion, deletion and drift repair; atomic member replacement; wrong-tenant group replacement and passenger deletion; group locks; primary reassignment; FK cascade count updates; last-member cleanup; untouched second-tenant group.
- Caller lacks direct count-function EXECUTE during the entire real-table workflow regression. All fixtures and test-only ACL changes roll back.

Existing API/admin CI and the full isolated browser acceptance suite remain required. They cover reservation, capacity, rooming/seating, financial, tenant/role and recovery workflows beyond this targeted SQL regression. A queued run is not a passing run; see the PR for exact-head run IDs/results.

## Advisor disposition (production snapshot before migration)

| Advisor | Snapshot | Disposition |
| --- | --- | --- |
| [0028 anonymous definer execution](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable) | count trigger | Fixed by migration; remains on production until separately deployed. |
| [0029 authenticated definer execution](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable) | count trigger | Fixed by migration; identity-bound RLS helpers may legitimately appear on fresh environments. |
| [0011 mutable search_path](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable) | supplier append-only guard | Fixed by pinning path; invoker body unchanged. |
| [0008 RLS enabled without policies](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) | 14 API-only tables | Intentional default-deny. Live catalog confirms RLS enabled, zero policies, no SELECT/INSERT/UPDATE/DELETE privilege for anon/authenticated, and service_role SELECT. Do not add permissive policies to silence INFO notices. |
| [Leaked-password protection disabled](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) | Auth WARN | Real remaining Auth configuration hardening item; not an intentional database restriction. Requires a separate Auth settings change; untouched by this migration. |

The 14 default-deny tables are `accommodation_assignments`, `accommodation_buildings`, `accommodation_floors`, `accommodation_rooms`, `automation_executions`, `automation_rules`, `bus_seat_categories`, `campaigns`, `communication_history`, `message_templates`, `payment_links`, `quotation_reference_counters`, `role_permissions`, and `seed_owned_records`.

## Compatibility and deployment

No data backfill, schema shape change, RLS relaxation or application release ordering is required. Existing backend calls and trigger paths retain behavior. External callers that depended on directly invoking these trigger functions lose EXECUTE; no legitimate repository caller exists. Keep public schema CREATE unavailable to untrusted roles (confirmed in the production snapshot). A pinned `public` search_path relies on that existing trust boundary.

Do not apply this PR directly to production or merge automatically. After review and a separately authorized deployment, verify ACLs with `has_function_privilege`, confirm trigger attachment and run advisors again. Production warnings cannot be claimed cleared before deployment. If an unexpected integration breaks, investigate its supported API path rather than restoring PUBLIC EXECUTE.
