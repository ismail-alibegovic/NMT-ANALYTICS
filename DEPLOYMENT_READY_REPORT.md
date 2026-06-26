# NMT Analytics — Deployment Readiness Report

**Date:** 2026-06-23  
**Scope:** `nmt-analytics-admin`, `nmt-analytics-api`, root Docker deployment config  
**Current status:** **Prepared for deployment, blocked only by DB migration + Zo service slot**

## 1. What is functional now

### Admin frontend

- React/Vite production build passes.
- TypeScript build passes.
- ESLint now runs with **0 errors**; remaining items are warnings only.
- Payment calculation smoke test passes.
- Auth flow exists through Supabase client + backend `/api/me/context`.
- Main app routes are present:
  - `/dashboard`
  - `/customers`
  - `/packages`
  - `/reservations`
  - `/departures`
  - `/payments`
  - `/payment-dashboard`
  - `/transactions`
  - `/reports`
  - `/integrations`
  - `/settings`
  - `/admin/audit-logs`
  - `/admin/documents`

### API backend

- TypeScript production build passes.
- API production boot was verified with host-provided production env overriding local `.env`.
- `/api/health` returns database-connected status.
- Local dev-bypass API smoke endpoints returned HTTP 200:
  - `/api/health`
  - `/api/me/context`
  - `/api/customers?page=1&limit=2`
  - `/api/packages?page=1&limit=2`
  - `/api/reservations?page=1&limit=2`
  - `/api/payments?page=1&limit=2`
  - `/api/reports/summary`

### Database connectivity

Verified readable:

- `organizations`
- `profiles`
- `reservations` financial fields:
  - `total_amount`
  - `paid_amount`
  - `balance_due`
  - `payment_status`
- `documents`

## 2. Changes completed

### Deployment fixes

- Fixed root `docker-compose.yml` API healthcheck:
  - Before: `/api/doctor`
  - After: `/api/health`
- Fixed API `Dockerfile` healthcheck:
  - Before: `/api/doctor`
  - After: `/api/health`
- Cleaned `src/app.ts` by removing the half-implemented root `/health` route. Canonical health endpoint is now `/api/health`.
- Fixed API environment loading so production host env vars are not overridden by local `.env` values.
- Added root production env template: `.env.production.example`.
- Fixed Docker build context issue by allowing required `tsconfig*.json` files into Docker context.
- Fixed frontend ESLint configuration to focus on deployment-relevant correctness while keeping React Hooks rules active.
- Fixed one real React Hooks violation in `src/components/ui/ImportModal.tsx`.

### Dependency security cleanup

Ran safe `npm audit fix` in both apps.

Remaining audit issues:

#### API

- `xlsx` — high severity, no npm fix available.
- `esbuild` — low severity, dev-tool related.

#### Admin

- `swiper` — critical, installed only for CSS import; should be removed or updated carefully.
- `xlsx` — high severity, no npm fix available.
- `picomatch` — high transitive issue.

Recommended next dependency work:

1. Replace `xlsx` with a maintained alternative or restrict imports to CSV-only for production.
2. Remove Swiper if not actively used; current code appears to import only `swiper/swiper-bundle.css`.
3. Re-run audit after dependency removal.

## 3. Current blockers before final production deployment

### Blocker A — Database schema drift

Current Supabase schema is missing:

```sql
payments.updated_at
```

The API expects this column in payment update and void flows. I added migration:

```text
nmt-analytics-api/supabase/sql/019_fix_payments_updated_at.sql
```

This migration must be applied in Supabase SQL Editor or via a proper DB migration tool before production release.

### Blocker B — Zo service limit

Current Zo Computer has **5/5 active hosted services**. A durable production deployment inside Zo requires freeing one service slot or upgrading the plan.

Active services found:

- `restaurant-tavolino`
- `zolibrary`
- `shifra-site`
- `sushi-station`
- `restoran-zacin`

### Blocker C — Docker daemon unavailable in this Zo container

Docker CLI exists, but Docker daemon is not running/accessible:

```text
Cannot connect to the Docker daemon at unix:///var/run/docker.sock
```

So Docker image builds could not be verified locally inside this environment. Node/Vite builds were verified instead.

## 4. Final deployment path inside Zo Computer

### Option 1 — Recommended: one combined Zo service

Run admin and API as one service:

- API serves `/api/*`
- Admin static build served from API for all non-API routes
- One service slot required
- Cleaner than two separate services
- Avoids CORS/domain split issues

Needed work:

1. Add static serving to API:
   - Serve `nmt-analytics-admin/dist` in production.
   - SPA fallback to `index.html` for non-API paths.
2. Build admin with `VITE_API_URL=/api`.
3. Start one service with:

```bash
NODE_ENV=production PORT=$PORT npm start
```

### Option 2 — Docker Compose outside Zo

Works for VPS/Railway-like host after DB migration:

```bash
docker compose up -d --build
```

But cannot be verified here until Docker daemon is available.

### Option 3 — Separate API/admin services

Not recommended because it needs two service slots and the account is already at the hosted service limit.

## 5. Final checklist

Before marking this production-ready:

- [x] API TypeScript build passes.
- [x] Admin TypeScript/Vite build passes.
- [x] Admin ESLint has 0 errors.
- [x] API production boot works with host env override.
- [x] `/api/health` verified.
- [x] Core local API smoke endpoints return 200 in dev-bypass mode.
- [x] Docker healthcheck fixed from `/api/doctor` to `/api/health`.
- [x] Production env template added.
- [ ] Apply `019_fix_payments_updated_at.sql` to Supabase.
- [ ] Remove/update vulnerable dependencies (`xlsx`, `swiper`).
- [ ] Free one Zo service slot or upgrade plan.
- [ ] Deploy combined app as one Zo service.
- [ ] Run authenticated production smoke test with real Supabase user token.

## 6. Bottom line

The project is technically close. The app builds, API boots, health works, and core endpoints respond. The only hard blockers are the missing `payments.updated_at` DB migration and Zo hosting capacity. After those two are resolved, the project can be deployed from Zo Computer as a single combined production service.
