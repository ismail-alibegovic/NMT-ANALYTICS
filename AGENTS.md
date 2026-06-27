# NMT Analytics — Project Index

## Architecture
nmt-analytics-api/    — Express + Supabase backend (TypeScript)
nmt-analytics-admin/  — React + Vite + Tailwind frontend

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

## Live Supabase
- Project: hacutwknfgufrqlgdiia
- Management token saved in .env
- Service role key in .env

## Useful Paths
- DB migrations: supabase/sql/020_*, 021_*
- Role types: src/types/roles.ts (both api + admin)
- Notifications API: src/routes/notifications.ts
- AuthGuard: admin/src/components/auth/AuthGuard.tsx

## Phase 5 — Features (completed 2026-06-27)

### AI Assistant — Occupancy Predictions
- `GET /ai/occupancy-prediction` — predicts departure fill rate based on historical booking velocity + remaining capacity
- `GET /ai/recommend` — recommends top packages for a given date range based on past booking patterns
- Existing `GET /ai/revenue-down` — period-over-period revenue comparison with signals

### Short Payment Links
- `GET /paylinks/:code` — public redirect to reservation payment page (no auth required)
- `POST /paylinks` — generate short code for a reservation (manager+)
- `GET /paylinks` — list all links for org (manager+)
- DB table: `payment_links` with 8-char nanoid codes, tracked click count
- Migration: supabase/sql/022_payment_links.sql

### Public Booking Widget
- `GET /public/packages?org=<slug>` — public list of available packages
- `GET /public/departures?package_id=<id>` — public departure dates
- `POST /public/reservations` — create reservation without auth (rate-limited)
- `GET /public/widget.html` — embeddable booking widget HTML
- Route: nmt-analytics-api/src/routes/public.ts
- CORS configured for cross-origin embedding

### SMTP Email Settings
- UI route: `GET/POST /settings/email` — configure SMTP per org (director+)
- `POST /settings/email/test` — send test email
- SmtpEmailProvider — falls back to mock when not configured
- Auto-activated on server start if env vars present
- Nodemailer transport, supports attachments (voucher/invoice PDFs)

### Invoice PDFs
- `GET /reservations/:id/invoice.pdf` — professional invoice with org details, line items, payment summary, due date
- Frontend "Faktura" button on Reservations page (hidden for agents)
