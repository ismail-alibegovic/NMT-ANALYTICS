# Phase 3 — Departure inheritance

# Global rules (apply to every task)

- **Multi-tenant**: every tenant-owned read/write must be scoped to the authenticated org. Never trust a browser-supplied `org_id`.
- **Cross-org access = release-blocking security defect.**
- GitHub `main` is source of truth. **One task = one branch = one PR.** Never develop on `main`.
- **Append-only migrations.** Never edit an applied migration. No destructive migration without a rollback plan.
- **i18n**: no hardcoded user-facing strings; keep BS/EN parity.
- **No broad redesigns** — change only screens required by the task.
- **Verification**: API `build`+`test`, admin `lint`+`test`+`build`, browser-verify user-facing workflows. Green build ≠ verified UI.
- **Report**: branch, files changed, migrations, tenant notes, build/test results, browser verification, commit SHA, PR link.

Read `../../AGENTS.md` (repo root) and `../PRODUCT.md` / `../ARCHITECTURE.md` before coding.

---

## T06 — Package → Departure materialization

Master section(s): §5, §6

### Requirements

- Departure = a concrete term created from a package template.
- Relevant data is snapshotted/materialized at creation.
- Later package edits do NOT auto-change existing departures.
- Departure aggregates: travel dates, transport, capacity, reservations, passengers, groups, hotel allotment, rooming, payments, flight/bus ops, comms, documents.

### Definition of done

- Creating a departure snapshots package data; editing the package afterward does not mutate the departure.

### Verification

- API: `cd nmt-analytics-api && npm ci && npm run build && npm test`
- Admin: `cd nmt-analytics-admin && npm ci && npm run lint && npm test && npm run build`
- Browser-verify the affected workflow.

---

## T07 — Departure inventory override

Master section(s): §5

### Requirements

- Departure can override inventory and other operational values independently of the package.

### Definition of done

- Departure-level inventory/operational overrides persist and take precedence over package defaults.

### Verification

- API: `cd nmt-analytics-api && npm ci && npm run build && npm test`
- Admin: `cd nmt-analytics-admin && npm ci && npm run lint && npm test && npm run build`
- Browser-verify the affected workflow.

---

