# M12.1 — Read-only automatic bus seating proposal

**Status:** ACTIVE
**Priority:** P1
**Branch:** `feature/m12-auto-seating-proposal`
**Roadmap references:** `docs/ROADMAP.md` — M12 (Automatic bus seating + keep-groups-together)

## 1. Goal

Add a deterministic, read-only automatic BUS seating proposal endpoint. Generating a proposal must never modify current passenger seat assignments. Reviewers can inspect preserved (manual/locked) assignments, proposed assignments, unresolved passengers, and group split warnings before any future apply step exists.

## 2. Current problem

Legacy `/seats/auto-assign` and `/seats/clear-all` are gated (AUTO_SEATING_NOT_AVAILABLE) under the new M11 manual seating model. There is no group-aware, geometry-aware, read-only proposal for BUS departures.

## 3. Required discovery before editing

- `src/routes/seats.ts` (legacy gated endpoints)
- `src/services/roomingProposal.ts` + `src/services/roomingStateLoader.ts` (pattern to mirror)
- `src/routes/rooming.ts` (proposal endpoint conventions)
- `src/routes/departures.ts` vehicle endpoints
- Migrations: `20260904000000_bus_vehicle_seating_foundation.sql`, `20260822020000_passenger_groups.sql`

## 4. In scope

- `POST /departures/:departureId/seating/proposal` (read-only)
- Pure deterministic proposal service using real ACTIVE physical seats from `departure_vehicle_seats`
- Order: preserved manual/locked → groups (seating_preference) → remaining travelers
- Explicit split-group warnings; unresolved passengers on insufficient/capacity
- Response includes departure identity, vehicle identity, preserved assignments, proposed assignments, unresolved, warnings, state fingerprint

## 5. Out of scope

- Apply endpoint, any DB writes, UI, clear-all, flight seating, M13+

## 6. Domain rules

- BUS departures only (`transport_type = 'bus'`); reject others
- Missing vehicle → reject safely
- `seat_locked = true` OR `seat_is_manual = true` → seat preserved, unavailable to automation, never moved
- Only `is_active = true` seats are allocatable; never assign inactive seats
- Groups processed before solo travelers; preferences: `keep_together` (must try adjacency, split only as last resort with warning), `prefer_together` (best-effort adjacency), `no_preference` (no adjacency bias)
- Same seat never proposed twice; no cross-org access

## 7. API requirements

- `authenticateToken`, `requireOrgContext`, `requireMinimumRole('manager')`
- Org-scoped reads on all tables
- 404 unknown departure, 400 NOT_BUS_DEPARTURE / NO_VEHICLE / INVALID_SEAT_STATE
- Response mirrors rooming proposal conventions (stateFingerprint, summary, fixed/preserved assignments, proposed, unresolved, warnings)

## 8. Database / migration requirements

No migration needed. All required schema exists from M11.1.

## 9. Frontend / UX requirements

None (no admin UI in this task).

## 10. Tenant and security acceptance

- Org A cannot read org B departures/vehicles/seats/groups through the endpoint
- All queries scoped by `org_id` from authenticated context

## 11. Acceptance criteria

- [ ] Proposal performs zero seat writes
- [ ] Manual and locked assignments preserved verbatim
- [ ] Groups processed before solo travelers
- [ ] keep_together tries adjacency, closest-possible fallback deterministic
- [ ] Split-group warning returned when a group cannot be placed adjacently
- [ ] Inactive seats ignored
- [ ] Insufficient seats → unresolved passengers, not an error
- [ ] Same state → identical proposal (determinism)
- [ ] Non-BUS departure rejected
- [ ] No duplicate proposed seats

## 12. Required tests

Focused M12.1 API tests covering every acceptance criterion; full API suite green.

## 13. Required verification commands

```bash
cd nmt-analytics-api
npm run build
npm test
```

Admin not affected (no admin changes).

## 14. Completion report

Per AGENTS.md contract.

## 15. Completion record

- **PR:**
- **Merge commit:**
- **Accepted date:**
- **Notes:**
