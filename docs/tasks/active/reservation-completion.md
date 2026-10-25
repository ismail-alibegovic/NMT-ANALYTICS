# Reservation completion without a retry key

> Commercial scope override — 2026-10-25: **REFERENCE / BACKLOG — reconcile existing evidence before any new implementation**. The [P0–P5 commercial roadmap](../../TRAVLINE_FINAL_ROADMAP.md) supersedes former demo/Zo-only priorities and historical authorization below. No real customer writes, hosted migrations, external provider activation or paid services are authorized. Internal financial workflows remain in scope. Current execution is selected by the [task registry](README.md).

Source: sequential Travline release audit, following #138.

## Confirmed defect
POST /api/reservations inserts creation_state=in_progress for every sale, but previously persisted completion only when Idempotency-Key was supplied. The successful response incorrectly claimed completion for legacy clients; payment recording subsequently rejected the saved sale.

## Scope
Persist completion for both request variants after all dependent writes. Preserve organization predicates, keyed duplicate prevention and recovery on failed completion. No schema change, production data changes or repair of historical records.

## Acceptance
- Route tests cover keyed and unkeyed success and unkeyed completion failure.
- Isolated Supabase acceptance creates an unkeyed reservation, reloads persisted completion, records payment and executes concurrent and cross-tenant denials.
- All six protected-branch checks must pass on the final head before merge.

## Remaining release blockers
The waiver template/token/signing contract still requires repair and isolated verification. Application-wide UI coverage and production infrastructure verification remain pending. This change alone does not authorize GO.
