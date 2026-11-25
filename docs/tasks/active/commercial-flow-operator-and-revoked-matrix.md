# Task: FLOW-01 — Operator Flow, Lock/Stale Recovery, and Role/Revoked Access Matrix

## Goal
Close the remaining P1 operational reliability and RBAC gaps identified in the FLOW-01 review:
1. Enforce fail-closed minimum role authorization on `GET /api/excursions`.
2. Prevent `RoomingWorkspace` from needlessly reloading or keeping stale rooming proposals on screen across language switches, departure switches, and `STALE_PROPOSAL` (409) conflicts.
3. Add deterministic regression coverage for revoked users, role-matrix boundaries across routes, and operator rooming/seating flows across backend and frontend.

## In-Scope Changes
- `nmt-analytics-api/src/routes/excursions.ts`:
  - Require `requireMinimumRole('agent')` on `GET /api/excursions` (fail-closing `viewer`, missing roles, and invalid roles before hitting Supabase).
- `nmt-analytics-admin/src/components/operations/RoomingWorkspace.tsx`:
  - Keep `load` stable across locale switches by reading `rm.loadFailed` through a ref instead of recreating `load`.
  - Reset departure-scoped transient UI state (`proposal`, `proposalError`, `assignTarget`, `editingRoomNumberSlotId`, `roomNumberDrafts`, `applyError`, `applyResult`) when `departureId` changes.
  - Refresh room slots via `await load()` when `applyRoomingProposal` returns `409` / `STALE_PROPOSAL`.
- Regression test suites:
  - `nmt-analytics-api/src/tests/flowRevokedAndRoleMatrix.test.ts`
  - `nmt-analytics-api/src/tests/flowOperatorRoomingAndSeating.test.ts`
  - `nmt-analytics-admin/src/tests/operatorRoomingAndSeatingMatrix.test.tsx`

## Out of Scope
- Database schema changes / migrations.
- Modifying hosted Supabase or Vercel settings.
- Broad UI redesign.

## Verification
- `npm --prefix nmt-analytics-api run build`
- `npm --prefix nmt-analytics-api test`
- `npm --prefix nmt-analytics-admin run lint`
- `npm --prefix nmt-analytics-admin test`
- `npm --prefix nmt-analytics-admin run build`
- Playwright `--config=nmt-analytics-admin/playwright.finance-forms.config.ts e2e/finance-forms/allocation-vehicle.spec.ts`
