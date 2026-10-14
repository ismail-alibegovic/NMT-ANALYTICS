# M24 — Complete pilot acceptance

**Status:** ACTIVE
**Priority:** P0
**Branch:** `feat/travline-pilot-acceptance-phase2`
**Authority:** User requested completing Travline in the agreed order on 2026-10-14.
**Roadmap:** M24; verification of existing M03/M07/M14/M15/M16.

## Goal and confirmed problems

Complete PR #79's isolated acceptance suite and prove a real New Sale through the browser on desktop and mobile. The existing suite fails because it reads a nested cost-item response as a top-level ID. Its document upload also supplies JSON Content-Type for multipart data. Most existing acceptance scenarios operate through API requests rather than the UI.

## Scope and domain rules

Correct the test harness, add browser sale verification, and record exact CI evidence. Use the existing APIs, canonical reservation/passenger/payment models, authenticated tenant context, and disposable local Supabase seed. Keep all tests independent of production credentials and customer records. No schema changes or unrelated screen redesign.

## Acceptance

- All existing API/admin tests, builds and migration replay remain green.
- Supplier cost creation and confirmation use the actual response contract.
- PDF upload/download works in isolated Storage.
- A manager completes a two-passenger sale through the actual UI at desktop and 390px width; its persisted manifest and generated contract agree with the sale.
- Record each proven, failed, skipped or blocked result; never equate API-only verification with browser verification.
- Existing failure-recovery and concurrent-payment product defects remain explicit follow-up tasks and are not waived by passing harness tests.

## Verification and release

Run API build/tests and admin lint/tests/build locally; execute the complete isolated GitHub acceptance workflow and inspect logs. Verify Vercel preview and review required production migrations before merging. No new user-facing copy is introduced, so BS/EN changes are not required in this verification slice. Broader language parity remains a separate task.
