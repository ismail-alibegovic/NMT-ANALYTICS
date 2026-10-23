# Final BS/EN audit inventory

Inspected against `f6256cb` on 2026-10-24. This is a discovery checklist, not a completion claim. Recheck locations after each focused PR.

The dictionaries contain 2,786 leaf values each; the inspection found no empty strings or interpolation-token mismatches. Existing key parity does not detect untranslated JSX, mixed-language ternaries, backend error text, user data, or locale inconsistencies. Forty-nine identical values longer than five characters include legitimate shared words, brands and technical identifiers; review these in context rather than mechanically translating all identical text.

A TypeScript AST scan found **660 candidate JSX literals across 67 files** outside tests, translation dictionaries and icons. Candidates include proper names/technical labels and are not all confirmed defects. Counts include JSX text and literal placeholder/title/aria-label/alt attributes and string expressions; the scan does **not** capture all object labels, toasts, validation messages, template literals or API/PDF/export copy. Those require domain inspection. Each row below remains OPEN until manually classified and verified in BS/EN.

The first completed slice is Reports monetary formatting; see `docs/TRAVLINE_FINAL_ROADMAP.md` for validation and PR status. Preserve existing visual design, domain identifiers and customer-entered content.

| Admin source file | Candidate count | First candidate lines |
| --- | ---: | --- |
| `src/components/reservations/NewSaleWizard.tsx` | 99 | 824, 853, 859, 860, 884 |
| `src/pages/ReservationDetail.tsx` | 54 | 228, 234, 236, 350, 357 |
| `src/pages/admin/Settings.tsx` | 37 | 526, 528, 540, 554, 555 |
| `src/pages/admin/UnifiedPayments.tsx` | 34 | 262, 265, 266, 271, 272 |
| `src/components/reservations/EditReservationModal.tsx` | 33 | 313, 323, 327, 334, 336 |
| `src/pages/operations/Excursions.tsx` | 32 | 115, 116, 120, 141, 142 |
| `src/pages/admin/Integrations.tsx` | 29 | 107, 110, 120, 124, 135 |
| `src/pages/Reservations.tsx` | 23 | 345, 400, 402, 418, 420 |
| `src/pages/operations/CommissionRules.tsx` | 23 | 169, 170, 176, 177, 193 |
| `src/components/reservations/CreateReservationModal.tsx` | 21 | 143, 147, 151, 180, 186 |
| `src/pages/admin/AuditLogs.tsx` | 21 | 157, 174, 179, 181, 194 |
| `src/pages/admin/Departures.tsx` | 17 | 232, 294, 303, 325, 328 |
| `src/pages/operations/Receipts.tsx` | 15 | 105, 106, 107, 131, 174 |
| `src/pages/CustomerDetail.tsx` | 14 | 108, 119, 137, 159, 163 |
| `src/pages/admin/PdfTemplateEditor.tsx` | 14 | 223, 231, 243, 265, 287 |
| `src/components/departures/DepartureFormModal.tsx` | 13 | 103, 114, 118, 124, 128 |
| `src/components/ui/ImportModal.tsx` | 13 | 132, 157, 165, 179, 194 |
| `src/pages/DepartureDetail.tsx` | 11 | 964, 1171, 1368, 1463, 1474 |
| `src/pages/Profile.tsx` | 11 | 98, 120, 123, 131, 134 |
| `src/pages/operations/Hotels.tsx` | 11 | 172, 173, 181, 182, 183 |
| `src/components/operations/SeatMap.tsx` | 9 | 121, 160, 163, 173, 210 |
| `src/pages/operations/Contracts.tsx` | 8 | 110, 111, 112, 142, 201 |
| `src/components/common/ErrorBoundary.tsx` | 7 | 97, 100, 112, 118, 124 |
| `src/components/ui/DataTable.tsx` | 7 | 27, 32, 114, 178, 178 |
| `src/pages/admin/Documents.tsx` | 7 | 256, 260, 302, 303, 309 |
| `src/pages/operations/SubAgents.tsx` | 7 | 131, 132, 138, 141, 175 |
| `src/components/integrations/ConfigureIntegrationModal.tsx` | 6 | 66, 71, 73, 77, 88 |
| `src/pages/OtherPage/NotFound.tsx` | 6 | 9, 16, 27, 34, 39 |
| `src/components/common/DateRangeFilter.tsx` | 5 | 33, 51, 58, 59, 60 |
| `src/pages/admin/Customers.tsx` | 5 | 216, 220, 270, 281, 284 |
| `src/layout/AppSidebar.tsx` | 4 | 192, 197, 226, 231 |
| `src/pages/Hub/HomeHub.tsx` | 4 | 194, 608, 726, 907 |
| `src/pages/Suppliers.tsx` | 4 | 187, 190, 205, 208 |
| `src/pages/portal/PortalSettings.tsx` | 4 | 82, 104, 130, 202 |
| `src/components/common/ChartTab.tsx` | 3 | 21, 30, 39 |
| `src/components/header/Header.tsx` | 3 | 85, 90, 136 |
| `src/components/landing/previews.tsx` | 3 | 173, 180, 310 |
| `src/components/ui/images/ThreeColumnImageGrid.tsx` | 3 | 7, 15, 23 |
| `src/layout/AppHeader.tsx` | 3 | 62, 102, 106 |
| `src/pages/admin/Packages.tsx` | 3 | 200, 219, 243 |
| `src/pages/operations/Calendar.tsx` | 3 | 119, 123, 127 |
| `src/components/common/GlobalSearch.tsx` | 2 | 328, 393 |
| `src/components/common/GridShape.tsx` | 2 | 5, 8 |
| `src/components/packages/PackageEditorModal.tsx` | 2 | 740, 1059 |
| `src/components/ui/images/TwoColumnImageGrid.tsx` | 2 | 7, 15 |
| `src/pages/PublicSubAgentPortal.tsx` | 2 | 115, 128 |
| `src/components/auth/AuthGuard.tsx` | 1 | 98 |
| `src/components/auth/SignInForm.tsx` | 1 | 230 |
| `src/components/charts/AnalyticsChart.tsx` | 1 | 169 |
| `src/components/charts/DonutChart.tsx` | 1 | 101 |
| `src/components/common/PageBreadCrumb.tsx` | 1 | 23 |
| `src/components/landing/LandingFooter.tsx` | 1 | 22 |
| `src/components/landing/LandingNav.tsx` | 1 | 49 |
| `src/components/ui/ActionsMenu.tsx` | 1 | 40 |
| `src/components/ui/images/ResponsiveImage.tsx` | 1 | 7 |
| `src/components/ui/videos/FourIsToThree.tsx` | 1 | 6 |
| `src/components/ui/videos/OneIsToOne.tsx` | 1 | 6 |
| `src/components/ui/videos/SixteenIsToNine.tsx` | 1 | 6 |
| `src/components/ui/videos/TwentyOneIsToNine.tsx` | 1 | 6 |
| `src/layout/PortalLayout.tsx` | 1 | 138 |
| `src/pages/AuthPages/AuthPageLayout.tsx` | 1 | 25 |
| `src/pages/Dashboard/Home.tsx` | 1 | 166 |
| `src/pages/Hub/SalesScope.tsx` | 1 | 145 |
| `src/pages/Inquiries.tsx` | 1 | 116 |
| `src/pages/PackageDetail.tsx` | 1 | 314 |
| `src/pages/admin/PublicForms.tsx` | 1 | 756 |
| `src/pages/portal/PortalPackages.tsx` | 1 | 72 |

