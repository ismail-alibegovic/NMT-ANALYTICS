# Phase 7 — Rooming

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

## T19 — Operational room slots

Master section(s): §19

### Requirements

- Allotment generates slots like Double 01…Double 16.
- Slot has room type, capacity, allocation, assignments. Real hotel room number is optional.

### Definition of done

- Allotment generates per-room-type operational slots.

### Verification

- API: `cd nmt-analytics-api && npm ci && npm run build && npm test`
- Admin: `cd nmt-analytics-admin && npm ci && npm run lint && npm test && npm run build`
- Browser-verify the affected workflow.

---

## T20 — Manual rooming

Master section(s): §18

### Requirements

- Reservation accommodation determines how many / what rooms are needed; rooming determines who sleeps with whom in a concrete operational room slot.

### Definition of done

- Manual rooming assigns passengers to operational room slots.

### Verification

- API: `cd nmt-analytics-api && npm ci && npm run build && npm test`
- Admin: `cd nmt-analytics-admin && npm ci && npm run lint && npm test && npm run build`
- Browser-verify the affected workflow.

---

## T21 — Rooming validations

Master section(s): §20

### Requirements

- Block: wrong room type, over-capacity, cross-departure, cross-org, assignment incompatible with the reservation accommodation requirement.

### Definition of done

- All five invalid rooming cases are blocked.

### Verification

- API: `cd nmt-analytics-api && npm ci && npm run build && npm test`
- Admin: `cd nmt-analytics-admin && npm ci && npm run lint && npm test && npm run build`
- Browser-verify the affected workflow.

---

## T22 — Automatic rooming

Master section(s): §21

### Requirements

- Respect requirements, manual/locked assignments, groups, capacity.
- Proposal is reviewable before applying; uses operational room slots.

### Definition of done

- Auto-rooming produces a reviewable proposal that respects requirements/groups/capacity.

### Verification

- API: `cd nmt-analytics-api && npm ci && npm run build && npm test`
- Admin: `cd nmt-analytics-admin && npm ci && npm run lint && npm test && npm run build`
- Browser-verify the affected workflow.

---

## T23 — Final rooming list

Master section(s): §22

### Requirements

- Supplier-ready PDF and Excel with hotel, room types, passengers, optional real room numbers.

### Definition of done

- Final rooming list exports to PDF + Excel.

### Verification

- API: `cd nmt-analytics-api && npm ci && npm run build && npm test`
- Admin: `cd nmt-analytics-admin && npm ci && npm run lint && npm test && npm run build`
- Browser-verify the affected workflow.

---

