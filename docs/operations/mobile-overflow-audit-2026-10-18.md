# Mobile overflow findings and scoped fixes

Base: 21ce102733e817638f71d545a96fadd87cd0221d. Branch: fix/audit-mobile-overflow.

Reproduction: authenticated route sweep at head a2c5dfd5b9292ea7e5004eb1d68ab2e68587bf8f, isolated acceptance run 39120837705: 45 scenarios passed, 2 failed. Both failed scans found the same four routes overflowing at 390px in light/dark. At 768/1440 no overflow was reported. Screenshots from artifact 12133959488 inspected.

Root causes: itinerary/quotation grids had an unconstrained implicit mobile track; long card titles established its minimum width. Commission preview controls stayed in one horizontal row. Reservation header actions and tabs exceeded mobile width.

Fix: explicit one-column grid with shrinkable cards, wrapped commission controls, wrapped reservation actions and locally scrolling non-shrinking tabs. No global overflow hiding or visual redesign. New populated browser tests create isolated long-title cards, exercise commission preview and reservation tab switching, capture screenshots and assert no document overflow in both themes at 390/768/1440.

Admin build/lint and isolated browser results recorded in PR after completion. API code and migrations unchanged/not run locally. No production data modified, no demo generation or merge. Other screens and full form workflows remain outside this focused fix; blocked audit routes must not be counted as PASS.

Files: nmt-analytics-admin/src/pages/Itineraries.tsx, Quotations.tsx, operations/CommissionRules.tsx, ReservationDetail.tsx; nmt-analytics-admin/e2e/pilot-mobile-layout.spec.ts; this report; docs/tasks/active/mobile-overflow-audit.md.
