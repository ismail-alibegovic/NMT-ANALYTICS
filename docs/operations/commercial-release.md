# Commercial release operations — host-independent

Scope: production readiness for real agencies. Follow [the commercial roadmap](../TRAVLINE_FINAL_ROADMAP.md). This is a reviewable plan, **not authorization** to migrate/deploy/restore a hosted project, write customer data or activate providers. Zo/Vercel/containers are alternative consumers of the same verified GitHub commit, not separate sources of truth.

## Evidence required before choosing GO

| Requirement | Required evidence / owner | Current observation |
| --- | --- | --- |
| Release artifact | Immutable main SHA, final PR checks and build/runtime versions, matching API/admin | Prior verified main bda422f / Node 24; commercial signup batch under review |
| Destination | Approved host/project/region, DNS/TLS, environment separation and operations owner | Not verified for this commercial release |
| Configuration | Server-only service key; client-safe publishable values; exact origins/deep-links; production dev flags rejected; startup/health/restart | Existing source/tests retained; actual target verification pending |
| Migration parity | Real schema_migrations plus catalog/functions/ACL/RLS/constraints/Storage inventory, reviewed hashes, pending order | Isolated replay evidence only; hosted backlog cannot be inferred from a historical four-migration note |
| Recovery | DB backup/PITR timestamps, retention, earliest/latest recovery points; Storage **object bytes** inventory/backup; Auth/config recovery; isolated restoration and authenticated workflows | No hosted evidence or measured RPO/RTO supplied |
| Observability | Sanitized logs, meaningful health/error checks, actual receipt/alert routing and responsible operator | Code privacy/health foundations exist; deployed ingestion/receipt not verified |
| Agency onboarding | Separate organizations, authorized owner/staff roles, secure first access, initial settings, revoke/recover lifecycle | P0 signup repair underway; complete P5 acceptance pending |
| Integrations | Deferred providers remain disabled and core business/finance works without them | SMTP/SMS/gateways/optional integrations must not be activated |

Agree realistic RPO/RTO, retention, restore authority and incident escalation with the operator; do not invent SLA values. Database row-count recovery is not evidence of recoverable document bytes or Auth/account access. Use [isolated database recovery](isolated-database-recovery.md) as an existing rehearsal, not a hosted restore command.

## Application/migration sequence

1. Read-only reconcile the approved destination's schema history and actual definitions. Review any historical cancelled-resource anomalies or incomplete Auth bootstrap separately; never silently repair customer or staff records.
2. Verify a usable backup and object/config recovery path, staging rehearsal, migration hashes, maintenance/lock window and rollback procedure. Obtain approval for the exact hosted destination and pending migration list.
3. Retain the already-reviewed order: 20261024120000_atomic_reservation_editor.sql → 20261025090000_reservation_mutation_transactions.sql → 20261025100000_cancelled_reservation_operations.sql, if each is genuinely pending in the destination. Other history must be reconciled, not skipped or marked applied.
4. The commercial signup batch adds **20261025120000_atomic_signup_provisioning.sql**. It replaces only the INSERT trigger function, pins its search path/ACL and makes new tenant creation fail atomically. It changes no existing Auth identity, profile, organization or financial record. Old migrations are immutable. Apply through the reviewed migration runner only after the appropriate approval; do not run the disposable SQL fixtures against hosted data.
5. Deploy the verified API/admin SHA together. The safer signup route can run before the new trigger (old trigger uses its existing email-derived display name); apply the reviewed trigger before accepting the new organization-name onboarding contract. The new trigger also supports older signup callers without org_name metadata. Do not restore the old public service-role rename behavior during rollback; temporarily suspend public signup if necessary and review a safe function rollback separately.
6. Verify real startup/deep links/assets/auth/tenant/role/readiness on the approved target without creating customer/financial records. Any synthetic tenant provision in a hosted project needs its own agreed test destination/scope. Verify recovery and operational monitoring evidence before release approval.

## Supported scope while integrations are deferred

Record internal cash/bank payments, installments, voids/refunds and balances through existing authorized API workflows; retain immutable ledger history and currency boundaries. These must not depend on a gateway or message delivery. Provider-disabled actions must return truthful safe errors and must not undo or falsely fail an otherwise saved business transaction.

No SMTP/SMS activation, live gateway calls, client payment integration, scheduled external sends or optional provider enrollment belongs to this release batch. Supabase Auth confirmation/recovery delivery remains unverified operationally; the operator must define a secure supported provisioning/access procedure for P5 without claiming external delivery has been tested. No shared agency accounts, public director passwords or demo workspaces.
