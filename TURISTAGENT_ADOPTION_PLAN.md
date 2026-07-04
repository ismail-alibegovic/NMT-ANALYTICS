# Travline — TuristAgent Feature Adoption Plan

**Date**: 2026-07-04  
**Based on**: turistagent.com full analysis, Travline current state audit  
**Scope**: Feature gaps, new page architecture, DB schema extensions, backend routes, frontend implementation order

---

## 1. Gap Analysis: Travline vs TuristAgent

| TuristAgent Feature | Travline Status | Gap |
|---|---|---|
| CIS / eTurista integracija | ❌ None | Government data submission endpoint needed |
| Ugovori (Contracts) | ❌ None | Digital contract generation, per-reservation |
| Vaučeri (Vouchers) | ⚠️ Partial | `GET /api/reservations/:id/voucher.pdf` exists but needs richer data (hotel, services breakdown) |
| Fiskalni računi | ❌ None | Fiscal receipt generation (online/thermal print) |
| Avansni računi + refund | ❌ None | Advanced payment receipts with auto-refund linkage |
| Subagenti prodaja | ❌ None | Sub-agent portal: auto-generate contract + invoice + najava in seconds |
| Ekskurzije / grupni aranžmani | ❌ None | Bulk passenger import (100+), per-passenger debt tracking, bus lists, ruming lists |
| Kompleksni aranžmani (hoteli + prevoz + ture + osiguranje) | ❌ None | Multi-option package builder: hotels, transport, tours, insurance bundled into one arrangement |
| Autobuske karte + sopstvene linije | ❌ None | Bus ticket sales, own seasonal lines, per-category pricing, auto price calc |
| Transferi / lokalni prevoz | ❌ None | Route-based local transfers, location/pickup time management |
| Hoteli / apartmani (kapaciteti, cene, dostupnost) | ❌ None | Hotel/apartment inventory with real-time availability, auto price calc, booking widget |
| Zakup → website integracija | ❌ None | Public-facing booking engine (like Booking.com) linked to your allotment |
| Uplate / rate / dugovanja | ⚠️ Partial | Payments exist but no installment plan tracking, no auto overdue warnings |
| Kalendar putovanja | ❌ None | Visual travel calendar (all departures vis on calendar) |
| Statistika | ⚠️ Partial | Reports page exists (CSV exports, revenue chart) but no per-agent/per-package breakdown |
| Dokumentacija (centralizovana arhiva) | ⚠️ Partial | Documents page exists (`/admin/documents`) — upload/generate only |
| Bus lista | ❌ None | Bus passenger list generation per departure |
| Ruming lista | ❌ None | Hotel rooming list per departure |
| Multi-role: Organizatori sa zakupom, Vodiči, DMC, Prevoznici | ⚠️ Partial | 5 roles exist (viewer→super_admin) but no guide/transporter/DMC-specific role types |

---

## 2. Feature Implementation Roadmap

### Phase A — Core Travel Agency Operations (Weeks 1-2)

These are the features Travline needs to be a credible agency tool.

#### A1. Contract Generation (Ugovori)
**New page**: `/operations/contracts`  
**Sidebar**: New "Operations" section → "Contracts"  
**Min role**: agent  

