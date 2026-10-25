# Owner-requested forms and finance audit

> Commercial scope override — 2026-10-25: **REFERENCE / BACKLOG — reconcile existing evidence before any new implementation**. The [P0–P5 commercial roadmap](../../TRAVLINE_FINAL_ROADMAP.md) supersedes former demo/Zo-only priorities and historical authorization below. No real customer writes, hosted migrations, external provider activation or paid services are authorized. Internal financial workflows remain in scope. Current execution: [commercial-signup-integrity](commercial-signup-integrity.md).

Start from main 21ce102733e817638f71d545a96fadd87cd0221d. Do not merge or modify production records. Use existing localhost-only synthetic acceptance fixtures; no comprehensive demo seed.

Review #120–128, preserve their separate ownership and mark overlaps. Inventory remaining forms, modals, drawers and uploads. Browser-reproduce confirmed defects before fixing, add focused regressions and verify UI → HTTP → disposable database → reload. Finance includes payments, installments, cost items/expenses, supplier obligations, reports, refunds, tenant isolation, calculations, idempotency and concurrency. Record PASS / FAIL / NOT TESTED per workflow and distinguish component contracts from database evidence. Leave the audit open wherever acceptance is incomplete.

First implementation slice: the three active customer-payment forms, their create/edit/cancel/failure/duplicate contracts, refund eligibility/concurrency and real ledger verification. Continue remaining inventory as evidence permits; no milestone-completeness claim from route renders or unit tests.
