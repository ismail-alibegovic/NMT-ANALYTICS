# Travline — Architecture Canon

**Purpose:** technical source of truth for how new Travline work should fit into the existing system. Always inspect current code before assuming a detail from this document is exhaustive.

## 1. System shape

Travline is a TypeScript application with a browser admin, an HTTP API, and Supabase as the external data/auth platform.

```text
Browser
  │
  ├─ React/Vite admin
  │      │
  │      ├─ Supabase Auth/session (existing auth integration)
  │      │
  │      └─ /api/* business requests
  │               │
  │               ▼
  └──────── Express API
                  │
                  ├─ authentication/authorization
                  ├─ organization scoping
                  ├─ validation/business rules
                  ├─ audit logging
                  │
                  ▼
               Supabase
                  │
                  └─ PostgreSQL + RLS
```

Repository roots:

- `nmt-analytics-admin/` — frontend.
- `nmt-analytics-api/` — API and server-side domain logic.

## 2. Frontend

Current stack includes:

- React 19;
- Vite 6;
- TypeScript;
- React Router;
- Supabase JS;
- React Hook Form / Zod where used;
- Tailwind-based styling;
- Vitest + Testing Library;
- Sentry integration where configured.

Primary frontend responsibilities:

- authenticated application shell and navigation;
- data presentation;
- user input/forms;
- local interaction state;
- calling business APIs;
- existing Supabase authentication/session handling;
- localization and user feedback.

The frontend must not become the only enforcement point for tenant security, permissions, capacity, money, or other business-critical rules.

### API base

The admin supports `VITE_API_URL`; same-origin `/api` is the preferred deployment shape where possible.

### i18n

Bosnian and English translations must remain in parity. Follow the established translation structure in the repository rather than introducing a second localization mechanism.

## 3. API

Current stack includes:

- Node.js;
- Express 5;
- TypeScript;
- Supabase JS using server-side credentials;
- Zod/route validation patterns where present;
- Vitest + Supertest;
- PDF/document and mail utilities;
- Sentry where configured.

`nmt-analytics-api/src/app.ts` owns the Express application. Runtime-specific entrypoints should reuse/export this app rather than duplicate route/business setup.

`src/index.ts` is the traditional Node process entrypoint for runtimes that call `listen()`.

### Responsibilities

The API is the primary boundary for business operations:

- authenticate the request;
- resolve user/org context;
- enforce role/permission/capability rules;
- validate input;
- enforce tenant scope;
- execute domain/business rules;
- write audit events where applicable;
- return stable HTTP/JSON behavior.

## 4. Authentication and authorization

Travline uses Supabase authentication integrated with the admin and API.

Important distinction:

- **authentication**: who the user is;
- **organization/tenant context**: which organization the request belongs to;
- **role/permission**: what that user may do;
- **agency capability**: what workflows the organization operates;
- **subscription entitlement**: what the commercial plan permits.

Do not collapse these concepts into a single boolean check.

The auth flow contains protection against stale-token reload loops and repeated redirects. Any auth change must inspect the current implementation and regression tests before editing.

## 5. Multi-tenancy

Tenant isolation is a non-negotiable invariant.

For every organization-owned domain:

1. Resolve authenticated organization context server-side.
2. Scope reads and writes by that organization.
3. Keep relationship joins organization-safe.
4. Preserve/extend RLS where the domain is covered by RLS.
5. Test cross-organization denial, especially for IDs supplied by the client.

Never implement `SELECT/UPDATE/DELETE by id` for a tenant-owned object without organization scope simply because UUIDs are hard to guess.

When relationships have both ordinary and composite organization-safe foreign keys, be explicit in PostgREST/Supabase embeds to avoid ambiguous relationship selection.

## 6. Database and migrations

Supabase/PostgreSQL is the persistent database.

Rules:

- schema evolution is migration-driven;
- applied migrations are immutable history;
- new migrations must be append-only and safely replayable in the repository's established migration workflow;
- prefer additive/backward-compatible changes;
- new organization-owned tables need `org_id`/equivalent tenancy design, organization-safe relationships, RLS strategy, indexes, and tests;
- migrations must not embed production secrets;
- destructive data transforms need an explicit task, backup/rollback reasoning, and review.

Before creating a migration, inspect the existing migration directories/scripts and follow the active convention; do not create a new migration system.

## 7. Domain boundaries

Travline's existing codebase contains mature and evolving domains including:

- organizations/users/context;
- customers;
- inquiries;
- packages and package services;
- departures;
- reservations/bookings;
- passengers/departure passengers;
- passenger groups;
- accommodation/rooming/hotel allocations;
- flights;
- payments/installments/receipts/invoices;
- contracts/documents/waivers;
- communications/templates/campaigns/automation;
- suppliers and other operating-system redesign domains;
- public forms;
- audit logs;
- capabilities/settings.

