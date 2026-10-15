# M21 — Javna rezervacija i ugradnja na web (Public Booking & Embeds)

**Status:** COMPLETED  
**Priority:** P1  
**Branch:** `feature/public-booking-embed`  
**Roadmap references:** M21 (Public booking), Master Plan 2.0 §18, Phase 13 (T31 Public forms & embeds)

## 1. Goal

Harden and complete the public intake, reservation, and web embed ecosystem for Travline. Make it simple for agencies to share standalone public booking/inquiry forms or embed them seamlessly (via iframe code snippets) into any external website (WordPress, Webflow, custom CMS). Ensure public forms display real-time package context and departure availability where linked, pass proper attribution into inquiries, and provide resilient rate limiting and tenant isolation without bypassing agency review.

## 2. Current problem

1. **Missing Embed Snippet in Forms Admin:** In `/settings/public-forms`, users can copy the direct URL, but there is no dedicated "Embed / Ugradi" action or dialog that generates a copy-pasteable responsive iframe snippet with configurable height/attributes.
2. **Missing Iframe Adaptability & Auto-Resize:** When `/public/forms/:slug` is embedded in an external iframe, there is no `postMessage` protocol for parent height auto-adjustment or submission event handling, and excess padding/backgrounds are not tailored for embedded mode (`?embed=1`).
3. **Missing Package & Availability Context in Public Forms:** `GET /api/public/forms/:slug` only returns form title, description, and fields. Even though `public_forms` supports `package_id` and `departure_id`, the public endpoint does not resolve or return package details, pricing, or upcoming departure capacity.
4. **Duplicate & Broken Legacy Widget Route:** In `public.ts`, a duplicate `GET /public/:orgId/widget` handler at line 15 tries to read `../../public/widget.html` (which lacked org IDs and called nonexistent `/reservations` endpoints), shadowing the working `WIDGET_HTML` generator. In `Integrations.tsx`, the generated iframe embed code uses relative URLs (`/api/public/...`) which fail when embedded on external domains, and copy lacks i18n parity.

## 3. Required discovery before editing

- API: `nmt-analytics-api/src/routes/publicForms.ts`, `publicFormsHandlers.ts`, `public.ts`, `app.ts`.
- Admin: `nmt-analytics-admin/src/pages/PublicFormRenderer.tsx`, `pages/admin/PublicForms.tsx`, `pages/admin/Integrations.tsx`.
- Schema: `public_forms`, `public_form_submissions`, `inquiries`, `departures`, `packages`.
- Existing tests: `publicFormsHandlers.test.ts`, `publicFormsRouting.test.ts`, `publicFormsComponents.test.tsx`.

## 4. In scope

- Add package details & available departure slots to `GET /api/public/forms/:slug` when form is linked to a package or departure.
- Display trip summary and remaining capacity in `PublicFormRenderer.tsx`.
- Support seamless embedded mode (`?embed=1` or iframe detection) with parent `window.postMessage` resize & submit events.
- Add "Embed" action and modal in `PublicForms.tsx` with 1-click copy for responsive iframe embed code and preview.
- Clean up duplicate/broken widget route in `public.ts` and ensure full origin in `Integrations.tsx` embed snippet with full BS/EN i18n parity.
- Unit/component test coverage for all new functionality.

## 5. Out of scope

- Direct online payment gateways (Stripe/Monri) on public forms (covered in separate payment milestone).
- Bypassing inquiry creation for silent automatic seat allocation from public forms without review.

## 6. Verification

- API tests (`npm test` in `nmt-analytics-api`).
- Admin tests, lint, and build (`npm test`, `npm run lint`, `npm run build` in `nmt-analytics-admin`).
