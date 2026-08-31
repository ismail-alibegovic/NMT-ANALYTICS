# Phase 1 — Core CRUD / save

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

## T01 — Package CRUD

Master section(s): §3

### Requirements

- Package = commercial template: destination, date-based/open parameters, prices, transport, accommodation, hotels, services, variants.
- Hotel can be selected from catalog or created inline from the Package Editor.
- Full CRUD + save (create/read/update/delete), tenant-scoped.

### Definition of done

- Package can be created, listed, edited, deleted and saved from the Package Editor; persisted via API; tenant-scoped.

### Verification

- API: `cd nmt-analytics-api && npm ci && npm run build && npm test`
- Admin: `cd nmt-analytics-admin && npm ci && npm run lint && npm test && npm run build`
- Browser-verify the affected workflow.

---

## T02 — Hotel catalog CRUD

Master section(s): §4

### Requirements

- Hotel = reusable supplier/catalog entity: name, destination, stars, base info.
- Full CRUD, tenant-scoped.

### Definition of done

- Hotel catalog CRUD works end-to-end; hotels selectable in the Package Editor.

### Verification

- API: `cd nmt-analytics-api && npm ci && npm run build && npm test`
- Admin: `cd nmt-analytics-admin && npm ci && npm run lint && npm test && npm run build`
- Browser-verify the affected workflow.

---

## T03 — Transport types

Master section(s): §31

### Requirements

- Canonical transport types: bus, flight, train, ship, mixed + existing values.
- Frontend / API / DB contract aligned.

### Definition of done

- Transport type values are consistent across DB, API and UI.

### Verification

- API: `cd nmt-analytics-api && npm ci && npm run build && npm test`
- Admin: `cd nmt-analytics-admin && npm ci && npm run lint && npm test && npm run build`
- Browser-verify the affected workflow.

---