Before introducing a new table, route or frontend store, search for an existing concept that should be extended instead.

## 8. Package vs departure

A package/product is reusable commercial/default configuration. A departure is a dated operational instance.

Architecture should support snapshot/inheritance where required so later edits to a package do not unexpectedly rewrite historical or active departure/reservation state.

Departure-specific operational overrides belong on departure-level data, not by mutating the package for all future departures.

## 9. Reservation vs passenger

A reservation is a commercial booking; passengers/travelers are people attached to that booking/trip context.

Avoid using customer, reservation and passenger as interchangeable entities. Any compatibility behavior from legacy NMT Analytics must be handled explicitly rather than perpetuated into new APIs.

Passenger deletion/movement requires dependency-aware behavior for groups, seating, rooming, documents and other operational references.

## 10. Communication architecture

Communication features must preserve:

- organization-scoped sender configuration;
- recipient resolution restricted to the intended org and operational context;
- templates/campaigns/history tied to correct tenant context;
- message-length/channel constraints where relevant;
- no accidental cross-departure or cross-org recipient expansion.

External providers should sit behind provider/service boundaries rather than leak provider-specific logic across UI screens.

## 11. Public forms

Public endpoints are intentionally unauthenticated entry surfaces and therefore require stricter server-side validation.

A public token/form must resolve to exactly one owning organization/form context. Submission handlers must not trust organization IDs from the browser and must feed the intended sales/intake workflow.

Public forms should not bypass business review by silently creating reservations unless the specific public booking product flow explicitly requires it.

## 12. Audit logging

Use existing audit helpers/conventions for material mutations. Audit records should identify the relevant organization, actor where available, entity/domain action, and useful non-sensitive metadata.

Do not log secrets, full credentials, or unnecessary sensitive traveler data.

## 13. Error handling

- 4xx is for expected validation/auth/conflict/not-found behavior.
- 5xx is for genuine server failures.
- Do not convert business conflicts into generic success responses to make UI easier.
- Improve coarse legacy status codes incrementally when the active task touches them.
- User-facing frontend errors should be actionable and localized where appropriate.

## 14. Deployment architecture

GitHub `main` is source of truth.

### Codex / Vercel path

Target architecture:

```text
Codex feature branch
       ↓
GitHub PR / CI
       ↓
Vercel Preview
       ↓
merge main
       ↓
Vercel Production
       ↓
Supabase
```

The full-stack Vercel deployment should run the built admin and Vercel-compatible API entrypoint from the same GitHub source, with `/api/*` same-origin routing.

Server-only secrets such as `TRAVLINE_SUPABASE_SERVICE_ROLE_KEY` belong in the hosting provider's environment variables, never in Vite/browser variables or the repository.

### ZO path

ZO Computer is an alternative development/runtime/hosting path for the same GitHub codebase.

```text
GitHub main
   ↓
ZO sync/build/restart
   ↓
ZO-hosted Travline
   ↓
Supabase
```

ZO-local code must not become a competing source of truth. When returning to ZO after Codex work, sync it to the desired GitHub commit, install/build, restart, and verify health.

The Vercel and ZO runtime paths should not proxy through or depend on each other when configured as independent deployments. They may intentionally use the same Supabase project unless a separate database environment is provisioned.

## 15. Configuration and secrets

Client-safe configuration may include values explicitly intended for browser use, such as Supabase project URL and anon/publishable key.

Server-only configuration includes service-role credentials and provider secrets.

Never:

- prefix a server secret with `VITE_`;
- commit a service-role key;
- print secrets into CI logs;
- copy a runtime secret into task documentation;
- assume ZO secrets automatically exist on Vercel or vice versa.

When adding a new required environment variable, update `.env.example` or the project's existing config documentation with the variable name and purpose, not the secret value.

## 16. CI and verification

The repository has GitHub Actions CI covering API/admin build/test plus migration/Docker checks according to the active workflow.

Local/task verification should mirror the relevant CI surfaces:

### API

```bash
cd nmt-analytics-api
npm ci
npm run build
npm test
```

### Admin

```bash
cd nmt-analytics-admin
npm ci
npm run lint
npm test
npm run build
```

For database changes, run the established migration replay. For deployment work, verify `/api/health`. For user-facing workflows, verify the affected flow in a real browser where tooling permits.

## 17. Architecture decision rule

If an active task requires changing one of these invariants, the task must explicitly say so and the PR must document the reason. Do not casually change tenant boundaries, auth ownership, API-first behavior, migration policy, or deployment secret boundaries during unrelated feature work.
