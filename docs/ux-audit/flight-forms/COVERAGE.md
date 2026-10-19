# Shared component and form coverage inventory

Source inspection/dependency discovery only. A dependency is an impact candidate, not a confirmed visual defect or a completed browser check. Paths below are relative to `nmt-analytics-admin/src/`. Transitive pages can contain several workflows.

## Shared controls

| Component | Changed here | Direct consumers | Transitive pages |
|---|---|---:|---:|
| `components/form/date-picker.tsx` | No | 0 | 0 |
| `components/form/Form.tsx` | No | 0 | 0 |
| `components/form/MultiSelect.tsx` | No | 0 | 0 |
| `components/form/Select.tsx` | Yes | 17 | 10 |
| `components/form/Label.tsx` | No | 29 | 21 |
| `components/form/input/RadioSm.tsx` | No | 0 | 0 |
| `components/form/input/Checkbox.tsx` | No | 2 | 2 |
| `components/form/input/FileInput.tsx` | No | 0 | 0 |
| `components/form/input/Radio.tsx` | No | 0 | 0 |
| `components/form/input/TextArea.tsx` | No | 0 | 0 |
| `components/form/input/InputField.tsx` | Yes | 28 | 31 |
| `components/form/switch/Switch.tsx` | No | 1 | 1 |
| `components/form/group-input/PhoneInput.tsx` | No | 0 | 0 |
| `components/ui/modal/index.tsx` | Yes | 38 | 24 |
| `components/ui/FormModal.tsx` | Yes | 1 | 1 |
| `components/ui/dropdown/Dropdown.tsx` | No | 2 | 0 |
| `components/ui/dropdown/DropdownItem.tsx` | No | 1 | 0 |
| `components/ui/PageToolbar.tsx` | Yes | 23 | 23 |

## Exact consumer list

### components/form/date-picker.tsx

Direct imports:
- No direct consumers found.

Transitive pages:
- No transitive page consumers found.

### components/form/Form.tsx

Direct imports:
- No direct consumers found.

Transitive pages:
- No transitive page consumers found.

### components/form/MultiSelect.tsx

Direct imports:
- No direct consumers found.

Transitive pages:
- No transitive page consumers found.

### components/form/Select.tsx

Direct imports:
- `components/communications/AutomationEditorModal.tsx`
- `components/communications/CampaignEditorModal.tsx`
- `components/communications/CommunicationHistoryPanel.tsx`
- `components/communications/ManualMessageComposer.tsx`
- `components/communications/SendMessage.tsx`
- `components/communications/TemplateEditorModal.tsx`
- `components/departures/DepartureFormModal.tsx`
- `components/integrations/ConfigureIntegrationModal.tsx`
- `components/packages/PackageEditorModal.tsx`
- `components/payments/AddPaymentModal.tsx`
- `components/payments/EditPaymentModal.tsx`
- `components/payments/PaymentsModal.tsx`
- `components/reservations/EditReservationModal.tsx`
- `components/travelers/TravelerRequirementsFields.tsx`
- `components/ui/FormModal.tsx`
- `pages/DepartureDetail.tsx`
- `pages/operations/Flights.tsx`

Transitive pages:
- `pages/DepartureDetail.tsx`
- `pages/PackageDetail.tsx`
- `pages/ReservationDetail.tsx`
- `pages/Reservations.tsx`
- `pages/admin/Customers.tsx`
- `pages/admin/Departures.tsx`
- `pages/admin/Integrations.tsx`
- `pages/admin/Packages.tsx`
- `pages/communication/CommunicationCenter.tsx`
- `pages/operations/Flights.tsx`

### components/form/Label.tsx

