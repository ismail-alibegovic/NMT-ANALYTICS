# Complete form and theme audit

> Commercial scope override — 2026-10-25: **REFERENCE / BACKLOG — reconcile existing evidence before any new implementation**. The [P0–P5 commercial roadmap](../../TRAVLINE_FINAL_ROADMAP.md) supersedes former demo/Zo-only priorities and historical authorization below. No real customer writes, hosted migrations, external provider activation or paid services are authorized. Internal financial workflows remain in scope. Current execution: [commercial-signup-integrity](commercial-signup-integrity.md).

User-authorized scope: browser audit of all user-facing Travline routes and interactive states before demo data generation. Preserve the existing design system. Reproduce confirmed bugs, add regressions, fix in independent branches/PRs, verify light/dark and responsive behavior. Do not merge or modify production business data.

Coverage/evidence: `docs/operations/form-theme-audit-2026-10-17.md`.

First scoped implementation: shared modal accessibility, nested lifecycle and viewport reachability, subject to reproduction. Backend persistence is a separate verification requirement and cannot be satisfied with component fixtures.
