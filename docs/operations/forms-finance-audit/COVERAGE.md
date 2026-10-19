# Form coverage ledger — audit OPEN

Source: main `21ce102733e817638f71d545a96fadd87cd0221d` plus this scoped branch. Counts describe source surfaces, not completed business workflows. A PASS below is limited to its stated layer. Real authenticated results will be recorded in the PR after disposable CI.

| Source surface | Status in this audit | Scope / remaining work |
|---|---|---|
| `nmt-analytics-admin/src/components/auth/ResetPasswordForm.tsx` | NOT TESTED | This audit, not prior PR evidence |
| `nmt-analytics-admin/src/components/auth/SignInForm.tsx` | NOT TESTED | This audit, not prior PR evidence |
| `nmt-analytics-admin/src/components/auth/SignUpForm.tsx` | NOT TESTED | This audit, not prior PR evidence |
| `nmt-analytics-admin/src/components/common/DateRangeFilter.tsx` | NOT TESTED | This audit, not prior PR evidence |
| `nmt-analytics-admin/src/components/common/GlobalSearch.tsx` | NOT TESTED | This audit, not prior PR evidence |
| `nmt-analytics-admin/src/components/common/QuickCreateModal.tsx` | NOT TESTED | This audit, not prior PR evidence |
| `nmt-analytics-admin/src/components/communications/AutomationEditorModal.tsx` | NOT TESTED | This audit, not prior PR evidence |
| `nmt-analytics-admin/src/components/communications/AutomationTab.tsx` | NOT TESTED | This audit, not prior PR evidence |
| `nmt-analytics-admin/src/components/communications/CampaignEditorModal.tsx` | NOT TESTED | This audit, not prior PR evidence |
| `nmt-analytics-admin/src/components/communications/CampaignsTab.tsx` | NOT TESTED | This audit, not prior PR evidence |
| `nmt-analytics-admin/src/components/communications/CommunicationHistoryPanel.tsx` | NOT TESTED | This audit, not prior PR evidence |
| `nmt-analytics-admin/src/components/communications/ManualMessageComposer.tsx` | NOT TESTED | This audit, not prior PR evidence |
| `nmt-analytics-admin/src/components/communications/SendMessage.tsx` | NOT TESTED | This audit, not prior PR evidence |
| `nmt-analytics-admin/src/components/communications/TemplateEditorModal.tsx` | NOT TESTED | This audit, not prior PR evidence |
| `nmt-analytics-admin/src/components/communications/TemplatesTab.tsx` | NOT TESTED | This audit, not prior PR evidence |
| `nmt-analytics-admin/src/components/departures/DepartureAccommodationAllotment.tsx` | NOT TESTED | This audit, not prior PR evidence |
| `nmt-analytics-admin/src/components/departures/DepartureFormModal.tsx` | NOT TESTED | This audit, not prior PR evidence |
| `nmt-analytics-admin/src/components/departures/SupplierPayablesPanel.tsx` | NOT TESTED | Expense/payable regressions implemented; real browser matrix awaits isolated run. Other departure forms NOT TESTED. |
| `nmt-analytics-admin/src/components/finance/SupplierPayablesOverview.tsx` | NOT TESTED | This audit, not prior PR evidence |
| `nmt-analytics-admin/src/components/form/Form.tsx` | N/A — no source consumers | Unmounted legacy component; no business workflow is certified |
| `nmt-analytics-admin/src/components/form/Select.tsx` | NOT TESTED | This audit, not prior PR evidence |
| `nmt-analytics-admin/src/components/form/date-picker.tsx` | N/A — no source consumers | Unmounted legacy component; no business workflow is certified |
| `nmt-analytics-admin/src/components/form/group-input/PhoneInput.tsx` | N/A — no source consumers | Unmounted legacy component; no business workflow is certified |
| `nmt-analytics-admin/src/components/form/input/Checkbox.tsx` | NOT TESTED | This audit, not prior PR evidence |
| `nmt-analytics-admin/src/components/form/input/FileInput.tsx` | N/A — no source consumers | Unmounted legacy component; no business workflow is certified |
| `nmt-analytics-admin/src/components/form/input/InputField.tsx` | NOT TESTED | This audit, not prior PR evidence |
| `nmt-analytics-admin/src/components/form/input/Radio.tsx` | N/A — no source consumers | Unmounted legacy component; no business workflow is certified |
| `nmt-analytics-admin/src/components/form/input/RadioSm.tsx` | N/A — no source consumers | Unmounted legacy component; no business workflow is certified |
| `nmt-analytics-admin/src/components/form/input/TextArea.tsx` | N/A — no source consumers | Unmounted legacy component; no business workflow is certified |
| `nmt-analytics-admin/src/components/header/Header.tsx` | NOT TESTED | This audit, not prior PR evidence |
| `nmt-analytics-admin/src/components/import/ImportModal.tsx` | PASS — 28 component contracts | Both customer/package forms, CSV/XLSX preview, validation, cancel, failed save, duplicates and locale labels; real persistence queued |
| `nmt-analytics-admin/src/components/integrations/ConfigureIntegrationModal.tsx` | NOT TESTED | This audit, not prior PR evidence |
| `nmt-analytics-admin/src/components/operations/DrustvaTab.tsx` | NOT TESTED | This audit, not prior PR evidence |
| `nmt-analytics-admin/src/components/operations/ManualBusSeating.tsx` | NOT TESTED | This audit, not prior PR evidence |
| `nmt-analytics-admin/src/components/operations/RoomingWorkspace.tsx` | NOT TESTED | This audit, not prior PR evidence |
| `nmt-analytics-admin/src/components/packages/PackageEditorModal.tsx` | NOT TESTED | This audit, not prior PR evidence |
| `nmt-analytics-admin/src/components/payments/AddPaymentModal.tsx` | PASS — component browser contract only | Create/edit or filter, cancel, validation, failed-save retry; real persistence awaits isolated run |
| `nmt-analytics-admin/src/components/payments/EditPaymentModal.tsx` | PASS — component browser contract only | Create/edit or filter, cancel, validation, failed-save retry; real persistence awaits isolated run |
| `nmt-analytics-admin/src/components/payments/PaymentForm.tsx` | PASS — component browser contract only | Create/edit or filter, cancel, validation, failed-save retry; real persistence awaits isolated run |
| `nmt-analytics-admin/src/components/payments/PaymentsModal.tsx` | PASS — component browser contract only | Create/edit or filter, cancel, validation, failed-save retry; real persistence awaits isolated run |
| `nmt-analytics-admin/src/components/quotations/QuotationBookingPanel.tsx` | NOT TESTED | This audit, not prior PR evidence |
| `nmt-analytics-admin/src/components/reservations/CreateReservationModal.tsx` | NOT TESTED | This audit, not prior PR evidence |
| `nmt-analytics-admin/src/components/reservations/EditReservationModal.tsx` | NOT TESTED | This audit, not prior PR evidence |
| `nmt-analytics-admin/src/components/reservations/NewSaleWizard.tsx` | NOT TESTED | This audit, not prior PR evidence |
| `nmt-analytics-admin/src/components/travelers/TravelerRequirementsFields.tsx` | NOT TESTED | This audit, not prior PR evidence |
| `nmt-analytics-admin/src/components/ui/FormModal.tsx` | NOT TESTED | This audit, not prior PR evidence |
| `nmt-analytics-admin/src/components/ui/ImportModal.tsx` | N/A — no source consumers | Unmounted legacy component; no business workflow is certified |
| `nmt-analytics-admin/src/components/ui/PageToolbar.tsx` | NOT TESTED | This audit, not prior PR evidence |
| `nmt-analytics-admin/src/pages/DepartureDetail.tsx` | NOT TESTED | Expense/payable regressions implemented; real browser matrix awaits isolated run. Other departure forms NOT TESTED. |
| `nmt-analytics-admin/src/pages/Inquiries.tsx` | NOT TESTED | This audit, not prior PR evidence |
| `nmt-analytics-admin/src/pages/Itineraries.tsx` | NOT TESTED | This audit, not prior PR evidence |
| `nmt-analytics-admin/src/pages/ItineraryDetail.tsx` | NOT TESTED | This audit, not prior PR evidence |
| `nmt-analytics-admin/src/pages/PackageDetail.tsx` | NOT TESTED | This audit, not prior PR evidence |
| `nmt-analytics-admin/src/pages/Profile.tsx` | NOT TESTED | This audit, not prior PR evidence |
| `nmt-analytics-admin/src/pages/PublicFormRenderer.tsx` | NOT TESTED | This audit, not prior PR evidence |
| `nmt-analytics-admin/src/pages/PublicSignWaiver.tsx` | NOT TESTED | This audit, not prior PR evidence |
| `nmt-analytics-admin/src/pages/QuotationDetail.tsx` | NOT TESTED | This audit, not prior PR evidence |
| `nmt-analytics-admin/src/pages/Quotations.tsx` | NOT TESTED | This audit, not prior PR evidence |
| `nmt-analytics-admin/src/pages/Reports.tsx` | PASS — component browser contract only | Create/edit or filter, cancel, validation, failed-save retry; real persistence awaits isolated run |
| `nmt-analytics-admin/src/pages/ReservationDetail.tsx` | NOT TESTED | This audit, not prior PR evidence |
| `nmt-analytics-admin/src/pages/Reservations.tsx` | NOT TESTED | This audit, not prior PR evidence |
| `nmt-analytics-admin/src/pages/Suppliers.tsx` | PASS — 12 component browser cases | Create/service native validation, cancel, failed save recovery, same-tick suppression across six theme/size combinations; real persistence pending |
| `nmt-analytics-admin/src/pages/admin/AuditLogs.tsx` | NOT TESTED | This audit, not prior PR evidence |
| `nmt-analytics-admin/src/pages/admin/Customers.tsx` | NOT TESTED | This audit, not prior PR evidence |
| `nmt-analytics-admin/src/pages/admin/Departures.tsx` | NOT TESTED | This audit, not prior PR evidence |
| `nmt-analytics-admin/src/pages/admin/Documents.tsx` | NOT TESTED | This audit, not prior PR evidence |
| `nmt-analytics-admin/src/pages/admin/Integrations.tsx` | NOT TESTED | This audit, not prior PR evidence |
| `nmt-analytics-admin/src/pages/admin/PdfTemplateEditor.tsx` | NOT TESTED | This audit, not prior PR evidence |
| `nmt-analytics-admin/src/pages/admin/PublicForms.tsx` | NOT TESTED | This audit, not prior PR evidence |
| `nmt-analytics-admin/src/pages/admin/Settings.tsx` | NOT TESTED | This audit, not prior PR evidence |
| `nmt-analytics-admin/src/pages/admin/UnifiedPayments.tsx` | NOT TESTED | This audit, not prior PR evidence |
| `nmt-analytics-admin/src/pages/admin/Waivers.tsx` | NOT TESTED | This audit, not prior PR evidence |
| `nmt-analytics-admin/src/pages/operations/CommissionRules.tsx` | NOT TESTED | This audit, not prior PR evidence |
| `nmt-analytics-admin/src/pages/operations/Contracts.tsx` | NOT TESTED | This audit, not prior PR evidence |
| `nmt-analytics-admin/src/pages/operations/Excursions.tsx` | NOT TESTED | This audit, not prior PR evidence |
| `nmt-analytics-admin/src/pages/operations/Flights.tsx` | NOT TESTED | This audit, not prior PR evidence |
| `nmt-analytics-admin/src/pages/operations/Hotels.tsx` | NOT TESTED | This audit, not prior PR evidence |
| `nmt-analytics-admin/src/pages/operations/Receipts.tsx` | NOT TESTED | This audit, not prior PR evidence |
| `nmt-analytics-admin/src/pages/operations/SubAgents.tsx` | PASS — component browser contract only | Six create/validation/cancel/failure/duplicate checks; portal and real persistence pending exact-head run |
| `nmt-analytics-admin/src/pages/portal/PortalSettings.tsx` | NOT TESTED | This audit, not prior PR evidence |

Shared input/select/datepicker/modal/dropdown dependencies and all transitive page consumers are in [components.json](components.json). Native controls outside those components are included above. This inventory is a search aid; dynamic schemas and role-specific actions still require manual workflow verification.

No upload, drawer, seating/rooming, public/portal or communication workflow is certified by this finance slice. PRs #120–128 remain separate, unmerged work; their evidence does not turn current main into a passing application-wide audit.
