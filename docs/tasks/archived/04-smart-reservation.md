# Phase 4 — Smart Reservation flow (§10 core)

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

## T08 — Reservation / New Sale CRUD

Master section(s): §9

### Requirements

- Reservation supports: client, one or more passengers, package/departure, accommodation, extra services, payments, groups, notes, source, user assignment.
- Client and passenger are not necessarily the same person.

### Definition of done

- Reservation CRUD + save works with the full field set, tenant-scoped.

### Verification

- API: `cd nmt-analytics-api && npm ci && npm run build && npm test`
- Admin: `cd nmt-analytics-admin && npm ci && npm run lint && npm test && npm run build`
- Browser-verify the affected workflow.

---

## T09 — Progressive disclosure

Master section(s): §10.1

### Requirements

- Form shows fields relevant to the selected package/departure first.
- Unknown data can be deferred via 'Fill in later', but is marked missing/incomplete and can be completed before the operational deadline.

### Definition of done

- New Sale hides irrelevant fields and clearly marks incomplete-but-deferred fields.

### Verification

- API: `cd nmt-analytics-api && npm ci && npm run build && npm test`
- Admin: `cd nmt-analytics-admin && npm ci && npm run lint && npm test && npm run build`
- Browser-verify the affected workflow.

---

## T10 — Flight package — travel documents

Master section(s): §10.2

### Requirements

- If package uses flight, immediately offer passenger travel-document fields: passport number, expiry, issuing authority/country, DOB, nationality + Flight Ops fields.
- If passport unavailable, reservation can still be saved; Travline marks travel-document data as missing and allows later fill-in.

### Definition of done

- Flight departures surface travel-document fields; missing passport data is flagged but doesn't block saving.

### Verification

- API: `cd nmt-analytics-api && npm ci && npm run build && npm test`
- Admin: `cd nmt-analytics-admin && npm ci && npm run lint && npm test && npm run build`
- Browser-verify the affected workflow.

---

## T11 — Bus international — travel documents

Master section(s): §10.3

### Requirements

- Do NOT use the wrong rule 'bus = no passport needed'.
- Package/departure has structured travel requirement: domestic/international + required travel document.
- International bus departures show passport/travel-document fields; domestic bus departures don't clutter the base form.
- Transport may set a reasonable default, but final logic comes from package/departure travel requirements.

### Definition of done

- Travel-document fields are driven by package travel requirements (domestic/international), not a naive transport-type rule.

### Verification

- API: `cd nmt-analytics-api && npm ci && npm run build && npm test`
- Admin: `cd nmt-analytics-admin && npm ci && npm run lint && npm test && npm run build`
- Browser-verify the affected workflow.

---

## T12 — Package-driven accommodation selection

Master section(s): §10.4

### Requirements

- If package has accommodation, New Sale shows ONLY hotels + room types actually assigned to that package/departure, with real availability.
- UI shows hotel, stars, room type, price, availability.
- Selection creates the canonical reservation accommodation requirement + passenger mapping.
- Never offer unrelated hotels or generic hardcoded options.

### Definition of done

- New Sale lists only the package's real hotels/room types with availability; selection produces accommodation requirements.

### Verification

- API: `cd nmt-analytics-api && npm ci && npm run build && npm test`
- Admin: `cd nmt-analytics-admin && npm ci && npm run lint && npm test && npm run build`
- Browser-verify the affected workflow.

---

## T13 — Optional services

Master section(s): §10.5

### Requirements

- If package has optional services (excursion, transfer, insurance, baggage, meal…), offer them during New Sale.
- Never offer services from other packages.

### Definition of done

- Only the package's optional services are offered and added to the reservation.

### Verification

- API: `cd nmt-analytics-api && npm ci && npm run build && npm test`
- Admin: `cd nmt-analytics-admin && npm ci && npm run lint && npm test && npm run build`
- Browser-verify the affected workflow.

---

## T14 — Reservation accommodation requirements

Master section(s): §7, §11

### Requirements

- Canonical chain: Hotel catalog → Package accommodation template → Departure accommodation allotment → Reservation accommodation requirement → Passenger mapping → Operational room slots → Rooming.
- Building/Floor/Room is not a required prerequisite; real hotel room number is optional.
- Reservation supports multiple requirement lines (e.g. 1×Double + 2×Single); same allocation is NOT duplicated across lines — use `roomCount`.
- Each line knows room count, guest count, price, and passenger mapping.

### Definition of done

- Reservation persists multiple accommodation requirement lines with `roomCount` (no duplicate allocation).

### Verification

- API: `cd nmt-analytics-api && npm ci && npm run build && npm test`
- Admin: `cd nmt-analytics-admin && npm ci && npm run lint && npm test && npm run build`
- Browser-verify the affected workflow.

---

## T15 — Edit reservation — atomic inventory

Master section(s): §12

### Requirements

- Existing requirements and passenger mappings load on edit.
- Changing accommodation atomically releases old inventory and reserves new, with overbooking protection.

### Definition of done

- Editing accommodation atomically swaps inventory without overbooking.

### Verification

- API: `cd nmt-analytics-api && npm ci && npm run build && npm test`
- Admin: `cd nmt-analytics-admin && npm ci && npm run lint && npm test && npm run build`
- Browser-verify the affected workflow.

---

