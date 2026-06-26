# Faza 1 — Cleanup ✅

## Završeno

### 1. NotificationDropdown Očišćen
- **Fajl**: `nmt-analytics-admin/src/components/header/NotificationDropdown.tsx`
- **Izmjene**: Uklonjene sve hardkodirane template notifikacije (Terry Franci, Alena Franci, Jocelyn Kenter, Brandon Philips)
- **Novo stanje**: Empty state sa "No notifications" porukom
- **Badge**: `notifying` state postavljen na `false`
- **Struktura**: Dropdown struktura sačuvana za buduću API implementaciju

### 2. Dupli Reports Obrisan
- **Obrisan**: `nmt-analytics-admin/src/pages/admin/Reports.tsx`
- **Razlog**: Duplikat od `pages/Reports.tsx`, nije bio u routeru
- **Aktivan**: `pages/Reports.tsx` ostaje kao jedini Reports interface

### 3. Template Komponente Obrisane
- **BasicTableOne**: `components/tables/BasicTables/BasicTableOne.tsx` — hardkodirani template podaci (Lindsey Curtis, Web Designer...)
- **BarChartOne**: `components/charts/bar/BarChartOne.tsx` — neiskorištena template komponenta
- **LineChartOne**: `components/charts/line/LineChartOne.tsx` — neiskorištena template komponenta
- **Zadržano**: `DonutChart.tsx` — **koristi se** u `PaymentDashboard.tsx`

### 4. DB Role Constraint Popravljen
- **Migration**: `nmt-analytics-api/supabase/sql/002_fix_roles.sql`
- **Izmjena**: Proširena role lista sa:
  ```sql
  CHECK (role IN ('super_admin', 'director', 'manager', 'agent', 'viewer', 'admin', 'user'))
  ```
- **Razlog**: Backend koristi `super_admin` u `requireRole` middleware, a DB to nije dozvoljavao
- **Kompatibilnost**: Zadržane stare role ('admin', 'user') za backwards compatibility

### 5. requireRole Middleware
- **Fajl**: `nmt-analytics-api/src/middleware/requireRole.ts`
- **Status**: ✅ Već radi korektno
- **Funkcija**: Provjerava da li user ima odgovarajuću rolu za pristup resursima

## Sljedeći Korak: Faza 2 — Role System

**Potrebno**:
1. Primijeniti migraciju `002_fix_roles.sql` na Supabase
2. Testirati postojeće role (`admin`, `user`) da i dalje rade
3. Dodati nove role (super_admin, director, manager, agent, viewer) u sistem
4. Implementirati role-based UI filtriranje

**Fajlovi spremni za Fazu 2**:
- Migration file: `002_fix_roles.sql`
- Middleware: `requireRole.ts` (već funkcionalan)
- Frontend: `AuthGuard.tsx` (treba proširiti)
