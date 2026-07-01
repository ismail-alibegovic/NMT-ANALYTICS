# Travline (renamed to Travline) — Project Index

## Architecture
nmt-analytics-api/    — Express + Supabase backend (TypeScript)
nmt-analytics-admin/  — React + Vite + Tailwind frontend

## Live URL
https://travline.zocomputer.io

## Auth Credentials
- director role: admin@nmt.ba / NmtAdmin2025!
- director role: ismail@nmt.ba / NmtAdmin2025!
- agent role:   agent@nmt.ba / NmtAgent2025!

## Completed Features

### Role System
- DB roles: super_admin, director, manager, agent, viewer
- Legacy admin→director, user→agent migrated live
- ROLE_HIERARCHY: viewer < agent < manager < director < super_admin
- Backend: requireRole + requireMinimumRole middleware on all sensitive routes
- Frontend: hasAccess() helper + AuthGuard route rules + sidebar minRole filtering

### Notifications System
- DB: notifications table with RLS, indexes, CHECK constraints
- Backend: full CRUD API + auto-generation on reservation create / payment received
- Frontend: NotificationDropdown with unread badge, mark-as-read, live polling

### Dashboard Role Gating
- Agent/Viewer: only Bookings, Customers, Cancel Rate + bookings chart
- Manager+: full financial (Revenue, Avg Booking, Revenue Trend chart)

### "My Clients" (assigned_to)
- assigned_to column on reservations (migration 021)
- Auto-assigns logged-in user on reservation create (via RPC patch)
- ?assignedOnly=true filter for agents
- "Moji Klijenti" toggle in Reservations page

### Invoice PDF
- generateInvoicePDF() with org letterhead, line items, totals, QR
- route: GET /api/reservations/:id/invoice.pdf (manager+)
- "Faktura" button in Reservations table (visible to manager+)

### SMTP Email
- SmtpProvider + MockEmailProvider with runtime switching
- POST /settings/email + POST /settings/email/test (director+)
- Saved per-org in org_settings table, activated live on save

### Departure Reminders
- DB function notify_upcoming_departures() for T+1 check
- Scheduled agent runs daily at 8 AM

### Public Booking Widget API
- GET /api/public/packages — public packages listing
- POST /api/public/reservations — public reservation create
- No auth required; org-scoped via slug

### Route-Level Role Gating
- packages.ts, departures.ts, customers.ts: requireMinimumRole('agent')
- admin.ts: requireMinimumRole('director')
- payments.ts: requireMinimumRole('manager') on POST/PATCH/DELETE

### AI Assistant — Occupancy Predictions
- GET /ai/occupancy — predicts departure fill rate
- GET /ai/recommend — recommends top packages
- GET /ai/revenue-down — period-over-period revenue comparison

### Short Payment Links
- GET /paylinks/:code — public redirect to payment page
- POST /paylinks — generate short code (manager+)
- DB table: payment_links with 8-char nanoid codes

### Import/Export
- POST /api/import/:entity — CSV/XLSX import with mapping UI
- GET /api/export/all.zip — full org data export as ZIP
- Frontend ImportModal with column mapping, preview, dry-run

## Security
- Helmet security headers (CSP disabled for SPA)
- CORS verified — allows zo.computer/zo.space origins
- Rate limiting: authRateLimit (60/min), strictRateLimit (10/15min)
- JWT authentication via Supabase
- Zod validation on all request bodies
- Global error handler with structured responses

## Live Supabase
- Project ref: hacutwknfgufrqlgdiia
- Org: d9c9c298-9c09-4b0e-a91c-483758431d74 (NMT Analytics)

## Useful Paths
- DB migrations: supabase/sql/
- Role types: src/types/roles.ts (both api + admin)
- Notifications API: src/routes/notifications.ts
- AuthGuard: admin/src/components/auth/AuthGuard.tsx
- Import routes: src/routes/import.ts
- Export routes: src/routes/export.ts
