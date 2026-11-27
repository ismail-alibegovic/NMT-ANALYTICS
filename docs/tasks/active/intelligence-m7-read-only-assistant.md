# Intelligence M7 — Read-Only Travline AI Assistant

**Status:** DONE  
**Priority:** P1  
**Branch:** `feat/travline-intelligence`  
**Roadmap references:** `docs/TRAVLINE_INTELLIGENCE_ROADMAP.md`

## 1. Goal
Deliver a strictly read-only, tenant-isolated, grounded **Travline AI Assistant** that answers operational, financial (for authorized roles), and workflow questions using verified organization snapshots and the universal AI provider layer from Milestones 5–6.

## 2. Scope (In)
1. **Grounded Context Builder (`src/lib/aiContextBuilder.ts`):**
   - Queries `departures`, active `reservations` (excluding `cancelled`), `inquiries`, and `quotations` strictly scoped to `orgId`.
   - Redacts financial totals for `agent`/`viewer` roles; includes aggregated open-balance/paid totals for `manager`+.
2. **Assistant Endpoint (`POST /api/ai/assistant` in `src/routes/ai.ts`):**
   - Guarded by `authenticateToken`, `requireOrgContext`, `requireMinimumRole('agent')`, `requireModule('ai_assistant')`.
   - Uses `executeOrgAiCompletion(...)` and returns `503 NO_ACTIVE_AI_PROVIDER` cleanly if no provider is configured.
3. **Admin AI Assistant UI (`/ai-assistant`):**
   - Clean, bilingual (BS/EN) Q&A workspace with quick-prompt chips, read-only transparency badge, and provider-setup link.
4. **Tests:**
   - `m7AiAssistant.test.ts` verifying grounding, role redaction, `503 NO_ACTIVE_AI_PROVIDER`, and completion response.

## 3. Acceptance criteria
- [x] `POST /api/ai/assistant` enforces `org_id` isolation, role/module guards, and read-only grounding.
- [x] Admin `/ai-assistant` page and sidebar item work with full BS/EN parity.
- [x] API and Admin tests, lint, `tsc --noEmit`, and production builds pass.
