# Intelligence M8 — Intelligent Dashboard & Executive Signals

**Status:** DONE  
**Priority:** P1  
**Branch:** `feat/travline-intelligence`  
**Roadmap references:** `docs/TRAVLINE_INTELLIGENCE_ROADMAP.md`

## 1. Goal
Deliver deterministic, actionable executive & operational signals on the Travline Dashboard (`GET /api/ai/signals` + `ExecutiveSignalsCard`) so managers and directors immediately see upcoming low-occupancy departures, open reservation balances, and stale inquiries without needing manual report hunting.

## 2. Acceptance criteria
- [x] `GET /api/ai/signals` enforces `requireMinimumRole('manager')` and `requireModule('analytics')` and strict `org_id` isolation.
- [x] Signals are computed deterministically (no LLM dependency, zero 503/402 noise).
- [x] `ExecutiveSignalsCard` renders on `Dashboard/Home.tsx` with full BS/EN parity and direct links to `/departures`, `/payments`, `/inquiries`, and `/ai-assistant`.
- [x] API and Admin tests, lint, `tsc --noEmit`, and production builds pass.
