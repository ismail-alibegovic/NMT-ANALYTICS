# M15 — Operativni dokumenti i štampa (Operational Documents & Exports)

**Status:** COMPLETED  
**Priority:** P1  
**Branch:** `feature/m15-operational-documents`  
**Roadmap references:** M15 (Operational documents), Master Plan 2.0 §18

## 1. Goal

Provide tour operators and travel agencies with reliable, authoritative operational document generation and exports. Enable 1-click generation of passenger travel manifests (PDF & CSV), hotel rooming lists (PDF & CSV), bus seating lists (PDF & CSV), and departure vouchers from `DepartureDetail.tsx`, reflecting authoritative departure passengers, passport data, room allocations, and bus seat assignments.

## 2. Current problem

1. **Incomplete Passenger Manifest PDF:** `GET /departures/:id/manifest.pdf` only queried reservation headers, rendering "+N passengers" without individual traveler names, passport numbers, dates of birth, nationality, or assigned bus seats.
2. **Incomplete Rooming List PDF:** `GET /departures/:id/rooming-list.pdf` only grouped by reservation hotel name instead of canonical room allocations (`departure_rooms`, room numbers, assigned occupants).
3. **Missing CSV Exports:** Tour operators routinely send rooming lists to hotels and passenger manifests to airlines/border agencies in Excel/CSV format, but no CSV endpoints existed.
4. **Missing Bus Seating Manifest:** Tour leaders and bus drivers need a dedicated seating chart/list (seat number, passenger name, pickup point, phone), which was not available as a printable PDF/CSV.
5. **Missing Document Actions in DepartureDetail UI:** The admin interface had no buttons or dropdown in `DepartureDetail.tsx` to download these generated departure documents.

## 3. Required discovery before editing

- API: `nmt-analytics-api/src/routes/departureDocuments.ts`, `departures.ts`, `seats.ts`, `contracts.ts`, `documents.ts`.
- Admin: `nmt-analytics-admin/src/pages/DepartureDetail.tsx`, `src/api/departures.ts`.
- Database: `departure_passengers`, `departure_rooms`, `room_allocations`, `seats`, `vehicles`.

## 4. In scope

- Upgrade `departureDocuments.ts`:
  - `GET /api/departures/:id/manifest.pdf`: Include all individual passengers with passport, nationality, DOB, seat, and room.
  - `GET /api/departures/:id/manifest.csv`: Export full manifest to CSV.
  - `GET /api/departures/:id/rooming-list.pdf`: Incorporate canonical room allocations and room numbers.
  - `GET /api/departures/:id/rooming-list.csv`: Export rooming list to CSV for hotels.
  - `GET /api/departures/:id/bus-seating.pdf` & `.csv`: Generate driver-ready bus passenger list with seat numbers and contacts.
- Admin UI in `DepartureDetail.tsx`:
  - Add "Dokumenti / Documents" menu or action buttons with download triggers for Manifest (PDF/CSV), Rooming list (PDF/CSV), Bus seating (PDF/CSV), and Batch vouchers (PDF).
- Full BS/EN i18n parity.
- Unit and integration tests.

## 5. Out of scope

- Fiscal cash register hardware integration (covered in separate fiscalization milestone).
- Redesigning the template editor (already implemented in `pdfTemplateRenderer.ts`).

## 6. Verification

- API tests: `npm test` in `nmt-analytics-api`.
- Admin tests, lint, and build: `npm test`, `npm run lint`, `npm run build` in `nmt-analytics-admin`.