## Confirmed gaps and ordered domain review

- `src/pages/CustomerDetail.tsx`: hardcoded Bosnian columns, English summary labels, bs-BA-only local currency/date helpers, and raw status/timeline presentation. Translate with existing dictionaries and add loading/error/success/browser tests before calling it complete.
- `src/components/reservations/NewSaleWizard.tsx`, `EditReservationModal.tsx`, `CreateReservationModal.tsx`, `src/pages/ReservationDetail.tsx` and `Reservations.tsx`: highest-priority sales review; candidates need classification alongside conditional accommodation/payment/traveler paths and recovery errors. Do not alter capacity, money, canonical statuses or retry behavior while translating.
- `src/pages/admin/{Settings,UnifiedPayments,Integrations,AuditLogs,Departures,PdfTemplateEditor}.tsx`: audit nested forms, provider-disabled states, messages, accessible labels, date/currency formatting and destructive-action warnings.
- `src/pages/operations/{Excursions,CommissionRules,Receipts,Hotels}.tsx`: translate one existing module per focused PR with role/empty/error/success coverage.
- `src/lib/i18n/context.tsx` and `src/layout/AppHeader.tsx`: verify language persistence, document language, storage failures, accessible language control, auth/public transitions and date/number updates. Existing persistence is implemented; a rewrite is not justified without defects.

