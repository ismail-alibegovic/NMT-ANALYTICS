# M19.1 — Preserve inquiry context and create version-pinned quotations
**Status:** COMPLETED
**Priority:** P1
**Branch:** fix/inquiry-quotation-handoff
**Roadmap references:** M19 Inquiry → quote → booking
**Authority:** User requested sequential completion of Travline.

## Goal and observed defects
Inquiry links are consumed before inquiry data arrives, leaving an empty itinerary. Quotation selection uses version data absent from list responses, producing an empty version ID. Itinerary workspace has no quotation action. Quote validity input submits a date while API accepts only datetime.

## Scope
Resolve linked inquiry through existing org-scoped detail API before opening creation form; preserve contact-derived title, dates, trip type, travelers and currency. Lookup errors visibly block the handoff and allow retry rather than silently creating standalone records.
Resolve quotation source through detail API, pin valid explicit/current version and inherit currency; prevent stale async selection overwrites and incomplete source submission. Add localized itinerary-to-quotation action. Accept ISO calendar date or datetime for quote validity.
No database changes or new business mutation paths. Keep existing API authorization/capabilities. Fixed New Sale unchanged.

## Deferred
Accepted quotation booking conversion, quote creation transaction/error cleanup, currency validation across mixed line items, immutable accepted quote edits and broad UI redesign remain separate scoped work.

## Discovery
Read AGENTS, product, architecture, roadmap, M19, relevant APIs/pages, translations and snapshot tests. Existing quote creation already validates org/version ownership and copies item snapshots. Reuse it; do not build duplicate quotation CRUD.

## Acceptance and verification
Source lookup latency does not drop inquiry context; failed/missing sources cannot silently become standalone. Both list selection and deep link resolve a real version. Stale responses cannot overwrite latest selection. Browser verifies inquiry → itinerary → priced quotation in BS desktop and EN mobile, preserved snapshot after source edit, and cross-tenant denial. Targeted component/validation tests, full API/admin build/tests/lint, CI migration/Docker, isolated acceptance and Preview before merge.

Completion: PR #83 merged as fc4c336f40297dac5709f5b7223d4d2c05ccb9cb. Final head e1e90ebd4d2413a8eeb15b1f06f7fc0d1b39d470. CI38653165160 passed API668/admin297 tests, builds, lint, migration/Docker. Isolated acceptance38653165143 passed19 tests, none skipped, including BS desktop/EN mobile inquiry-to-itinerary-to-quotation, prices preserved after source edits, tenant denial and supplier readiness. Preview dpl_F8JbsgyBtt9SQMb22ZVZwAXXqNRu READY/health200, database connected/auth bypass disabled. No migration. Exact files and deferred scope recorded in PR83.
