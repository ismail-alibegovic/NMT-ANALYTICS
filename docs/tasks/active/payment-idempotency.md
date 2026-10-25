# Payment request idempotency

> Commercial scope override — 2026-10-25: **REFERENCE / BACKLOG — reconcile existing evidence before any new implementation**. The [P0–P5 commercial roadmap](../../TRAVLINE_FINAL_ROADMAP.md) supersedes former demo/Zo-only priorities and historical authorization below. No real customer writes, hosted migrations, external provider activation or paid services are authorized. Internal financial workflows remain in scope. Current execution is selected by the [task registry](README.md).

Owner-authorized financial hardening, separate from communications/Auth/scheduler work.

Standalone POST /payments accepts an optional UUID idempotency_key. The API derives a stable UUIDv8 payment ID from SHA-256 of a fixed namespace, authenticated organization ID and request key. The existing payments primary key serializes competing inserts; a rejected duplicate/ledger write re-reads the winner under the same tenant. Identical retries return 200 with the same payment ID and current reservation finance; changed recorded terms return 409. The original creation returns 201. Notifications/email and audit CREATE run only for the creation winner. Existing callers without a key retain existing behavior. Installments retain their canonical row and status compare-and-set guard.

No schema migration, RPC, new table, RLS change or ledger-trigger change is required. Thus the two already-pending migrations remain the only database prerequisites. The admin persists a request key per intent until a successful response so ambiguous network failures/reloads reuse it. A success ends that intent: deliberately recording another payment requires a new key. Direct third-party API callers must supply and retain a key themselves. Editing/refunding a recorded payment can cause a later retry of its original terms to return conflict, never a duplicate.

Validation: API replay/full-balance/conflict/tenant tests, frontend key lifetime tests and real concurrent PostgreSQL requests in isolated acceptance. No production data changes or live confirmation messages.
