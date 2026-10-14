# Travline staging acceptance matrix

Updated: 2026-10-14. Accepted code: PR #79 head `b60f8e0b`, merge `a7f6c4b`.

Evidence: [CI 38602860616](https://github.com/ismail-alibegovic/NMT-ANALYTICS/actions/runs/38602860616), [acceptance 38602860621](https://github.com/ismail-alibegovic/NMT-ANALYTICS/actions/runs/38602860621).

| Gate | Result | Evidence |
|---|---|---|
| API build/unit suite | PASS | 71 files, 638 tests; local and CI |
| Admin lint/build/unit suite | PASS | 42 files, 283 tests; 54 existing lint warnings, no errors |
| Migration replay / Docker | PASS | CI and fresh PostgreSQL 17 reset |
| Auth/Storage/SMTP / two-tenant seed | PASS | Isolated CI; private documents bucket |
| Authenticated acceptance | PASS | 14 executed, no failures/skips |
| Browser New Sale | PASS | Desktop 1440px/mobile 390px; two passengers, canonical contract/PDF |
| Role/tenant checks | PASS | Manager/agent and second tenant requests |
| Sale retry/capacity | PASS | Stable-key retries, concurrency, capacity rejection |
| Seating/rooming | PASS | Authenticated API/database; wider browser flow remains open |
| Supplier confirmations/costs | PASS | Status history and cost rollup |
| Document upload/download | PASS | Private isolated Storage round-trip |
| SMTP | PASS | Auth recovery delivered to local Mailpit |
| Failed-installment retry | OPEN PRODUCT GAP | #79 confirmed rejection; next task must prove recovery |
| Concurrent-payment response | OPEN PRODUCT GAP | #79 allowed 500; next task must require meaningful 4xx |
| General payment idempotency | NOT CERTIFIED | Reservation idempotency does not certify payment retries |
| Whole-product browser / BS/EN | PARTIAL | Representative sale proven; broader acceptance remains |

This replaces the original setup-only BLOCKED snapshot. Disposable CI uses no production customer data or provider credentials. Release/maintenance evidence: `docs/tasks/completed/m24-pilot-browser-acceptance.md`.
