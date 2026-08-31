# Phase 13 — Public & discoverability

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

## T31 — Public forms & embeds

Master section(s): §27

### Requirements

- Public forms and future embeddable booking for WordPress/other sites, wired to the Travline backend.

### Definition of done

- Public form posts data to the Travline backend.

### Verification

- API: `cd nmt-analytics-api && npm ci && npm run build && npm test`
- Admin: `cd nmt-analytics-admin && npm ci && npm run lint && npm test && npm run build`
- Browser-verify the affected workflow.

---

## T32 — Dashboard & global search

Master section(s): §28

### Requirements

- Dashboard shows operationally relevant departures, reservations, payments, issues, inquiries, reminders.
- Global search finds passenger, reservation, departure, package, hotel, client.

### Definition of done

- Dashboard surfaces key operational data; global search covers all six entity types.

### Verification

- API: `cd nmt-analytics-api && npm ci && npm run build && npm test`
- Admin: `cd nmt-analytics-admin && npm ci && npm run lint && npm test && npm run build`
- Browser-verify the affected workflow.

---

## T33 — Inquiries / leads

Master section(s): §29

### Requirements

- View, edit, assign, communicate, and convert inquiries into sales/reservations.

### Definition of done

- Inquiries can be viewed/edited/assigned and converted to a reservation.

### Verification

- API: `cd nmt-analytics-api && npm ci && npm run build && npm test`
- Admin: `cd nmt-analytics-admin && npm ci && npm run lint && npm test && npm run build`
- Browser-verify the affected workflow.

---

