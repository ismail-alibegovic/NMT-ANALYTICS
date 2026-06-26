# NMT Analytics — Project Index

## Architecture
nmt-analytics-api/    — Express + Supabase backend (TypeScript)
nmt-analytics-admin/  — React + Vite + Tailwind frontend

## Key Decisions & Recent Work (2026-06-26)

### Role System (completed)
- DB roles: super_admin, director, manager, agent, viewer
- Legacy admin → director, user → agent migrated live
- ROLE_HIERARCHY: viewer < agent < manager < director < super_admin
- Backend: requireRole middleware uses final role set
- Frontend: hasAccess() helper + AuthGuard route rules + sidebar minRole filtering

### Notifications System (completed)
- DB: notifications table with RLS, indexes, CHECK constraints
- Backend: GET /notifications, GET /unread-count, PATCH /:id/read, PATCH /read-all
- Auto-generation on reservation create + payment received (in reservations.ts, payments.ts)
- Frontend: NotificationDropdown with live API, unread badge, mark-as-read

### Dashboard Role Gating (completed)
- Agent/Viewer: only Bookings, Customers, Cancel Rate cards + bookings chart
- Manager+: full financial dashboard (Revenue, Avg Booking, Revenue Trend)

### Permissions Matrix (sidebar + route guard)
- Dashboard: all
- Customers: all
- Packages: all (agent = read-only per plan, but CRUD exposed — planned for v2)
- Reservations: all
- Departures: all (agent = read-only per plan — v2)
- Payments/Transactions: manager+
- Reports/Integrations: manager+
- Documents: manager+
- Settings/Audit Logs: director+

### "My Clients" Assigned-to (current work-in-progress for agents)
- assigned_to column added to reservations (migration 021)
- API: auto-assigns logged-in user on reservation create
- API: ?assignedOnly=true query param to filter by current user
- Frontend: "Moji Klijenti" toggle on Reservations page (visible to agents)
- Backend requireRole middleware available for route-level access gating

### Invoice
- API: GET /invoices, POST /invoices, GET /invoices/:id
- Frontend: InvoiceList component with pagination and filters

## Useful Paths
- DB migration: supabase/sql/020_roles_notifications_hardening.sql
- Role types: nmt-analytics-api/src/types/roles.ts (backend), nmt-analytics-admin/src/types/roles.ts (frontend)
- Notifications API: nmt-analytics-api/src/routes/notifications.ts
- Notification service: nmt-analytics-api/src/lib/notificationService.ts
- AuthGuard: nmt-analytics-admin/src/components/auth/AuthGuard.tsx
- NotificationDropdown: nmt-analytics-admin/src/components/header/NotificationDropdown.tsx

## Live Supabase
- Project: hacutwknfgufrqlgdiia
- Management token saved in .env (SUPABASE_MANAGEMENT_TOKEN)
- Service role key in .env (SUPABASE_SERVICE_ROLE_KEY)
