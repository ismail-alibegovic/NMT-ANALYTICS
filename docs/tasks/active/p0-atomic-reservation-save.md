# P0 — Atomic reservation editor save

**Status:** MERGED / VERIFIED in isolated CI. PR #161; merge `ad62d77e7aa3c1f7d7b8ffb2bb0f622611a6564b`. All required exact-head checks passed on `c217179b537fa72b24dcf1932b8007148088e40f` (CI 40095659271, isolated acceptance 40095659268).
**Priority:** P0
**Branch:** `fix/p0-atomic-reservation-save`
**Roadmap references:** final roadmap P0 write integrity; M02/M04/M07/M14 invariants.

## Goal and confirmed defect
The editor currently PATCHes core fields, then PUTs/DELETEs accommodation. The second request can fail after the core fields and capacity have committed. Save both in one tenant-scoped API transaction; success means the entire edit persisted and failure means none did.

## Discovery and scope
Inspect EditReservationModal, reservations API/client/schema, capacity and atomic accommodation functions, currency/quotation/financial guards, existing editor/route tests and isolated database contracts. Extend existing PATCH with optional combined accommodation input and a justified service-role-only transactional RPC through an append-only migration. Preserve legacy PATCH clients and existing allocation/mapping validators; no frontend business DB access. No production migrations, customer writes, hosted seeds/resets, unrelated UI/features or demo work.

## Domain/API/security requirements
Authenticated org/agent checks and audit stay mandatory. Lock reservation and relevant departures; retain capacity deltas, package currency, quotation amount/currency locks, financial-child currency locks and organization-safe IDs. Recheck critical invariants under transaction locks. Reuse the existing atomic accommodation validator in the same transaction. No public/anonymous/authenticated RPC execution grants. Return meaningful conflicts without SQL diagnostics. Paid amounts and other ledger-owned fields remain rejected.

Explicit null accommodation means preserve existing requirements for cancellation, which must not silently remove rooming/mappings; empty array means clear, subject to existing mapping/rooming safety. Standalone reservations with no accommodation may save without a departure. No production execution of the migration is authorized.

## Frontend and acceptance
Keep existing editor UI, BS/EN feedback, responsiveness and quotation lock. One save request contains core and accommodation intent; never run a second accommodation mutation. Failed saves keep the editor/data open without onSuccess; successful saves call existing completion callbacks once. Cancellation preserves accommodation history. No unrelated redesign.

## Required verification
Reproduce the two-request failure in a regression before changing the editor. API tests cover combined payload/scoping, rejection and no legacy capacity mutation, auth/role/tenant/financial guards. Disposable database tests exercise successful combined save, accommodation failure after core/capacity change with full rollback, forged org/relationships, currency/quotation locks and RPC privileges. Extend existing CI isolated acceptance rather than claiming mock transactions prove rollback. Full API build/tests, admin lint/tests/build and browser editor scenarios; migration replay/Docker and required exact-head CI before merge. Record exact results and all remaining P0 release gates in the master roadmap. No priority is complete from this single batch.
