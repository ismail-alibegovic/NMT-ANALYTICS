# Sprint 3 — Customer Self-Service Portal (DONE 2026-07-18)

Canonical plan: `TRAVLINE_FINAL_PLAN.md` §3. Committed at `6b7205b feat(portal): Sprint 3 — customer self-service portal`.

## Scope delivered

External tenants (agents/directors/managers/viewers) now have a dedicated, brand-aware self-service surface at `/portal/*` — separate from the admin SPA, mounted through a single auth chain:

```
<AuthGuard>
  <PortalGuard>
    <BrandingProvider>
      <PortalLayout>  ← Outlet-based layout route
        /portal            → PortalDashboard
        /portal/packages   → PortalPackages
        /portal/departures → PortalDepartures
        /portal/reservations → PortalReservations
        /portal/customers  → PortalCustomers
        /portal/settings   → PortalSettings
      </PortalLayout>
    </BrandingProvider>
  </PortalGuard>
</AuthGuard>
```

No doubled route mounting (the bug that broke the prior scaffold is gone). PortalLayout is a proper `<Outlet/>` layout route, not a leaf that shadowed `/`.

## Files added

- `src/api/branding.ts` — typed `getBranding()` / `updateBranding()` against `/settings/branding`.
- `src/components/portal/BrandingProvider.tsx` — React context that fetches the org's branding once, exposes brand colors + display name, falls back to navy/sky defaults on 403 (agents/viewers) or fetch failure.
- `src/components/portal/SignOutButton.tsx` — uses the new `useApp().signOut()` and bounces to `/signin`.
- `src/components/auth/PortalGuard.tsx` — adds the portal `portal` virtual module to the required module list on top of AuthGuard's role check.
- `src/layout/PortalLayout.tsx` — 236-line self-contained layout: brand-tinted top bar with org name/avatar, branded nav (Dashboard / Packages / Departures / Reservations / Customers / Settings) using brand color for active item, mobile sheet nav, footer with sign-out. All inline SVG icons (no `lucide-react` dependency drift).
- `src/pages/portal/PortalDashboard.tsx` — KPI cards (bookings, revenue, avg value, outstanding) computed client-side from `getReservations()`, recent-reservations table, upcoming-departures list. Empty-states for tenants with no data.
- `src/pages/portal/PortalPackages.tsx`, `PortalDepartures.tsx`, `PortalReservations.tsx`, `PortalCustomers.tsx` — reflective readonly tables of each entity, brand-tinted, both BS/EN i18n-aware.
- `src/pages/portal/PortalSettings.tsx` — branding editor (display name, logo URL, primary/accent color) with a live preview block. Save button is gated behind `director` role (matches `PATCH /settings/branding` which is `requireMinimumRole('director')`); non-directors see a read-only note. Account section shows the signed-in user's email + role.

## Files modified

- `src/App.tsx` — Sprint 3 portal routes + lazy imports.
- `src/context/AppContext.tsx` — adds `signOut: () => Promise<void>` to the `AppContextType` interface, the provider value, and the implementation (calls `supabase.auth.signOut()`, clears localStorage, resets provider state).
- `src/lib/i18n/en.ts`, `src/lib/i18n/bs.ts` — portal i18n block (nav, dashboard, packages, departures, reservations, customers, settings keys).

## Design notes

- No new backend routes. All data fetched through existing `api/*` clients (`getReservations`, `getDepartures`, `getPackages`, `getCustomers`, `getBranding`, `updateBranding`) which are already org-scoped via the Supabase JWT.
- Branding fetch degrades gracefully: if the user's role doesn't allow `GET /settings/branding`, BrandingProvider catches the 403 and falls back to default navy `#1D4ED8` + sky `#0EA5E9` (consistent with the existing `getOrgBranding()` fallback in `nmt-analytics-api/src/lib/orgBranding.ts`).
- The portal deliberately reuses the existing auth backend rather than introducing portal-specific roles — Sprint 3 is "demo-able customer-facing surface", not a separate auth realm.
- Single, brand-tinted visual language across all 6 pages — brand color is applied via inline styles (not Tailwind classes) so the runtime brand fetch drives the entire look without a build step.

## Verification

- `npx tsc --noEmit` — 0 errors.
- `npx vite build` — passes; `PortalLayout-*.js` chunk produced (9.95 kB / 3.02 kB gzip).
- Runtime: hit `/portal` on `vite preview` → AuthGuard correctly bounces unauthenticated users to `/signin`; route mounting verified.
- Build artifacts: `dist/assets/PortalLayout-*.js`, no missing-export warnings.

## What is NOT in Sprint 3

Items deferred per `TRAVLINE_FINAL_PLAN.md` §7 and the owner's "do not build yet" directive:
- Customer signup/payment flow (Sprint 4 — Stripe, optional, after first paying client).
- AI chatbot, reseller dashboard, bus visual seat map, mobile app.

## Open carryovers

- **F-2** — rotate the Supabase `service_role` key in the dashboard and update Zo secret `TRAVLINE_SUPABASE_SERVICE_ROLE_KEY`. Owner action (Ismail). Unchanged from prior sprints.
