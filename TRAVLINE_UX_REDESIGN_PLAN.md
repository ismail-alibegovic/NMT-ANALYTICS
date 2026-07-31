# Travline — UX Redesign Plan (HISTORICAL — REVERTED, DO NOT EXECUTE AS-IS)

**Status:** historical · **Created:** 2026-07-31 · **Reverted:** 2026-08-01 (`4c78367`)

> Passes A, B and C were implemented (`4d63aac`, `8f625fe`, `818d76c`, `e7a0bd3`) and then fully reverted. Ismail's verdict: the layout came out broken — misaligned, badly spaced, numbers wrong. The mechanical all-pages-at-once approach is the root cause: `tsc` and `vite build` stayed green the whole time while the visual result regressed, so nothing caught it.
>
> If UX work resumes, ignore the batching in this document. One page at a time, screenshot the real page before and after, get approval before moving on.

**Hard constraint:** the visual language does not change. Same `brand-500` (`#465fff`), same Outfit type, same `rounded-2xl` panels, same dark-mode surfaces (`dark:bg-white/[0.02]`, `dark:border-white/[0.07]`), same 20/24px panel padding. This is a **structure + interaction** plan, not a restyle. Every pass below is mechanical and independently shippable.

**Protected behavior — do not break:**
- Contextual sidebar scoping (`scopeFromPath`, all-groups-visible rendering) works as documented in `AGENTS.md`.
- Role gating everywhere (`hasAccess`, `minRole` on nav items, finance panels hidden below `manager`).
- `/portal/*` is a separate surface with its own layout — **out of scope for all passes here.**
- i18n: every new string goes in both `src/lib/i18n/bs.ts` and `en.ts`. No hardcoded Bosnian or English in JSX.
- `PageToolbar`'s existing `hideSearch` contract and all current call sites.

---

## Why: what's actually wrong

Measured against the real files, not vibes:

1. **No page shell.** 20 list/detail pages each hand-roll their header. 12 use `PageToolbar`, 8 don't (`AuditLogs`, `Reports`, `Settings`, `UnifiedPayments`, `Waivers`, `PdfTemplateEditor`, `Dashboard/Home`, + `Documents` which additionally still renders a redundant `PageBreadCrumb`). Corner radii drift page to page: `Reports` and `Availability` use `rounded-xl`, `UnifiedPayments` uses `rounded-2xl`, several use neither. Result: every page feels like a different app.
2. **`DataTable` sorting is fake.** `Column<T>` declares `sortable?: boolean` and **zero** call sites pass it, because `DataTable` never implements it. Dead API surface. Users cannot sort a single table in the product.
3. **Rows aren't clickable.** `DataTable` has no `onRowClick`. Navigating to a reservation or departure means finding the small action button in the last column. This is the single highest-frequency interaction in the app.
4. **HomeHub answers the wrong question.** It shows 4 KPIs, upcoming departures, outstanding balances, workspace links, 6 shortcuts — a *status board*. An agent opening the app needs a *worklist*: what is overdue, what departs in 48h that is under-filled, what payment is late. The data for all three is already fetched or one call away.
5. **HomeHub time range is hardcoded.** `fortnightAgo` (14 days) is a literal in the effect. No way to look at this month or this quarter.
6. **Filter state is lost on refresh.** Only 5 of 20 pages use `useQueryParams`. On the other 15, a refresh or a back-button press wipes the search term, page number, and filters.
7. **Loading states are inconsistent.** `Skeleton` / `PageSkeleton` exist and are used only by the three portal pages. Admin pages show either nothing, a spinner, or a bare `…`.

---

## Pass A — `PageShell`: one page frame, twenty pages

**Goal:** every admin/ops page gets an identical outer frame, so density, max-width, and header rhythm stop drifting.

New file: `nmt-analytics-admin/src/components/common/PageShell.tsx`

```tsx
interface PageShellProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;      // right-aligned buttons
  stats?: ReactNode;        // optional summary-card row under the header
  children: ReactNode;
}
```

