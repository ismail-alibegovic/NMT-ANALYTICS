# Final I18N-04C — Reservation Detail BS/EN display

Status: ACTIVE. Branch: `fix/i18n-reservation-detail`, fresh origin/main `8cf3f1a`; New Sale PR #155 is separate and pending CI.

Translate the existing ReservationDetail page, five tabs, readiness/status labels, financial summaries, sold-service display and contract-generation dialog. Display money and calendar dates according to the selected language; preserve persisted snapshot text, source currencies, numeric financial calculations and service/provider/customer data. Language changes must retain selected tab and avoid reloading data.

Preserve existing manager financial-write restrictions, recovery gating, reservation-filtered manifest, canonical accommodation endpoint, top-level sold snapshot versus nested catalogue distinction, payment/contract payloads and navigation. EditReservationModal is a separate remaining task; do not change it here. Existing child communication/payment components retain their existing translations. No API, schema, auth/RLS, seed or runtime changes.

Add regressions first for English display/live switching, localized dates/money/statuses, all tabs and contract actions; retain all existing business regression assertions and explicitly choose their language. Run admin lint/tests/build, actual page browser tests in BS/EN/mobile/desktop/light/dark, relevant API baseline and required exact-head CI before merge.

Inspection also found existing swallowed manifest/accommodation/schedule read errors; record as Phase 2 workflow audit items rather than silently certify them as verified empty data. Do not broaden this translation change into a data-loading redesign.

Implementation/local validation complete: API build/1,009 tests; admin lint (0 errors/51 existing warnings), 521 tests/build; 37 focused tests and 19 combined locale browser scenarios, including eight Reservation Detail cases. Exact files/evidence/deferred findings are in the final roadmap. Pending PR and required exact-head CI/merge; Phase 1 remains open.
