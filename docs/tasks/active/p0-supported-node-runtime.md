# P0 — Supported, reproducible Node runtime

> Commercial scope override — 2026-10-25: **COMPLETED REFERENCE — reuse merged work; no repeated audit**. The [P0–P5 commercial roadmap](../../TRAVLINE_FINAL_ROADMAP.md) supersedes former demo/Zo-only priorities and historical authorization below. No real customer writes, hosted migrations, external provider activation or paid services are authorized. Internal financial workflows remain in scope. Current execution is selected by the [task registry](README.md).

**Status:** MERGED / VERIFIED — [#162](https://github.com/ismail-alibegovic/NMT-ANALYTICS/pull/162), merge `53d41ec3f92358b1b800c4f7c15f8239cc30b870`. Final head `c376547a75b8a32a3e4fe4e83cb71cc37883d68b` passed all required checks: CI 40137978854, isolated acceptance 40137978765, UI audit 40137978710, Docker and preview.
**Priority:** P0 runtime/security configuration; final roadmap INFRA-01.
**Branch:** `fix/p0-supported-node-runtime`
**Base:** verified main after #161; only this task is active for implementation.

## Goal and confirmed problem
CI, API Docker build/runtime and admin Docker build still select Node 20. Zo documentation permits 20.6 and the production launcher does not enforce a shared supported major. Local successful verification already uses Node 24. Align the repository, CI, containers and Zo handoff to Node 24 LTS; fail before any build/install/server action when a different major is used.

## Discovery and scope
Inspect package/lock metadata, all setup-node workflows, Dockerfiles, production shell/JS launcher, existing production environment regressions, and Zo runbook. Add an explicit local Node selector and Node 24 engine contracts without changing dependency resolutions. Use existing npm ci/build scripts. Preserve production env parsing/precedence, dev-bypass rejection, signal forwarding, API-first/tenant boundaries and all domain code. No schema/migrations, runtime secrets, providers, production/Zo operations or demo/customer-data actions.

## Acceptance and tests
- CI/build/runtime and all package engine declarations agree on Node 24; clean locked installations succeed.
- Shell entry and direct JS entry reject a mismatched major before npm/build/server actions. Existing environment security behavior and production-mode tests remain green. Add failing regressions first, using a child-process version shim rather than downloading/executing unsupported runtimes.
- API build/strict/NodeNext and full tests; admin lint/full tests/build; sales reliability/BS/EN browser regressions on Node 24; container builds and isolated acceptance on Node 24 in required exact-head CI before merge.
- Document exact sync/Node/npm/build/start/migration-order and rollback contract for Zo. Existing hosted environment/schema/runtime checks remain release gates, never claimed passed from local CI.
- Update final roadmap with #161 merge and CI evidence, this runtime batch evidence and remaining P0/P1–P4 scope. No unrelated upgrades or features.