## Locale audit

| Admin source file | Explicit formatter / locale occurrences |
| --- | ---: |
| `src/api/reservations.ts` | 4 |
| `src/components/analytics/RevenueChart.tsx` | 5 |
| `src/components/charts/AnalyticsChart.tsx` | 4 |
| `src/components/charts/DonutChart.tsx` | 3 |
| `src/components/common/GlobalSearch.tsx` | 2 |
| `src/components/communications/CampaignEditorModal.tsx` | 3 |
| `src/components/communications/CampaignsTab.tsx` | 4 |
| `src/components/communications/CommunicationHistoryPanel.tsx` | 3 |
| `src/components/communications/SendMessage.tsx` | 3 |
| `src/components/departures/DepartureAccommodationAllotment.tsx` | 2 |
| `src/components/departures/SupplierPayablesPanel.tsx` | 3 |
| `src/components/finance/SupplierPayablesOverview.tsx` | 6 |
| `src/components/quotations/QuotationBookingPanel.tsx` | 1 |
| `src/components/reservations/CreateReservationModal.tsx` | 2 |
| `src/components/reservations/EditReservationModal.tsx` | 2 |
| `src/components/reservations/NewSaleWizard.tsx` | 12 |
| `src/pages/CustomerDetail.tsx` | 4 |
| `src/pages/Dashboard/Home.tsx` | 1 |
| `src/pages/DepartureDetail.tsx` | 7 |
| `src/pages/HotelDetail.tsx` | 4 |
| `src/pages/Hub/HomeHub.tsx` | 11 |
| `src/pages/Inquiries.tsx` | 4 |
| `src/pages/ItineraryDetail.tsx` | 2 |
| `src/pages/PackageDetail.tsx` | 4 |
| `src/pages/PublicFormRenderer.tsx` | 12 |
| `src/pages/PublicSignWaiver.tsx` | 3 |
| `src/pages/PublicSubAgentPortal.tsx` | 4 |
| `src/pages/QuotationDetail.tsx` | 7 |
| `src/pages/Quotations.tsx` | 4 |
| `src/pages/Reports.tsx` | 2 |
| `src/pages/Suppliers.tsx` | 2 |
| `src/pages/admin/Integrations.tsx` | 2 |
| `src/pages/admin/Packages.tsx` | 1 |
| `src/pages/admin/PublicForms.tsx` | 9 |
| `src/pages/admin/UnifiedPayments.tsx` | 4 |
| `src/pages/admin/Waivers.tsx` | 3 |
| `src/pages/operations/Availability.tsx` | 1 |
| `src/pages/operations/Calendar.tsx` | 2 |
| `src/pages/operations/Excursions.tsx` | 4 |
| `src/pages/operations/Flights.tsx` | 4 |
| `src/pages/operations/Hotels.tsx` | 1 |
| `src/pages/operations/SubAgents.tsx` | 1 |
| `src/utils/business.ts` | 4 |

Occurrence counts may include both a call and its explicit locale; they are review pointers, not defect counts. Ensure calendar-day strings remain calendar days across timezones, user-selected currency is preserved, export/PDF locale contracts are explicit and display formatting never changes stored numeric values. Reports uses bs-BA/en-GB; unrelated callers retain their existing defaults until their domain slice is verified.

## Release evidence required

For each domain: identify reachable screens/roles; classify all candidates; add BS/EN keys without changing stable identifiers; test validation/toasts/errors/empty/loading/success states; verify immediate switching plus reload; check mobile/tablet/desktop and both themes; record unit/browser commands and PR/merge evidence in the final roadmap. Backend messages, PDF and CSV text need an explicit localization contract instead of translating stable API error codes. No production seed/reset is required for translation work.
