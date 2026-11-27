# Intelligence M9 — AI Drafts & Controlled Human-Approved Actions

**Status:** DONE  
**Priority:** P1  
**Branch:** `feat/travline-intelligence`  
**Roadmap references:** `docs/TRAVLINE_INTELLIGENCE_ROADMAP.md`

## 1. Goal
Implement structured, editable, human-approved AI action proposals (`create_inquiry`, `create_quotation_draft`, `create_customer_draft`) with explicit confirmation, idempotency, RBAC/tenant checks, and audit logging.

## 2. Acceptance criteria
- [x] Additive migration `20261125140000_ai_action_proposals.sql` with RLS and `(org_id, idempotency_key)` uniqueness.
- [x] `POST /api/ai/proposals` creates a draft proposal without mutating business tables.
- [x] `POST /api/ai/proposals/:id/confirm` validates edited payload, enforces idempotency, executes the business insert, and writes audit logs.
- [x] `POST /api/ai/proposals/:id/reject` rejects a draft cleanly.
- [x] Admin `/ai-assistant` UI supports generating, editing, confirming, and rejecting proposals in BS and EN.
- [x] API and Admin tests, lint, `tsc --noEmit`, and production builds pass.
