# PR #140 final integration evidence and release limits

Branch: `fix/ui-audit-integration`. Final commit-specific checks, acceptance counts and merge SHA belong in PR #140's final report; this document does not certify a future head.

## Failed acceptance run 39497125071

The original run finished with 149 passed, 7 failed and 12 not run. Logs, error-context snapshots, screenshots and traces were inspected before the corrections.

| Failed scenario | Root cause | Correction |
| --- | --- | --- |
| Mobile layout light 390 | Manager account was redirected from director-only commission rules to dashboard | Keep manager card/reservation scenarios; exercise commission preview in a separate authenticated director case |
| Mobile layout light 768 | Same authorization-fixture error | Same correction; retain viewport bounds, calculation and theme assertions |
| Mobile layout light 1440 | Same authorization-fixture error | Same correction |
| Mobile layout dark 390 | Same authorization-fixture error | Same correction |
| Mobile layout dark 768 | Same authorization-fixture error | Same correction |
| Mobile layout dark 1440 | Same authorization-fixture error | Same correction |
| Consent editing/issuing EN light 390 | Implicit select label included option text, preventing exact `getByLabel('Departure')` resolution despite the populated visible control | Separate explicit label/ID associations for departure and passenger; retain exact labels and persisted option selection |

A real Chromium reproduction returned zero exact label matches for the old nested select and one for the corrected association. The new isolated form regression covers populated selects and failed-issue input retention in BS/EN, both themes and 390/768/1440. No timeout increase, assertion removal or authorization relaxation was used. The consent suite's serial mode explains the twelve downstream scenarios not run after its first failure.

## Reconciliation of #120–#126

- #120: modal focus containment/restoration, bounded scrolling, non-submit localized close, topmost Escape and shared scroll lock are retained alongside newer `scrollable`/`closeLabel` support.
- #121: authenticated sale matrix and initial route inventory are included. Route rendering is not full workflow certification.
- #122: native-control theme CSS is identical to the audited fix.
- #123: customer API and customer page repairs are identical; current FormModal, Input and Select retain newer validation, submit locks, accessible errors and failed-save recovery rather than replacing them with old versions.
- #124: timezone helper is identical; current departure form additionally preserves unchanged instant/subsecond/DST-fold values, validation, pending-close protection and failed-save recovery.
- #125: itinerary/quotation and commission layout repairs are identical; reservation layout retains newer payment authorization checks.
- #126: current isolated director fixture and director route inventory cover the restricted screens, using the newer synthetic finance director rather than restoring an obsolete seed.

Do not merge the older audit branches independently. No bus seat map implementation or design was changed. Finance, Flight, Rooming and Security implementations are not replaced by old audit versions.

## Dependency security findings

An additional runtime-only npm audit found 8 API advisories (including one critical) and 3 high Admin advisories. Targeted locked updates address axios, follow-redirects, brace-expansion, qs, proxy-addr, ip-address, multer, react-router and their immediate dependencies. Nodemailer requires the patched major version and is pinned to 10.1.7; keep SMTP configuration/delivery/tenant isolation regressions and isolated Mailpit acceptance mandatory. Provider activation remains postponed. A package advisory is not by itself evidence of a reachable exploit in Travline.

## Read-only production findings on 2026-10-21

- Vercel project `travline`, team `team_4DKcC9xTucEHjGcIInAR7Y7o`: initial active production deployment `dpl_CJhSH4J1QtR8jpxV7fBo6gekaAr4`, READY at main `3a6cdf68714e8ad239560062c11cdaaa16a0c93f`. Recheck deployment after merge; READY does not establish database compatibility.
- `/api/health` returned 200 with database connected, development auth bypass disabled and no development organization override. Sentry was disabled. Email provider was unconfigured, as postponed.
- Protected `/api/me/context` could not be inspected through the connector's Vercel share-link authentication (401 at deployment protection). This is not evidence of an application authorization defect or of a successful production auth flow.
- Supabase `hacutwknfgufrqlgdiia` is ACTIVE_HEALTHY. Exact version-set comparison: repository 114, production 110, zero unexpected production versions. Missing versions: `20261016000000`, `20261016110719`, `20261020125419`, `20261020201438`.
- All 74 production public base tables have RLS enabled. No direct anon/authenticated SELECT/INSERT/UPDATE/DELETE table grants were found, consistent with API-only access; policy correctness and live tenant workflows still require verification.
- Production advisors still flag mutable function search_path, browser EXECUTE on the SECURITY DEFINER trigger function `recompute_group_member_count`, and disabled leaked-password protection. Pending migration `20261016110719` contains the reviewed function ACL/search_path repair; do not claim production is hardened before deployment and verification.
- 45 production migration records lack usable archived SQL. Version identity comparison alone does not prove historical SQL-body/schema equality.
- No error/fatal runtime log entries were returned for the queried recent 30-minute window. Wider log retention was unavailable; drain discovery returned 404. These results do not establish monitoring/alert coverage.
- Backup existence/retention, PITR availability, isolated restore rehearsal, measured RPO/RTO, secondary-runtime compatibility and production booking/finance/authenticated tenant workflows remain NOT VERIFIED. Existing recovery work is tracked by #110; #118 contains older release documentation and must not be treated as a current certificate.

No production DDL/DML, real customer/payment mutation or provider activation was performed. A merge integrates code; it does not authorize applying these production migrations. Release remains **NO-GO** until schema/ACL parity, recovery, monitoring and production critical-workflow evidence are resolved. SMTP/SMS/Auth-email activation is deliberately deferred and is not required for the isolated provider-readiness checks.