Direct imports:
- `components/auth/ResetPasswordForm.tsx`
- `components/auth/SignInForm.tsx`
- `components/auth/SignUpForm.tsx`
- `components/communications/AutomationEditorModal.tsx`
- `components/communications/CampaignEditorModal.tsx`
- `components/communications/ManualMessageComposer.tsx`
- `components/communications/SendMessage.tsx`
- `components/communications/TemplateEditorModal.tsx`
- `components/form/date-picker.tsx`
- `components/integrations/ConfigureIntegrationModal.tsx`
- `components/packages/PackageEditorModal.tsx`
- `components/payments/AddPaymentModal.tsx`
- `components/payments/EditPaymentModal.tsx`
- `components/payments/PaymentsModal.tsx`
- `components/reservations/CreateReservationModal.tsx`
- `components/reservations/EditReservationModal.tsx`
- `components/reservations/NewSaleWizard.tsx`
- `components/travelers/TravelerRequirementsFields.tsx`
- `components/ui/FormModal.tsx`
- `pages/DepartureDetail.tsx`
- `pages/Inquiries.tsx`
- `pages/Itineraries.tsx`
- `pages/ItineraryDetail.tsx`
- `pages/QuotationDetail.tsx`
- `pages/Quotations.tsx`
- `pages/Suppliers.tsx`
- `pages/admin/PublicForms.tsx`
- `pages/operations/Flights.tsx`
- `pages/operations/Hotels.tsx`

Transitive pages:
- `pages/AuthPages/ResetPassword.tsx`
- `pages/AuthPages/SignIn.tsx`
- `pages/AuthPages/SignUp.tsx`
- `pages/DepartureDetail.tsx`
- `pages/Inquiries.tsx`
- `pages/Itineraries.tsx`
- `pages/ItineraryDetail.tsx`
- `pages/PackageDetail.tsx`
- `pages/QuotationDetail.tsx`
- `pages/Quotations.tsx`
- `pages/ReservationDetail.tsx`
- `pages/Reservations.tsx`
- `pages/Suppliers.tsx`
- `pages/admin/Customers.tsx`
- `pages/admin/Departures.tsx`
- `pages/admin/Integrations.tsx`
- `pages/admin/Packages.tsx`
- `pages/admin/PublicForms.tsx`
- `pages/communication/CommunicationCenter.tsx`
- `pages/operations/Flights.tsx`
- `pages/operations/Hotels.tsx`

### components/form/input/RadioSm.tsx

Direct imports:
- No direct consumers found.

Transitive pages:
- No transitive page consumers found.

### components/form/input/Checkbox.tsx

Direct imports:
- `components/auth/SignInForm.tsx`
- `components/auth/SignUpForm.tsx`

Transitive pages:
- `pages/AuthPages/SignIn.tsx`
- `pages/AuthPages/SignUp.tsx`

### components/form/input/FileInput.tsx

Direct imports:
- No direct consumers found.

Transitive pages:
- No transitive page consumers found.

### components/form/input/Radio.tsx

Direct imports:
- No direct consumers found.

Transitive pages:
- No transitive page consumers found.

### components/form/input/TextArea.tsx

Direct imports:
- No direct consumers found.

Transitive pages:
- No transitive page consumers found.

### components/form/input/InputField.tsx

Direct imports:
- `components/auth/ResetPasswordForm.tsx`
- `components/auth/SignInForm.tsx`
- `components/auth/SignUpForm.tsx`
- `components/communications/AutomationEditorModal.tsx`
- `components/communications/ManualMessageComposer.tsx`
- `components/communications/SendMessage.tsx`
- `components/departures/DepartureAccommodationAllotment.tsx`
- `components/departures/DepartureFormModal.tsx`
- `components/integrations/ConfigureIntegrationModal.tsx`
- `components/packages/PackageEditorModal.tsx`
- `components/payments/AddPaymentModal.tsx`
- `components/payments/EditPaymentModal.tsx`
- `components/payments/PaymentsModal.tsx`
- `components/reservations/CreateReservationModal.tsx`
- `components/reservations/EditReservationModal.tsx`
- `components/reservations/NewSaleWizard.tsx`
- `components/ui/FormModal.tsx`
- `components/ui/PageToolbar.tsx`
- `pages/DepartureDetail.tsx`
- `pages/Inquiries.tsx`
- `pages/Itineraries.tsx`
- `pages/ItineraryDetail.tsx`
- `pages/QuotationDetail.tsx`
- `pages/Quotations.tsx`
- `pages/Suppliers.tsx`
- `pages/admin/PublicForms.tsx`
- `pages/operations/Flights.tsx`
- `pages/operations/Hotels.tsx`

