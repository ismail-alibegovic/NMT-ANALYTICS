# Phase 14 — Polish

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

## T34 — i18n parity

Master section(s): §32

### Requirements

- Full Bosnian/English, no mixed languages, canonical i18n + parity testing.

### Definition of done

- All user-facing copy exists in BS and EN with no mixed-language screens.

### Verification

- API: `cd nmt-analytics-api && npm ci && npm run build && npm test`
- Admin: `cd nmt-analytics-admin && npm ci && npm run lint && npm test && npm run build`
- Browser-verify the affected workflow.

---

## T35 — UI polish

Master section(s): §33

### Requirements

- Clean, modern, professional, minimalist production UI; clear hierarchy, spacing, typography; no generic AI-admin look.

### Definition of done

- Target screens match the established Travline visual language.

### Verification

- API: `cd nmt-analytics-api && npm ci && npm run build && npm test`
- Admin: `cd nmt-analytics-admin && npm ci && npm run lint && npm test && npm run build`
- Browser-verify the affected workflow.

---

## T36 — Integrations foundation

Master section(s): §34

### Requirements

- Future: hotels, flights, tours, suppliers, GDS, flight aggregators, hotel wholesalers, bed banks, DMC.
- Mock integrations must not look like live integrations.

### Definition of done

- Integration boundaries defined; mocks clearly marked as mocks.

### Verification

- API: `cd nmt-analytics-api && npm ci && npm run build && npm test`
- Admin: `cd nmt-analytics-admin && npm ci && npm run lint && npm test && npm run build`
- Browser-verify the affected workflow.

---

