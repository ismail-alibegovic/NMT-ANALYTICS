# Pilot — Resume saved sale completion

**Status:** ACTIVE
**Priority:** P0
**Branch:** fix/sale-completion-recovery
**Baseline:** 52c4e64b
**Authority:** User requested completing Travline in order on 2026-10-14.

An identical recovery-required retry currently returns 202 without continuing work. The wizard also creates a schedule again after the API has already created it, and normal reads omit creation state.

Resume only safely bounded final stages: installments and completion. Claim against tenant, stage and state; reuse valid schedules and preserve payment history, passengers, capacity, accommodation and snapshots. Cancelled sales cannot be revived. Earlier failures explicitly require manual review instead of automatic duplication. Show processing/manual/completed states and a saved-reservation link with BS/EN copy. Block newly received payments in UI/API while incomplete; retain void/refund corrections.

No schema change or unrelated redesign. Full-stage automatic recovery, stale processing leases and arbitrary payment idempotency remain separate slices.

Required evidence: unit tests for claim loss, schedule reuse, incompatible history, failure reset and completion; UI tests for one schedule creation and no false success; isolated seeded recovery acceptance; API/admin tests/build/lint, migration/Docker checks and Vercel preview. Local execution became unavailable due to runtime transport disconnection; GitHub CI must provide verification.
