# Travline

**An operations platform and CRM for travel agencies.** Travline carries an agency's daily work — inquiry, quotation, reservation, payment, departure preparation, execution and reporting — in one multi-tenant system, with every traveler, supplier, room, seat and payment connected to the same trip.

> **Status:** in active development. The codebase has an extensive automated test and CI pipeline, but Travline is **not yet in commercial production**: hosted backup/restore and real-agency onboarding have not been verified. See [`docs/TRAVLINE_FINAL_ROADMAP.md`](docs/TRAVLINE_FINAL_ROADMAP.md) for the current release gates.

---

## What it does

Travel agencies typically run on spreadsheets, e-mail and a disconnected booking tool, so the state of a single departure has to be reconstructed by hand. Travline makes the **departure** the shared workspace:

| Area | Capabilities |
| --- | --- |
| Sales | Inquiries, quotations with costing, quotation → reservation conversion, customer records |
| Reservations | Atomic reservation editing, cancellations, waivers, passenger groups |
| Departures | Capacity, seat plans, rooming lists, accommodation, flights, excursions, document readiness, profitability |
| Finance | Payments, installments, receipts, supplier payables, commission rules, transactions |
| Partners | Supplier confirmations, sub-agent portal, public booking forms |
| Operations | Calendar, notifications, message templates, automation rules, import/export, audit log |
| Reporting | Sales, departure and financial reports scoped per organization |

The interface is fully bilingual (Bosnian / English) with enforced translation parity.

## Architecture

```text
Browser ── React 19 / Vite admin ──┬── Supabase Auth (session)
                                   │
                                   └── /api/*  ──►  Express 5 API (TypeScript)
                                                     ├─ authentication & role checks
                                                     ├─ organization scoping
                                                     ├─ validation (Zod) & business rules
                                                     ├─ audit logging
                                                     ▼
                                                  Supabase PostgreSQL + Row Level Security
```

- **API-first:** business mutations go through the Express API; the browser never holds service credentials.
- **Tenant isolation in two layers:** every tenant-owned query is scoped to the authenticated organization in the API *and* enforced by Postgres RLS. Cross-organization access is treated as a release-blocking defect.
- **Transactional integrity:** reservation, capacity and cancellation mutations run as atomic database operations, so seats and rooms are released or reserved together with the financial record.
- **Append-only migrations:** 120 SQL migrations, replayed from zero in CI on every change.

Full detail: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) · product principles: [`docs/PRODUCT.md`](docs/PRODUCT.md)

## Engineering highlights

- **Test suite:** 1,000+ API tests and 550+ admin tests (Vitest), plus Playwright suites for forms, dates, UI audit and end-to-end flows.
- **CI (GitHub Actions):** dependency audit, strict typecheck, build, unit tests, full migration replay, a production-upgrade rehearsal and logical-recovery drill on a synthetic database, Docker image builds, and an isolated Supabase acceptance suite covering authorization, reservation atomicity and signup provisioning.
- **Security:** Helmet, rate limiting, server-side validation, RLS policies tested with SQL acceptance scripts.
- **Observability:** Sentry on both API and admin; a scheduled production health workflow.
- **Portable deployment:** Vercel (serverless API + static admin) or Docker containers (API + nginx-served admin).

## Tech stack

**Frontend:** React 19, TypeScript, Vite, React Router, React Hook Form + Zod, Tailwind CSS, FullCalendar, ApexCharts
**Backend:** Node.js 24, Express 5, TypeScript, Zod, PDFKit, ExcelJS
**Data:** Supabase (PostgreSQL, Auth, Storage), Row Level Security
**Quality:** Vitest, Testing Library, Playwright, GitHub Actions, Sentry, Docker

## Repository layout

```text
nmt-analytics-admin/   React admin application
nmt-analytics-api/     Express API, domain services, Supabase migrations, SQL acceptance scripts
api/                   Vercel serverless entry point
docs/                  Product, architecture, roadmap, operations and security documentation
scripts/               Build and deployment scripts
```

## Running locally

Requirements: Node.js 24, a Supabase project (or the local Supabase CLI stack).

```bash
# API
cd nmt-analytics-api
cp .env.example .env        # fill in Supabase URL and keys
npm ci
npm run dev

# Admin (separate terminal)
cd nmt-analytics-admin
cp .env.example .env
npm ci
npm run dev
```

Tests:

```bash
cd nmt-analytics-api   && npm test
cd nmt-analytics-admin && npm run lint && npm test
```

## Development notes

The admin shell was originally scaffolded from the open-source TailAdmin React template and has since been rebuilt around Travline's own domain screens. Development uses AI coding agents under the repository rules in [`AGENTS.md`](AGENTS.md): branch-per-task, pull requests, CI gates and explicit verification before merge.

## Author

Built by [Ismail Alibegović](https://github.com/ismail-alibegovic) — Sarajevo, Bosnia and Herzegovina.