Transitive pages:
- `pages/AuthPages/ResetPassword.tsx`
- `pages/AuthPages/SignIn.tsx`
- `pages/AuthPages/SignUp.tsx`
- `pages/DepartureDetail.tsx`
- `pages/HotelDetail.tsx`
- `pages/Inquiries.tsx`
- `pages/Itineraries.tsx`
- `pages/ItineraryDetail.tsx`
- `pages/PackageDetail.tsx`
- `pages/Profile.tsx`
- `pages/QuotationDetail.tsx`
- `pages/Quotations.tsx`
- `pages/ReservationDetail.tsx`
- `pages/Reservations.tsx`
- `pages/Suppliers.tsx`
- `pages/admin/Customers.tsx`
- `pages/admin/Departures.tsx`
- `pages/admin/Documents.tsx`
- `pages/admin/Integrations.tsx`
- `pages/admin/Packages.tsx`
- `pages/admin/PublicForms.tsx`
- `pages/communication/CommunicationCenter.tsx`
- `pages/operations/Availability.tsx`
- `pages/operations/Calendar.tsx`
- `pages/operations/CommissionRules.tsx`
- `pages/operations/Contracts.tsx`
- `pages/operations/Excursions.tsx`
- `pages/operations/Flights.tsx`
- `pages/operations/Hotels.tsx`
- `pages/operations/Receipts.tsx`
- `pages/operations/SubAgents.tsx`

### components/form/switch/Switch.tsx

Direct imports:
- `components/communications/AutomationEditorModal.tsx`

Transitive pages:
- `pages/communication/CommunicationCenter.tsx`

### components/form/group-input/PhoneInput.tsx

Direct imports:
- No direct consumers found.

Transitive pages:
- No transitive page consumers found.

### components/ui/modal/index.tsx

Direct imports:
- `components/common/QuickCreateModal.tsx`
- `components/communications/AutomationEditorModal.tsx`
- `components/communications/AutomationTab.tsx`
- `components/communications/CampaignEditorModal.tsx`
- `components/communications/CampaignsTab.tsx`
- `components/communications/CommunicationHistoryPanel.tsx`
- `components/communications/SendMessage.tsx`
- `components/communications/TemplateEditorModal.tsx`
- `components/communications/TemplatesTab.tsx`
- `components/departures/DepartureFormModal.tsx`
- `components/departures/SupplierPayablesPanel.tsx`
- `components/integrations/ConfigureIntegrationModal.tsx`
- `components/packages/PackageEditorModal.tsx`
- `components/payments/AddPaymentModal.tsx`
- `components/payments/EditPaymentModal.tsx`
- `components/payments/PaymentsModal.tsx`
- `components/quotations/QuotationBookingPanel.tsx`
- `components/reservations/CreateReservationModal.tsx`
- `components/reservations/EditReservationModal.tsx`
- `components/reservations/NewSaleWizard.tsx`
- `components/ui/FormModal.tsx`
- `pages/DepartureDetail.tsx`
- `pages/Inquiries.tsx`
- `pages/Itineraries.tsx`
- `pages/PackageDetail.tsx`
- `pages/QuotationDetail.tsx`
- `pages/Quotations.tsx`
- `pages/ReservationDetail.tsx`
- `pages/Suppliers.tsx`
- `pages/admin/AuditLogs.tsx`
- `pages/admin/PublicForms.tsx`
- `pages/operations/CommissionRules.tsx`
- `pages/operations/Contracts.tsx`
- `pages/operations/Excursions.tsx`
- `pages/operations/Flights.tsx`
- `pages/operations/Hotels.tsx`
- `pages/operations/Receipts.tsx`
- `pages/operations/SubAgents.tsx`

