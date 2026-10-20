# Waiver consent contract repair

Source: confirmed blockers from the sequential Travline release audit after #138/#139 and UI reconciliation #140.

## Required behavior
Align existing template storage (`body`) with the API (`body_text`), snapshot issued terms/declarations, return the complete random token, and use one canonical API/UI contract. Wire the manager consent page into protected routes; retain Agent issuance/PDF policy and enforce every boundary on the server. Never store raw capabilities or expose them in logs/telemetry.

Persist single-use signing, passenger consent state and its anonymous-capability audit in one database transaction. Reject duplicate pending issue requests, foreign passengers, invalid/expired/revoked links, missing required declarations and concurrent overwrites. Support explicit revocation and reissue. Preserve drafts/drawing on failed save and give keyboard users a typed-name path.

## Verification
Use only disposable synthetic organizations, accounts and reservations. Execute real API/browser workflows in BS/EN, light/dark at 390/768/1440, cross-tenant and concurrent request tests, existing security and acceptance suites, migration replay, explicit browser/trigger ACL checks and database consent/audit invariants. All six protected checks plus UI browser checks must pass on the exact final commit.

## Migration and rollout
Append-only migration was created with Supabase CLI 2.109.0 in job 118861286144; the temporary authoring job was removed from #140. Do not change historical migrations. Preserve consumed legacy records; revoke only unsigned legacy links that lack an immutable snapshot, requiring explicit reissue. No production migration or data write is authorized by this audit. Organization-safe foreign keys enforce new writes while legacy validation remains a separately reported production readiness step. Rollback keeps additive columns and signed history; never reset consumed signatures.

Evidence/coverage: docs/operations/waiver-consent-audit.md. Release remains NO-GO until verification and production prerequisites are complete.
