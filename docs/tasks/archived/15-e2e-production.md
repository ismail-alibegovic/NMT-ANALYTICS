# Phase 15 — E2E / production hardening

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

## T37 — Golden E2E dataset

Master section(s): §35, §36

### Requirements

- Dataset: Antalya (Flight), Istanbul (Flight), Dubai (Flight), Budva (Bus), Mostar (Bus) — with hotels, room options, allotments, reservations, passengers, groups, payments, flights, bus, rooming.
- Seed is deterministic, repeatable, idempotent, tenant-safe, ownership marker `travline_golden_demo_2027`; resets only its own data; requires explicit target org.

### Definition of done

- Golden seed creates the full E2E dataset idempotently for an explicit org.

### Verification

- API: `cd nmt-analytics-api && npm ci && npm run build && npm test`
- Admin: `cd nmt-analytics-admin && npm ci && npm run lint && npm test && npm run build`
- Browser-verify the affected workflow.

---

## T38 — Agency demo accounts + onboarding

Master section(s): §37, §38

### Requirements

- Separate from golden data: empty, clean, onboarding-ready tenants.
- An agency without a developer can create: package, hotel, departure, reservation, passengers, accommodation, group, payment, rooming, seat map, documents.

### Definition of done

- A fresh org can complete the full onboarding flow end-to-end without a developer.

### Verification

- API: `cd nmt-analytics-api && npm ci && npm run build && npm test`
- Admin: `cd nmt-analytics-admin && npm ci && npm run lint && npm test && npm run build`
- Browser-verify the affected workflow.

---

