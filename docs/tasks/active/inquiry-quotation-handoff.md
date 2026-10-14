# M19.1 — Preserve inquiry context and create version-pinned quotations
**Status:** ACTIVE
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
