# Phase 8 — Seating

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

## T24 — Bus / vehicle

Master section(s): §16

### Requirements

- Bus departure has capacity, seat map, assignments, groups, manual/automatic seating.
- Long-term: reusable vehicle resource model; seat categories/pricing where needed.

### Definition of done

- Bus departures have capacity + seat map with manual/auto assignment.

### Verification

- API: `cd nmt-analytics-api && npm ci && npm run build && npm test`
- Admin: `cd nmt-analytics-admin && npm ci && npm run lint && npm test && npm run build`
- Browser-verify the affected workflow.

---

## T25 — Automatic bus seating

Master section(s): §15

### Requirements

- Rule: **groups first → everybody else second**. Groups seated together or as close as possible; then solo/unassigned.
- Locked/manual seats are never overwritten. Split groups are clearly flagged.
- Flight departures do NOT use bus seating.

### Definition of done

- Auto-seating places groups first, preserves locked seats, flags split groups, and is skipped for flights.

### Verification

- API: `cd nmt-analytics-api && npm ci && npm run build && npm test`
- Admin: `cd nmt-analytics-admin && npm ci && npm run lint && npm test && npm run build`
- Browser-verify the affected workflow.

---