**DB**:
```sql
CREATE TABLE contracts (
  id UUID PK,
  org_id UUID FK,
  reservation_id UUID FK,
  contract_number TEXT UNIQUE,    -- auto-generated: UG-YYYY-XXXX
  contract_date DATE,
  traveler_name TEXT,
  traveler_phone TEXT,
  package_description TEXT,
  departure_date DATE,
  return_date DATE,
  party_size INT,
  total_amount NUMERIC(12,2),
  currency TEXT DEFAULT 'BAM',
  payment_terms TEXT,             -- installment schedule
  cancellation_policy TEXT,
  status TEXT DEFAULT 'draft',    -- draft, signed, cancelled
  signed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Backend**: `POST /api/contracts` (auto-generates from reservation), `GET /api/contracts/:id`, `GET /api/contracts/:id/pdf`  
**Frontend**: Contract list table + PDF generation (same PDFKit pipeline as invoices)

#### A2. Voucher Enhancement (Vaučeri)
**Existing route**: `GET /api/reservations/:id/voucher.pdf`  
**Upgrade**: Add hotel name, room type, check-in/check-out, services breakdown, tour guide name to voucher PDF.  
**DB additions**: `reservations.hotel_name`, `reservations.room_type`, `reservations.check_in`, `reservations.check_out` (nullable)  
**No new page needed** — voucher button on Reservations table already works.

#### A3. Fiscal Receipts (Fiskalni računi)
**New page**: `/operations/receipts` (under Operations section)  
**Min role**: manager  

**DB**:
```sql
CREATE TABLE receipts (
  id UUID PK,
  org_id UUID FK,
  reservation_id UUID FK,
  contract_id UUID FK,
  receipt_number TEXT UNIQUE,     -- FR-YYYY-XXXX
  receipt_type TEXT,              -- advance, final, refund
  amount NUMERIC(12,2),
  currency TEXT DEFAULT 'BAM',
  payment_method TEXT,            -- cash, card, bank
  linked_receipt_id UUID,         -- for advances → final linkage
  fiscal_data JSONB DEFAULT '{}', -- government fiscal fields
  issued_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Backend**: `POST /api/receipts`, `GET /api/receipts/:id/pdf`, `POST /api/receipts/:id/refund`  
**Frontend**: Receipt table + quick generate from reservation + print layout (A4 + thermal mock)

#### A4. Installment Tracking (Rate / Dugovanja)
**Modify existing payments table**: Add `installment_number INT`, `due_date DATE`, `remaining_after NUMERIC`.  
**New backend endpoint**: `GET /api/reservations/:id/installments`  
**New frontend component**: InstallmentSchedule (inline on PaymentsModal), overdue warnings in notification feed.

**No new page** — extends existing Payments UI.

#### A5. Travel Calendar (Kalendar putovanja)
**New page**: `/operations/calendar`  
**Min role**: agent  

**Frontend**: FullCalendar-like month/week view. Each departure = visual event. Click → reservation list. Color-coded by status.  
**Backend**: `GET /api/calendar?month=2026-07` → returns departures with counts (booked/capacity/available).  
**No new DB** — reads existing `departures` table.

---

### Phase B — Advanced Operations (Weeks 3-4)

#### B1. Sub-Agent Portal (Subagenti)
**New page**: `/operations/subagents` (manager+)  
**Concept**: You (main agency) have sub-agents who sell your packages. System auto-generates *najava + ugovor + faktura* for sub-agent to issue to traveler in seconds.

**DB**:
```sql
CREATE TABLE sub_agents (
  id UUID PK,
  org_id UUID FK,
  name TEXT,
  phone TEXT,
  email TEXT,
  commission_rate NUMERIC(5,2), -- percentage
  is_active BOOL DEFAULT true
);

CREATE TABLE sub_agent_sales (
  id UUID PK,
  org_id UUID FK,
  sub_agent_id UUID FK,
  reservation_id UUID FK,
  commission_amount NUMERIC(12,2),
  documents_generated JSONB,    -- {najava, ugovor, faktura} all pre-generated
  created_at TIMESTAMPTZ
);
```

**Backend**: `POST /api/subagents/:id/generate-sale` → creates reservation, contract, receipt atomically. Returns bundle URL.  
**Frontend**: Sub-agent list, add/edit modal, "Generate Sale" button → instant document bundle download.

#### B2. Excursions / Group Bookings (Ekskurzije)
**New page**: `/operations/excursions` (manager+)  

**DB**:
```sql
-- Extend packages table
ALTER TABLE packages ADD COLUMN is_excursion BOOL DEFAULT false;
ALTER TABLE packages ADD COLUMN route JSONB;     -- [{stop: "Beč", date: "2026-08-15"}, ...]

-- Per-passenger tracking within a reservation
CREATE TABLE excursion_passengers (
  id UUID PK,
  reservation_id UUID FK,
  full_name TEXT,
  phone TEXT,
  id_document TEXT,             -- passport/JMBG
  seat_number INT,
  paid_amount NUMERIC(12,2) DEFAULT 0,
  total_amount NUMERIC(12,2),
  debt_amount NUMERIC(12,2),    -- auto-calculated
  notes TEXT
);
```

**Backend**: `POST /api/excursions/bulk-import` (CSV upload → mass passenger creation), `GET /api/excursions/:id/bus-list` (PDF), `GET /api/excursions/:id/ruming-list` (PDF).  
**Frontend**: Bulk import modal with CSV mapper (reuse existing ImportModal pattern), passenger table per departure, Bus List / Ruming List buttons per departure.

#### B3. Complex Package Builder (Aranžmani)
**Existing page**: `/packages`  
**Upgrade**: Multi-service package editor  

**DB**:
```sql
CREATE TABLE package_services (
  id UUID PK,
  package_id UUID FK,
  service_type TEXT,             -- hotel, transport, tour, insurance, extra
  provider_name TEXT,
  provider_contact TEXT,
  unit_price NUMERIC(12,2),
  currency TEXT DEFAULT 'BAM',
  quantity INT DEFAULT 1,
  total_price NUMERIC(12,2),     -- unit_price * quantity, auto-calc
  description TEXT,
  is_optional BOOL DEFAULT false  -- traveler can opt in/out
);
```

**Backend**: Update `POST/PATCH /api/packages` to accept `services[]` array. `GET /api/packages/:id` returns service breakdown.  
**Frontend**: Package edit modal gets "Services" tab — add/remove hotels, transport, tours, insurance with inline price calc.  
**PDF upgrade**: Voucher + invoice show service line items.

#### B4. Hotel/Accommodation Inventory
**New page**: `/operations/hotels`  
**Min role**: manager  

**DB**:
```sql
CREATE TABLE hotels (
  id UUID PK,
  org_id UUID FK,
  name TEXT,
  destination TEXT,
  address TEXT,
  contact TEXT,
  total_rooms INT,
  created_at TIMESTAMPTZ
);

CREATE TABLE hotel_rooms (
  id UUID PK,
  hotel_id UUID FK,
  room_type TEXT,               -- single, double, triple, apartment
  capacity INT,
  base_price NUMERIC(12,2),
  currency TEXT DEFAULT 'BAM',
  available INT,                -- remaining for booking
  total INT                     -- total of this type
);

CREATE TABLE hotel_allocations (
  id UUID PK,
  departure_id UUID FK,
  hotel_id UUID FK,
  room_type TEXT,
  rooms_reserved INT,
  check_in DATE,
  check_out DATE,
  price_per_night NUMERIC(12,2)
);
```

**Backend**: Full CRUD `/api/hotels`, `/api/hotels/:id/rooms`. Public endpoint `GET /api/public/hotels/:slug` for booking widget.  
**Frontend**: Hotel list, room type editor, allocation grid (hotel × departure matrix).

---

### Phase C — Government Integration & Public Booking (Weeks 5-6)

#### C1. CIS / eTurista Integration
**New page**: `/integrations` (extend existing) — new tab "CIS / eTurista"  

**Concept**: Travel agencies in Bosnia/Serbia must submit guest arrival data to government systems. The API wraps existing reservation data into the required XML/JSON format and pushes it.

**DB**:
```sql
CREATE TABLE eturista_submissions (
  id UUID PK,
  org_id UUID FK,
  submission_date DATE,
  departure_id UUID FK,
  guest_count INT,
  raw_payload JSONB,
  response_status TEXT,
  response_body JSONB,
  submitted_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Backend**: `POST /api/integrations/eturista/submit` — generates payload from reservations, submits to government endpoint (configurable URL per org). `GET /api/integrations/eturista/history`.  
**Config**: `org_settings.eturista_endpoint`, `org_settings.eturista_credentials`.

#### C2. Public Booking Widget (Zakup → Website)
**Existing**: `GET /api/public/packages`, `POST /api/public/reservations`  
**Upgrade**: Hotel room booking endpoint `GET /api/public/hotels/:slug/rooms`, `POST /api/public/hotel-bookings`. Real-time availability via `hotel_rooms.available`.  
**Frontend**: Embeddable booking widget (JS snippet agencies paste on their site) — renders package list + hotel availability + reservation form.  
**New static asset**: `/widget/booking-widget.js` (vanilla JS, no framework dependency).

---

## 3. Page Architecture Changes

### Current Navigation
```
[Menu]
  Dashboard        /
  Clients          /customers
  Packages         /packages
  Reservations     /reservations
  Departures       /departures
  Payments         /payments         (manager+)
  Reports          /reports          (manager+)
  Integrations     /integrations     (manager+)
[System]
  Audit Logs       /admin/audit-logs (director+)
  Documents        /admin/documents  (manager+)
```

### Proposed Navigation (After Phase A+B)
```
[Menu]
  Dashboard        /
  Clients          /customers
  Packages         /packages
  Reservations     /reservations
  Departures       /departures
  Payments         /payments         (manager+)
  Reports          /reports          (manager+)
  Integrations     /integrations     (manager+)
[Operations]                         (NEW section)
  Calendar         /operations/calendar        (agent+)
  Contracts        /operations/contracts       (agent+)
  Receipts         /operations/receipts        (manager+)
  Sub-agents       /operations/subagents       (manager+)
  Excursions       /operations/excursions      (manager+)
  Hotels           /operations/hotels          (manager+)
[System]
  Audit Logs       /admin/audit-logs           (director+)
  Documents        /admin/documents            (manager+)
  Settings         /settings                   (director+)
```

`/admin/documents` stays. `/settings` (already exists but not in sidebar nav items — add it under System).

### New Route Registration (App.tsx)
```tsx
// Phase A
const Calendar = lazy(() => import("./pages/operations/Calendar"));
const Contracts = lazy(() => import("./pages/operations/Contracts"));
const Receipts = lazy(() => import("./pages/operations/Receipts"));
// Phase B
const SubAgents = lazy(() => import("./pages/operations/SubAgents"));
const Excursions = lazy(() => import("./pages/operations/Excursions"));
const Hotels = lazy(() => import("./pages/operations/Hotels"));

// In routes:
<Route path="/operations/calendar" element={<SuspenseWrapper><Calendar /></SuspenseWrapper>} />
<Route path="/operations/contracts" element={<SuspenseWrapper><Contracts /></SuspenseWrapper>} />
<Route path="/operations/receipts" element={<SuspenseWrapper><Receipts /></SuspenseWrapper>} />
<Route path="/operations/subagents" element={<SuspenseWrapper><SubAgents /></SuspenseWrapper>} />
<Route path="/operations/excursions" element={<SuspenseWrapper><Excursions /></SuspenseWrapper>} />
<Route path="/operations/hotels" element={<SuspenseWrapper><Hotels /></SuspenseWrapper>} />
```

### Sidebar Changes (AppSidebar.tsx)
Add new section "Operations" (`t.nav.operations`) after main menu items, before System:

```tsx
const operationsItems: NavItem[] = [
  {
    icon: <CalenderIcon />,
    name: t.nav.calendar,
    path: "/operations/calendar",
  },
  {
    icon: <FileIcon />,
    name: t.nav.contracts,
    path: "/operations/contracts",
  },
  {
    icon: <DollarLineIcon />,
    name: t.nav.receipts,
    path: "/operations/receipts",
    minRole: "manager",
  },
  {
    icon: <UserCircleIcon />,
    name: t.nav.subAgents,
    path: "/operations/subagents",
    minRole: "manager",
  },
  {
    icon: <ShootingStarIcon />,
    name: t.nav.excursions,
    path: "/operations/excursions",
    minRole: "manager",
  },
  {
    icon: <GridIcon />,
    name: t.nav.hotels,
    path: "/operations/hotels",
    minRole: "manager",
  },
];
```

### i18n Additions (bs.ts + en.ts)
```ts
// nav additions
operations: 'Operacije' | 'Operations',
calendar: 'Kalendar' | 'Calendar',
contracts: 'Ugovori' | 'Contracts',
receipts: 'Računi' | 'Receipts',
subAgents: 'Subagenti' | 'Sub-agents',
excursions: 'Ekskurzije' | 'Excursions',
hotels: 'Hoteli' | 'Hotels',
```

---

## 4. Backend Route Additions (routes/index.ts)

```ts
// Phase A
import contractRoutes from './contracts';
import receiptRoutes from './receipts';
import calendarRoutes from './calendar';

// Phase B
import subAgentRoutes from './subagents';
import excursionRoutes from './excursions';
import hotelRoutes from './hotels';

router.use('/contracts', contractRoutes);
router.use('/receipts', receiptRoutes);
router.use('/calendar', calendarRoutes);
router.use('/subagents', subAgentRoutes);
router.use('/excursions', excursionRoutes);
router.use('/hotels', hotelRoutes);
```

Each route module follows the existing pattern:
- Zod validation schemas
- `authenticateToken` + `requireOrgContext` middleware
- `requireMinimumRole` where needed
- Supabase admin client queries
- Pagination via `formatListResponse`
- Audit logging via `audit*` middleware

---

## 5. DB Migration Plan (SQL files to create)

Ordered by dependency:

| # | Migration | Tables Created | Depends On |
|---|---|---|---|
| 027 | `027_voucher_enhancement.sql` | ALTER reservations (hotel fields) | 001_init |
| 028 | `028_contracts.sql` | contracts | 001_init (reservations) |
| 029 | `029_receipts.sql` | receipts | 028_contracts |
| 030 | `030_installments.sql` | ALTER payments (installment fields) | 014_payments |
| 031 | `031_sub_agents.sql` | sub_agents, sub_agent_sales | 001_init |
| 032 | `032_excursions.sql` | ALTER packages, excursion_passengers | 001_init |
| 033 | `033_package_services.sql` | package_services | 001_init (packages) |
| 034 | `034_hotels.sql` | hotels, hotel_rooms, hotel_allocations | 001_init (departures) |
| 035 | `035_eturista.sql` | eturista_submissions | 018_organizations |

All follow the existing pattern: `org_id` FK, RLS policies, indexes on `(org_id, created_at)`.

---

## 6. Implementation Order (Priority)

### Immediate — Phase A (Delivers agency core credibility)

1. **Contracts (028)** → Backend + Frontend  
   *Minimal new concepts — just PDF generation from reservation data. Fastest win.*

2. **Calendar (no migration)** → Backend + Frontend  
   *Reads existing departures table. Pure UI work. High visual impact.*

3. **Receipts (029)** → Backend + Frontend  
   *Extends payment workflow. Builds on existing PaymentsModal patterns.*

4. **Voucher enhancement (027)** → Backend only  
   *Add hotel fields to reservation schema + enrich PDF output. No new page.*

5. **Installments (030)** → Backend + Frontend  
   *Extends PaymentsModal with installment schedule view + overdue notifications.*

### Next — Phase B (Differentiation from competitors)

6. **Hotels (034)** → Backend + Frontend  
   *Largest new module. Build hotel CRUD first, then allocation matrix, then public booking widget.*

7. **Package services (033)** → Backend + Frontend  
   *Multi-service package editor builds on existing Package form UI.*

8. **Sub-agents (031)** → Backend + Frontend  
   *New entity + "Generate Sale" atomic transaction. High-value for agencies with sub-agent networks.*

9. **Excursions (032)** → Backend + Frontend  
   *Bulk import + bus/ruming list PDF generation. Reuses existing ImportModal + PDFKit.*

### Later — Phase C (Regulatory + Public)

10. **eTurista integration (035)** → Backend + Integration tab extension  
    *Configurable endpoint per org. JSON payload generation from reservation data.*

11. **Public booking widget** → Static JS asset  
    *Reads `/api/public/hotels/:slug/rooms`. Embeddable `<script>` tag.*

---

## 7. File Structure

```
nmt-analytics-admin/src/
  pages/
    operations/
      Calendar.tsx          (new)
      Contracts.tsx         (new)
      Receipts.tsx          (new)
      SubAgents.tsx         (new)
      Excursions.tsx        (new)
      Hotels.tsx            (new)
  api/
    contracts.ts            (new)
    receipts.ts             (new)
    calendar.ts             (new)
    subagents.ts            (new)
    excursions.ts           (new)
    hotels.ts               (new)
  components/
    contracts/
      ContractForm.tsx      (new)
      ContractPDF.tsx       (new)
    receipts/
      ReceiptForm.tsx       (new)
      ReceiptPDF.tsx        (new)
    excursions/
      BulkImportModal.tsx   (new)
      BusListPDF.tsx        (new)
      RumingListPDF.tsx     (new)
    hotels/
      HotelForm.tsx         (new)
      RoomEditor.tsx        (new)
      AllocationGrid.tsx    (new)
    payments/
      InstallmentSchedule.tsx (new — extends existing)

nmt-analytics-api/src/
  routes/
    contracts.ts            (new)
    receipts.ts             (new)
    calendar.ts             (new)
    subagents.ts            (new)
    excursions.ts           (new)
    hotels.ts               (new)
  lib/
    fiscalReceiptGenerator.ts  (new)
    contractGenerator.ts       (new)
    busListGenerator.ts        (new)
    rumingListGenerator.ts     (new)
    eturistaClient.ts          (new)

supabase/sql/
  027_voucher_enhancement.sql
  028_contracts.sql
  029_receipts.sql
  030_installments.sql
  031_sub_agents.sql
  032_excursions.sql
  033_package_services.sql
  034_hotels.sql
  035_eturista.sql
```

---

## 8. Key Design Decisions

1. **No breaking changes to existing pages** — all existing routes, sidebar items, and UI patterns remain intact. New features are additive.

2. **Reuse existing patterns aggressively**:
   - All backend routes follow the `authenticateToken → requireOrgContext → Zod validation → Supabase query → formatListResponse` pipeline.
   - All modals follow the existing `AddPaymentModal`/`PaymentsModal` pattern (form state + toast notifications + auto-refresh).
   - All tables follow the existing `Reservations.tsx` pattern (filter bar + paginated table + actions dropdown).
   - PDF generation uses the existing `pdfkit` + `generateInvoicePDF` pattern.

3. **Role gating consistent with existing hierarchy**: New pages use `requireMinimumRole('agent')` for operational views and `requireMinimumRole('manager')` for financial/configuration views.

4. **No new dependencies** — `pdfkit` already installed, `date-fns` already installed, `lucide-react` for icons. Calendar can be built with pure React + Tailwind grid (no FullCalendar npm package needed for MVP).

5. **i18n from day one** — every new string goes into `bs.ts` and `en.ts` translations objects simultaneously.

---

## 9. Estimated Effort

| Phase | Items | Backend (routes) | Frontend (pages) | DB (migrations) | Total |
|---|---|---|---|---|---|
| A | 5 features | 8 route files | 3 new pages + 2 component extensions | 4 migrations | ~60 files |
| B | 4 features | 8 route files | 3 new pages + 6 components | 4 migrations | ~55 files |
| C | 2 features | 2 route files + 1 static asset | 1 tab extension | 1 migration | ~15 files |

---

---

## Summary

Travline already has solid foundations: multi-tenant architecture, role system, CRUD for core entities, payment tracking, PDF generation, email, notifications, and audit logs. The gap to TuristAgent is in **travel-specific operational workflows** — contracts, receipts, installments, hotel inventory, sub-agent sales, excursions, and a visual calendar. This plan adds those without touching existing code, reusing every pattern already established, and keeping the same dependency footprint.