Transitive pages:
- `pages/DepartureDetail.tsx`
- `pages/Hub/HomeHub.tsx`
- `pages/Inquiries.tsx`
- `pages/Itineraries.tsx`
- `pages/PackageDetail.tsx`
- `pages/QuotationDetail.tsx`
- `pages/Quotations.tsx`
- `pages/ReservationDetail.tsx`
- `pages/Reservations.tsx`
- `pages/Suppliers.tsx`
- `pages/admin/AuditLogs.tsx`
- `pages/admin/Customers.tsx`
- `pages/admin/Departures.tsx`
- `pages/admin/Integrations.tsx`
- `pages/admin/Packages.tsx`
- `pages/admin/PublicForms.tsx`
- `pages/communication/CommunicationCenter.tsx`
- `pages/operations/CommissionRules.tsx`
- `pages/operations/Contracts.tsx`
- `pages/operations/Excursions.tsx`
- `pages/operations/Flights.tsx`
- `pages/operations/Hotels.tsx`
- `pages/operations/Receipts.tsx`
- `pages/operations/SubAgents.tsx`

### components/ui/FormModal.tsx

Direct imports:
- `pages/admin/Customers.tsx`

Transitive pages:
- `pages/admin/Customers.tsx`

### components/ui/dropdown/Dropdown.tsx

Direct imports:
- `components/header/NotificationDropdown.tsx`
- `components/header/UserDropdown.tsx`

Transitive pages:
- No transitive page consumers found.

### components/ui/dropdown/DropdownItem.tsx

Direct imports:
- `components/header/UserDropdown.tsx`

Transitive pages:
- No transitive page consumers found.

### components/ui/PageToolbar.tsx

Direct imports:
- `pages/HotelDetail.tsx`
- `pages/Inquiries.tsx`
- `pages/Itineraries.tsx`
- `pages/PackageDetail.tsx`
- `pages/Profile.tsx`
- `pages/Quotations.tsx`
- `pages/Reservations.tsx`
- `pages/Suppliers.tsx`
- `pages/admin/Customers.tsx`
- `pages/admin/Departures.tsx`
- `pages/admin/Documents.tsx`
- `pages/admin/Integrations.tsx`
- `pages/admin/Packages.tsx`
- `pages/admin/PublicForms.tsx`
- `pages/operations/Availability.tsx`
- `pages/operations/Calendar.tsx`
- `pages/operations/CommissionRules.tsx`
- `pages/operations/Contracts.tsx`
- `pages/operations/Excursions.tsx`
- `pages/operations/Flights.tsx`
- `pages/operations/Hotels.tsx`
- `pages/operations/Receipts.tsx`
- `pages/operations/SubAgents.tsx`

Transitive pages:
- `pages/HotelDetail.tsx`
- `pages/Inquiries.tsx`
- `pages/Itineraries.tsx`
- `pages/PackageDetail.tsx`
- `pages/Profile.tsx`
- `pages/Quotations.tsx`
- `pages/Reservations.tsx`
- `pages/Suppliers.tsx`
- `pages/admin/Customers.tsx`
- `pages/admin/Departures.tsx`
- `pages/admin/Documents.tsx`
- `pages/admin/Integrations.tsx`
- `pages/admin/Packages.tsx`
- `pages/admin/PublicForms.tsx`
- `pages/operations/Availability.tsx`
- `pages/operations/Calendar.tsx`
- `pages/operations/CommissionRules.tsx`
- `pages/operations/Contracts.tsx`
- `pages/operations/Excursions.tsx`
- `pages/operations/Flights.tsx`
- `pages/operations/Hotels.tsx`
- `pages/operations/Receipts.tsx`
- `pages/operations/SubAgents.tsx`

## All form/control surfaces