Internals — lifted verbatim from `HomeHub`'s existing masthead so it matches by construction:
- `mx-auto w-full max-w-[1240px] px-4 pb-24 pt-9 md:px-8 md:pt-12`
- Title: `text-[1.75rem] font-semibold leading-[1.05] tracking-tight` (one step down from HomeHub's `2rem`, since these are sub-pages)
- Subtitle: `mt-2 text-sm text-gray-500 dark:text-gray-400`
- Header is `flex flex-col gap-6 md:flex-row md:items-end md:justify-between`, `mb-8`
- Also export `Panel` (`rounded-2xl border border-gray-200/70 bg-white p-6 shadow-sm shadow-gray-200/40 dark:border-white/[0.07] dark:bg-white/[0.02] dark:shadow-none`) and `SectionLabel`, **moved out of `HomeHub.tsx`** and re-imported there. One definition, two consumers.

Migration order — 3 pages, verify, then the rest:
1. `admin/Customers.tsx`, `Reservations.tsx`, `admin/Departures.tsx` (the three highest-traffic pages, all already on `PageToolbar`)
2. Then the remaining 9 `PageToolbar` pages (`Packages`, `Documents`, `Integrations`, `Availability`, `Calendar`, `CommissionRules`, `Contracts`, `Excursions`, `Hotels`, `Receipts`, `SubAgents`)
3. Then the 8 with no toolbar (`AuditLogs`, `Reports`, `Settings`, `UnifiedPayments`, `Waivers`, `PdfTemplateEditor`)

`PageToolbar` stays exactly as it is and renders *inside* `PageShell` — do not merge them. Toolbar = filters; Shell = frame. Delete the leftover `PageBreadCrumb` from `Documents.tsx` while migrating it.

**Done when:** all 20 pages render through `PageShell`, `grep -c "rounded-xl" ` on page files shows no card-level use (only inputs/buttons keep `rounded-xl`), `tsc --noEmit` clean, and a screenshot of Customers / Reports / UnifiedPayments side by side shows identical header rhythm.

---

## Pass B — `DataTable`: real sorting, clickable rows, honest loading

**Goal:** make the table the workhorse it pretends to be. One file, every table benefits.

`nmt-analytics-admin/src/components/ui/DataTable.tsx`:

1. **Implement `sortable`.** Add `sortKey`/`sortDir` + `onSortChange` props. Sortable headers become buttons with an inline chevron that rotates on `asc`/`desc`, using the existing `text-brand-500` active treatment. Two modes so migration is incremental:
   - uncontrolled (default): sorts `data` client-side via a `useMemo` comparator — numbers numeric, strings `localeCompare` with the active locale (`bs` collation matters: č, ć, š, ž, đ)
   - controlled: when `onSortChange` is supplied, `DataTable` emits and the page owns the sort (for server-side paginated lists)
2. **`onRowClick?: (item: T) => void`.** When set, rows get `cursor-pointer hover:bg-gray-50 dark:hover:bg-white/[0.03]`, `role="button"`, `tabIndex={0}`, and Enter/Space activation. Action-column buttons must call `e.stopPropagation()` — audit every existing action cell when wiring this, or clicking "Delete" will also navigate.
3. **`skeletonRows?: number`** (default 5). Replaces the current loading branch with real `Skeleton` rows matching the column count, so `Skeleton`/`PageSkeleton` stop being portal-only.
4. **`stickyHeader?: boolean`** — `sticky top-0 z-10` + panel background. For `AuditLogs` (15/page) and passenger manifests.

Then wire the first consumers: `sortable: true` on the obvious columns (name, date, amount, status) in `Customers`, `Reservations`, `Departures`, `UnifiedPayments`, `AuditLogs`; `onRowClick` → `navigate(...)` on `Reservations` (→ `/reservations/:id`), `Departures` (→ `/departures/:id`), `Customers` (→ `/customers/:id`).

**Done when:** clicking a header sorts, clicking a row navigates, clicking a row's action button does *not* navigate, loading shows skeleton rows, and `tsc --noEmit` is clean.

---

## Pass C — HomeHub: from status board to worklist

**Goal:** the first screen tells you what to *do*, not just how things are. Keep the existing layout skeleton (masthead + 2-col + right rail) and the existing `Panel`/`KpiCard`/`AreaChart`/`MiniSpark` components. This is a content and priority change.

1. **New "Treba pažnju" / "Needs attention" panel**, top of the left column, above upcoming departures. Merges three signals into one ranked list, max 6 rows, each row a link:
   - departures inside 48h under 60% filled → `/departures/:id` (data already in the `getDepartures` call)
   - reservations with `balanceDue > 0` and `daysOpen > 14` → `/reservations/:id` (already computed as `watchPayments`; currently unranked and buried in the right rail)
   - departures at 100% with a waitlist signal → `/departures/:id`
   Row shape reuses the existing outstanding-balance row markup: `size-9 rounded-xl` icon tile, title + muted subtitle, right-aligned value. Severity via the icon tile's border/bg only — `amber` for warning, `red-500/[0.08]` for urgent — no new colors beyond the palette already in the file.
   Empty state is a real one, not `…`: "Sve pod kontrolom" + a check icon, in the existing dashed-border `rounded-xl` treatment.
2. **Range control in the masthead.** Replace the hardcoded `fortnightAgo` with a small segmented control: `7d · 30d · 90d` (default 30d, matching `Reports`). Lives right of the greeting, left of the "Nova rezervacija" button. Persist the choice to `localStorage` under `travline.hub.range` and pass it into `getAnalyticsOverviewV2` / `getRevenueSeries`. New i18n keys: `hub.range7`, `hub.range30`, `hub.range90`.
3. **Demote what's redundant.** With the attention panel carrying outstanding balances, the right-rail "Outstanding" panel collapses into a 2-line summary (count + total, linking to `/payments`). The 6-tile "Shortcuts" grid drops to 4 — `Reservations`, `Calendar`, `Customers`, `Reports` — since Packages and Branding are one sidebar click away.
4. **Skeletons, not `…`.** The three `…` placeholders become `Skeleton` rows.

**Done when:** an agent account and a director account both load the hub, the attention panel ranks correctly for each role (agents see no finance rows), the range control refetches, and the choice survives a reload.

---

## Pass D — URL as state (15 pages)

**Goal:** refresh, back-button, and shared links all work. `useQueryParams` already exists and is proven on 5 pages — extend it, don't rewrite it.

Standard param contract, identical on every page: `?q=` search · `?page=` · `?sort=` + `?dir=` · one `?<name>=` per filter dropdown.

Apply to the 15 pages currently holding filter state in bare `useState`. Read params on mount into initial state, write on change, debounce `q` at the existing 300ms. Then every table filter/sort/page becomes a shareable link — which also makes the ⌘K palette's deep links land on pre-filtered views.

**Done when:** on each migrated page, setting a filter + refreshing preserves it, and the browser back button steps through filter states.

---

## Pass E — Workflow shortcuts

**Goal:** shave clicks off the loops agents run dozens of times a day.

1. **`n` opens Nova prodaja** from anywhere (skip when focus is in an input/textarea/contenteditable — same guard style as the existing ⌘K handler in `AppHeader`).
2. **⌘K gets actions, not just records.** Add a static "Akcije" group at the top: Nova rezervacija, Novi klijent, Novi paket, Kalendar. Currently the palette only finds existing records, so creating something still means navigating.
3. **Recents in ⌘K.** Last 5 visited records from `localStorage`, shown when the query is empty — instead of today's blank panel.
4. **Detail-page keyboard nav.** On `/departures/:id` and `/reservations/:id`, `j`/`k` or `[`/`]` move to prev/next record in the last list result. Store the id list in `sessionStorage` when a list page loads.
5. **Bulk select on Reservations.** Checkbox column + a sticky action bar (confirm / cancel / export selected). The single-row inline confirm/cancel from Sprint 1 already exists — this is the same call in a loop with one confirmation dialog.

**Done when:** `n` opens the wizard from every page but never while typing, ⌘K offers actions and recents, and bulk confirm on 3 selected reservations issues 3 status updates with one confirm.

---

## Sequencing and verification

Run in order — A unblocks C (shared `Panel`), B unblocks D (sort params need a sort implementation).

| Pass | Scope | Risk |
|---|---|---|
| A — PageShell | 1 new file, 20 page edits | low, purely presentational |
| B — DataTable | 1 file + ~6 consumers | medium — `stopPropagation` audit on every action cell |
| C — HomeHub | 1 file | low, self-contained |
| D — URL state | 15 pages | low, additive |
| E — Shortcuts | header, palette, 2 detail pages, Reservations | medium — global key handlers need input guards |

Every pass ends with: `npx tsc --noEmit` in `nmt-analytics-admin` (0 errors), `npx vite build`, a screenshot check in both light and dark mode, and a focused commit. No pass gets merged on a build warning.
