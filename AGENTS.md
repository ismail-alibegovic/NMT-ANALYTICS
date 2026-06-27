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
