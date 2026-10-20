# Owner-requested forms and finance audit

Start from main 21ce102733e817638f71d545a96fadd87cd0221d. Do not merge or modify production records. Use existing localhost-only synthetic acceptance fixtures; no comprehensive demo seed.

Review #120–128, preserve their separate ownership and mark overlaps. Inventory remaining forms, modals, drawers and uploads. Browser-reproduce confirmed defects before fixing, add focused regressions and verify UI → HTTP → disposable database → reload. Finance includes payments, installments, cost items/expenses, supplier obligations, reports, refunds, tenant isolation, calculations, idempotency and concurrency. Record PASS / FAIL / NOT TESTED per workflow and distinguish component contracts from database evidence. Leave the audit open wherever acceptance is incomplete.

First implementation slice: the three active customer-payment forms, their create/edit/cancel/failure/duplicate contracts, refund eligibility/concurrency and real ledger verification. Continue remaining inventory as evidence permits; no milestone-completeness claim from route renders or unit tests.
