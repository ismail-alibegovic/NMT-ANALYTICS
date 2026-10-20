# Reservation completion without a retry key

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