| Surface | Browser coverage in this branch |
|---|---|
| `components/auth/ResetPasswordForm.tsx` | OPEN — consumer workflow not browser-certified |
| `components/auth/SignInForm.tsx` | OPEN — consumer workflow not browser-certified |
| `components/auth/SignUpForm.tsx` | OPEN — consumer workflow not browser-certified |
| `components/common/DateRangeFilter.tsx` | OPEN — consumer workflow not browser-certified |
| `components/common/GlobalSearch.tsx` | OPEN — consumer workflow not browser-certified |
| `components/communications/AutomationEditorModal.tsx` | OPEN — consumer workflow not browser-certified |
| `components/communications/AutomationTab.tsx` | OPEN — consumer workflow not browser-certified |
| `components/communications/CampaignEditorModal.tsx` | OPEN — consumer workflow not browser-certified |
| `components/communications/CampaignsTab.tsx` | OPEN — consumer workflow not browser-certified |
| `components/communications/CommunicationHistoryPanel.tsx` | OPEN — consumer workflow not browser-certified |
| `components/communications/ManualMessageComposer.tsx` | OPEN — consumer workflow not browser-certified |
| `components/communications/SendMessage.tsx` | OPEN — consumer workflow not browser-certified |
| `components/communications/TemplateEditorModal.tsx` | OPEN — consumer workflow not browser-certified |
| `components/communications/TemplatesTab.tsx` | OPEN — consumer workflow not browser-certified |
| `components/departures/DepartureAccommodationAllotment.tsx` | OPEN — consumer workflow not browser-certified |
| `components/departures/DepartureFormModal.tsx` | OPEN — consumer workflow not browser-certified |
| `components/departures/SupplierPayablesPanel.tsx` | OPEN — consumer workflow not browser-certified |
| `components/finance/SupplierPayablesOverview.tsx` | OPEN — consumer workflow not browser-certified |
| `components/form/Select.tsx` | OPEN — consumer workflow not browser-certified |
| `components/form/date-picker.tsx` | OPEN — consumer workflow not browser-certified |
| `components/form/group-input/PhoneInput.tsx` | OPEN — consumer workflow not browser-certified |
| `components/form/input/Checkbox.tsx` | OPEN — consumer workflow not browser-certified |
| `components/form/input/FileInput.tsx` | OPEN — consumer workflow not browser-certified |
| `components/form/input/InputField.tsx` | OPEN — consumer workflow not browser-certified |
| `components/form/input/Radio.tsx` | OPEN — consumer workflow not browser-certified |
| `components/form/input/RadioSm.tsx` | OPEN — consumer workflow not browser-certified |
| `components/form/input/TextArea.tsx` | OPEN — consumer workflow not browser-certified |
| `components/header/Header.tsx` | OPEN — consumer workflow not browser-certified |
| `components/import/ImportModal.tsx` | OPEN — consumer workflow not browser-certified |
| `components/integrations/ConfigureIntegrationModal.tsx` | OPEN — consumer workflow not browser-certified |
| `components/operations/DrustvaTab.tsx` | OPEN — consumer workflow not browser-certified |
| `components/operations/ManualBusSeating.tsx` | OPEN — consumer workflow not browser-certified |
| `components/operations/RoomingWorkspace.tsx` | OPEN — consumer workflow not browser-certified |
| `components/packages/PackageEditorModal.tsx` | OPEN — consumer workflow not browser-certified |
| `components/payments/AddPaymentModal.tsx` | OPEN — consumer workflow not browser-certified |
| `components/payments/EditPaymentModal.tsx` | OPEN — consumer workflow not browser-certified |
| `components/payments/PaymentsModal.tsx` | OPEN — consumer workflow not browser-certified |
| `components/quotations/QuotationBookingPanel.tsx` | OPEN — consumer workflow not browser-certified |
| `components/reservations/CreateReservationModal.tsx` | OPEN — consumer workflow not browser-certified |
| `components/reservations/EditReservationModal.tsx` | OPEN — consumer workflow not browser-certified |
| `components/reservations/NewSaleWizard.tsx` | OPEN — consumer workflow not browser-certified |
| `components/travelers/TravelerRequirementsFields.tsx` | OPEN — consumer workflow not browser-certified |
| `components/ui/FormModal.tsx` | Shared unit tests; actual Customer workflow fixture |
| `components/ui/ImportModal.tsx` | OPEN — consumer workflow not browser-certified |
| `components/ui/PageToolbar.tsx` | OPEN — consumer workflow not browser-certified |
| `pages/DepartureDetail.tsx` | OPEN — consumer workflow not browser-certified |
| `pages/Inquiries.tsx` | OPEN — consumer workflow not browser-certified |
| `pages/Itineraries.tsx` | OPEN — consumer workflow not browser-certified |
| `pages/ItineraryDetail.tsx` | OPEN — consumer workflow not browser-certified |
| `pages/PackageDetail.tsx` | OPEN — consumer workflow not browser-certified |
| `pages/Profile.tsx` | OPEN — consumer workflow not browser-certified |
| `pages/PublicFormRenderer.tsx` | OPEN — consumer workflow not browser-certified |
| `pages/PublicSignWaiver.tsx` | OPEN — consumer workflow not browser-certified |
| `pages/QuotationDetail.tsx` | OPEN — consumer workflow not browser-certified |
| `pages/Quotations.tsx` | OPEN — consumer workflow not browser-certified |
| `pages/Reports.tsx` | OPEN — consumer workflow not browser-certified |
| `pages/Reservations.tsx` | OPEN — consumer workflow not browser-certified |
| `pages/Suppliers.tsx` | OPEN — consumer workflow not browser-certified |
| `pages/admin/AuditLogs.tsx` | OPEN — consumer workflow not browser-certified |
| `pages/admin/Customers.tsx` | Fixture workflow: both themes × 390/768/1440; real acceptance separate |
| `pages/admin/Departures.tsx` | OPEN — consumer workflow not browser-certified |
| `pages/admin/Documents.tsx` | OPEN — consumer workflow not browser-certified |
| `pages/admin/Integrations.tsx` | OPEN — consumer workflow not browser-certified |
| `pages/admin/PdfTemplateEditor.tsx` | OPEN — consumer workflow not browser-certified |
| `pages/admin/PublicForms.tsx` | OPEN — consumer workflow not browser-certified |
| `pages/admin/Settings.tsx` | OPEN — consumer workflow not browser-certified |
| `pages/admin/UnifiedPayments.tsx` | OPEN — consumer workflow not browser-certified |
| `pages/admin/Waivers.tsx` | OPEN — consumer workflow not browser-certified |
| `pages/operations/CommissionRules.tsx` | OPEN — consumer workflow not browser-certified |
| `pages/operations/Contracts.tsx` | OPEN — consumer workflow not browser-certified |
| `pages/operations/Excursions.tsx` | OPEN — consumer workflow not browser-certified |
| `pages/operations/Flights.tsx` | Fixture workflow: both themes × 390/768/1440; real acceptance separate |
| `pages/operations/Hotels.tsx` | OPEN — consumer workflow not browser-certified |
| `pages/operations/Receipts.tsx` | OPEN — consumer workflow not browser-certified |
| `pages/operations/SubAgents.tsx` | OPEN — consumer workflow not browser-certified |
| `pages/portal/PortalSettings.tsx` | OPEN — consumer workflow not browser-certified |

## Known overlaps and remaining work

- #123 owns Customer draft/error/phone/email changes. Customer page/API-type changes here match its existing implementation; coordinate before merging overlapping PRs.
- #124 owns Departure UTC/local input conversion and mobile layout. This branch reuses its exact dateTimeInput utility. Departure workflows remain outside the browser coverage recorded here.
- #120/#122/#127 already propose broader modal/theme/native-control work. This branch does not claim that work was merged or verified. Reconcile shared changes before merging.
- Native input/select/textarea markup exists in addition to shared components. It must be audited separately; converting Flight to shared controls does not standardize these other forms.
- Remaining work includes auth/public forms, reservation and New Sale flows, departure/package forms, supplier/quotation/itinerary forms, payments, communication editors, hotel/allotment/rooming/seating, integrations/import/upload and settings dialogs. Test populated and failure states, relevant roles, both languages/themes, and all three viewport sizes.
- The original owner screenshot could not be rendered by the image read response in this session; the delivered before captures are real browser renders of the unchanged Flight layout from main in the isolated component harness.
