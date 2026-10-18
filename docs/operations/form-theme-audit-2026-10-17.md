# Form, theme and responsive audit — 2026-10-17

Base: `21ce102733e817638f71d545a96fadd87cd0221d`.

This is a coverage ledger, not a completion certificate. Production data is out of scope. Demo generation remains deferred. Component fixtures use synthetic values and do not verify API persistence.

## Baseline

- Admin: 367/368 tests passed. `newSaleWizardStructure.test.tsx` payment-step case failed waiting for “Način plaćanja”; investigate async service loading before assigning a product defect.
- Admin lint: exit 0, 52 existing warnings.
- Admin production build: passed, existing bundle-size warning.
- Local isolated backend: blocked, Docker unavailable.
- Standard Playwright browser download: failed with invalid archive. Separate temporary Chromium installation attempted; no dependency changes to the product.

## Route coverage

Each route needs initial/prepopulated forms, validation, formatting, selections, dates, errors, pending/duplicate submits, persistence/edit/reload, cancel/reset, keyboard and responsive checks. Themes: light + dark. Widths: 390, 768, 1440. BS + EN for changed copy. `NOT TESTED` means no browser PASS is claimed.

| Route | Browser workflow status |
| --- | --- |
| `/` | NOT TESTED |
| `/landing` | NOT TESTED |
| `/welcome` | NOT TESTED |
| `/auth/signin` | NOT TESTED |
| `/auth/signup` | NOT TESTED |
| `/auth/reset-password` | NOT TESTED |
| `/signin` | NOT TESTED |
| `/signup` | NOT TESTED |
| `/reset-password` | NOT TESTED |
| `/waiver/:token` | NOT TESTED |
| `/portal/subagent/:token` | NOT TESTED |
| `/public/forms/:slug` | NOT TESTED |
| `/portal` | NOT TESTED |
| `/portal/packages` | NOT TESTED |
| `/portal/departures` | NOT TESTED |
| `/portal/reservations` | NOT TESTED |
| `/portal/customers` | NOT TESTED |
| `/portal/settings` | NOT TESTED |
| `/home` | NOT TESTED |
| `/sales` | NOT TESTED |
| `/operations` | NOT TESTED |
| `/finance` | NOT TESTED |
| `/dashboard` | NOT TESTED |
| `/customers` | NOT TESTED |
| `/customers/:id` | NOT TESTED |
| `/packages` | NOT TESTED |
| `/packages/:id` | NOT TESTED |
| `/reservations` | NOT TESTED |
| `/reservations/:id` | NOT TESTED |
| `/inquiries` | NOT TESTED |
| `/suppliers` | NOT TESTED |
| `/itineraries` | NOT TESTED |
| `/itineraries/:id` | NOT TESTED |
| `/quotations` | NOT TESTED |
| `/quotations/:id` | NOT TESTED |
| `/departures` | NOT TESTED |
| `/departures/:id` | NOT TESTED |
| `/payments` | NOT TESTED |
| `/reports` | NOT TESTED |
| `/integrations` | NOT TESTED |
| `/settings` | NOT TESTED |
| `/settings/public-forms` | NOT TESTED |
| `/settings/pdf-templates` | NOT TESTED |
| `/admin/audit-logs` | NOT TESTED |
| `/admin/documents` | NOT TESTED |
| `/operations/calendar` | NOT TESTED |
| `/operations/contracts` | NOT TESTED |
| `/operations/receipts` | NOT TESTED |
| `/operations/subagents` | NOT TESTED |
| `/operations/commission-rules` | NOT TESTED |
| `/operations/excursions` | NOT TESTED |
| `/operations/flights` | NOT TESTED |
| `/operations/hotels` | NOT TESTED |
| `/operations/hotels/:id` | NOT TESTED |
| `/operations/availability` | NOT TESTED |
| `/communication` | NOT TESTED |
| `/profile` | NOT TESTED |
| `*` | NOT TESTED |

## Shared components

Modal audit targets: focus entry/containment/restoration, accessible dialog name, close button semantics, nested Escape handling, body scroll ownership, tall-dialog reachability and no page overflow in both themes at all widths.

## Remaining workflow coverage

Every route above also needs an inventory of its tabs, conditional controls, modals/drawers, upload/drop areas, filters, table actions and multi-step states. Route visibility alone is insufficient. Seating and rooming require populated isolated departures; financial edits require synthetic bookings. Mock API responses must never be cited as successful database persistence.

## Confirmed and fixed: shared Modal

Browser reproduction on baseline at 390×844: dialog top = -180.5px, focus remained outside, close button type = submit. All eight accessibility/responsive regression cases failed before the change. After the scoped fix all eight pass on Chromium 153 (temporary local binary), including six theme/width combinations and two nested/localization cases. Mobile light/dark screenshots were also inspected. This is component evidence only, not route-level persistence coverage.

Fix: bounded internally scrolling dialog, accessible dialog role/name, keyboard containment and return focus, localized non-submit close button, topmost Escape handling and shared scroll-lock ownership. Existing BS/EN common translations reused. Three communication-test translation mocks now include the shared close label. A separate CI browser job installs standard Chromium and runs the fixtures without credentials or backend access.

No API code or migrations changed/applied; no production operations. API tests/build not run locally for this frontend-only slice; existing CI remains required. Standard admin tests after the fix: 367/368, with a different New Sale async progression test failing (the baseline failing case passed). A constrained-worker run is recorded separately below; do not hide intermittent default-run failures.

Admin build passed; lint exited 0 (52 existing warnings plus a fixture export warning subsequently corrected).
