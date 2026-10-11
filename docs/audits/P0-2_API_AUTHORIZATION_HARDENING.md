# P0-2 API Authorization Hardening

Status: implemented on `fix/p0-2-api-authorization-hardening`.

This change applies the existing `requireMinimumRole` middleware to the pilot's
core mutation routes. Middleware order remains authentication, organization
context, role authorization, audit logging, and the handler, preserving the
existing tenant-isolation model.

## Secured mutation surfaces

| Surface | Minimum role |
| --- | --- |
| Packages: create, update, patch, delete | `manager` |
| Departures: create, update, patch, delete, manual messaging | `manager` |
| Reservations: create, update, delete, status changes, batch status changes, email sending | `agent` |
| Reservation manual messaging | `manager` |
| Customers: create, update, delete | `agent` |
| Departure passengers: create, update, delete | `agent` |
| Documents: upload, delete, generate, voucher generation | `manager` |

Existing guards on payments, installments, accommodation, rooming, seats,
profitability, supplier confirmations, flights, hotels, sub-agents, settings,
and other operational modules were retained.

## Retired legacy workflow

`POST /api/subagents/:id/generate-sale` is retained only as an authenticated,
organization-scoped compatibility endpoint. Director-authorized callers receive
`410 LEGACY_SALE_DISABLED`; the endpoint performs no database writes and no PDF
generation. The admin "Generate Sale" action and its API helper were removed.
Sales must use the canonical reservation and payment workflows.

## Verification

- API tests: 69 files, 610 tests passed.
- API TypeScript build passed.
- Admin tests: 42 files, 283 tests passed.
- Admin TypeScript/Vite build passed.
- Admin lint passed with existing warnings only.
- `git diff --check` passed.

This is local source and test evidence only; no production deployment or live
Supabase data was changed. Remaining risk is limited to role-level assumptions
for less-central operational mutations, which should be confirmed against the
pilot role matrix before production rollout.
