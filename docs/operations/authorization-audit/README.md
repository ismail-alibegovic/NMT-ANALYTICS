# Authorization and tenant isolation audit

Scope: Director, Manager and Agent, based on main `63f0e87ddcdc0836339c8afb23b33a191ccc2b4b`. Branch: `audit/authorization-tenant-isolation`. This is a source and isolated synthetic acceptance audit, not a production penetration test. No production financial records, credentials, infrastructure or deployment state are changed.

## Boundaries and policy

Staff identity and organization come from a verified Auth token and its server-loaded profile. Caller role/org headers are ignored. Unknown roles and missing organizations fail closed. The actual route middleware is the role contract: Manager can operate payments/refunds, reports and private documents; Director manages settings, audit and commission rules; Agent retains customer/booking operations and booking balances. Existing dashboard aggregates are available to Agent by the established dashboard:read policy. Tenant identity is never a cross-tenant administration override, even for Director.

Public signup/check-org, configured public booking forms, waiver links and sub-agent tokens are separate trust realms. Legacy hotel stock mutation and unpublished hotel catalog routes are retired with 410. Existing configured public booking forms and widget remain supported. Internal job routes use their existing service-secret validation (covered by cronScheduler tests); the three `router.route().all` cron handlers (GET/POST each) are audited separately from the router-method inventory.

Client business data is API-only. Browser Auth/session remains Supabase; self-profile now uses an explicit API. The new migration revokes browser table/column access rather than depending on RLS alone. Existing RLS and privileged function restrictions remain. Some earlier SECURITY DEFINER helper revocations already prevented specific direct RLS paths; a broad grant alone is not evidence that every table was exploitable before this patch.

## Findings, fixes and falsifiable evidence

| ID | Confirmed boundary gap | Fix | Regression evidence |
|---|---|---|---|
| A01 | Reports/payments router-wide middleware intercepted unrelated mounted modules. Financial export, analytics and document reads depended on this accidental protection, while isolated route requests reached their handlers as Agent. Commission read lacked Director enforcement. | Scope middleware to its route prefix; add explicit role floors on each sensitive read; isolate notification/history middleware so public tokens do not inherit staff requirements. | authorizationBoundaryAudit: 12 cases failed against baseline (handler reached / 500 or legacy mutation attempted), then pass. Real mounted-route denial matrix covers anonymous and every disallowed role. |
| A02 | Browser table grants left an alternate data plane outside Express role/mutation validation; Profile directly updated the profiles table. | Revoke public non-extension table and column privileges from PUBLIC/anon/authenticated, preserve service_role and RLS; strict GET/PATCH me/profile permits only own full_name and scopes id+org. | Rollback-only authorization-security.sql checks every relation and executes forbidden statements as both database roles. profileAuthorization tests reject id/org/role/email mass assignment and concurrent escalation. Real Data API requests verify denials and authorized profile persistence. |
| A03 | Private document Storage could bypass Express roles; a tenant-owned document row could point at another tenant's Storage prefix. | Restrictive documents bucket policy; mark existing bucket private; validate org prefix before API download/delete. | documentDeletionRecovery rejects forged foreign paths for GET and DELETE before any Storage action, preserves failed-delete recovery. Real Storage authenticated/public URLs deny access; permitted API download preserves bytes; cross-tenant GET/DELETE denied. |
| A04 | Anonymous legacy hotel booking ignored organization and performed availability mutation without canonical booking/atomic flow. Hotel catalog had no explicit publication permission. | Retire both legacy routes with 410 and no database access. Keep configured canonical public forms. | Concurrent anonymous calls all return 410 without reaching DB; existing public-form acceptance retains supported booking behavior. |
| A05 | Reservation/inquiry assignee IDs could reference a profile outside authenticated org; secondary enrichment/room queries lacked explicit org predicates. | Validate assignee membership before writes/capacity work; scope departure profile/payment enrichment and accommodation room queries to org. | Real requests use an owned departure with foreign assignee, distinct from foreign-departure tests. Existing accommodation/move and booking suites plus cross-tenant record tests preserve supported workflows. |
| A06 | Invalid stored roles could proceed through authentication, and raw database diagnostics were returned to clients. | Reject invalid auth context; keep SQL details/hints/row values in server logs, normalize missing rows to 404. | authContextAudit tests invalid profiles/token and spoofed headers; databaseErrorExposure verifies exact sanitized responses. |
| A07 | Some direct UI routes lacked explicit role floors; ModuleGuard mounted protected children while loading; Agent reservation screen offered financial writes. | Add route floors matching server, wait for entitlement context, disable Agent payment/invoice actions while preserving booking balances. | routeAuthorizationAudit covers 3 roles and 12 protected paths, sales access, invalid role and loading gate. ReservationDetail test covers Agent controls. Three real browser role/profile workflows attach screenshots. |
| A08 | Waiver token reads ignored revoked_at/consumed_at and signing used a read-then-unconditional-write, permitting signature overwrite on a compatible deployed schema. | Deny revoked/consumed capabilities; compare status, organization, expiry and revocation/consumption at update time, with one conditional winner. | waiverAuthorizationAudit: baseline revoked-token GET returned 200; four regression cases now pass, covering concurrent signatures and revocation between read/write. Actual positive waiver acceptance is blocked by existing schema drift below. |

## Tenant and concurrency verification

The real security suite creates synthetic records in two organizations and tests Director/Manager/Agent requests against foreign customers, packages, departures, reservations, payments, suppliers, hotels, flights and documents. It tests foreign reads, writes, file deletion, list search and forged assignments. Concurrent duplicate payments have one creation plus replay; concurrent refunds have one winner; simultaneous foreign-tenant requests cannot affect the target ledger. Profile name updates race with escalation attempts without changing role/org. Existing authenticated acceptance includes booking capacity, rooming, flight, public forms, reports, expenses, supplier payables, receipts, duplicate prevention and failed-save recovery.

Parent-derived queries without a tenant column (for example passenger-group links) are authorized through a previously org-scoped parent and existing composite database relationships. Secondary tables that have org_id retain explicit predicates. No tenant policies, composite constraints, audit logs or protected CI checks are disabled.

## Coverage ledger

The machine-readable [routes.json](routes.json) lists mounted router.get/post/put/patch/delete method/path declarations, source module/line, authentication realm and Director/Manager/Agent role floor. Regenerate with `node scripts/security-route-inventory.cjs`. Source permission allows are not a claim that every valid workflow was browser-tested. The real denial matrix attaches actual statuses for all staff routes and every disallowed role; positive workflow checks use existing acceptance scenarios and the new role/profile tests. Public/token paths are reviewed separately; public forms have real acceptance, while waiver revocation/concurrency uses a focused route harness as noted below.

Inventory: 327 endpoints; 60 modules; 13 public, 311 staff, 3 subagent-token. No unclassified literal routes.

| Module | Endpoints | Realms | Staff role floors |
|---|---:|---|---|
| accommodation | 13 | staff | agent, manager |
| admin | 3 | staff | director, super_admin |
| ai | 3 | staff | viewer |
| analytics | 10 | staff | manager, viewer |
| automationRules | 6 | staff | director |
| availability | 1 | staff | agent |
| calendar | 1 | staff | agent |
| campaigns | 11 | staff | director |
| commissionRules | 5 | staff | director |
| communicationHistory | 2 | staff | viewer |
| communicationSend | 2 | staff | agent |
| contracts | 6 | staff | agent |
| customers | 6 | staff | agent, viewer |
| departureDocuments | 7 | staff | agent |
| departurePassengers | 6 | staff | agent, manager, viewer |
| departureProfitability | 4 | staff | manager |
| departures | 15 | staff | agent, manager, viewer |
| documents | 6 | staff | manager |
| emailSettings | 4 | staff | director |
| eturista | 3 | staff | manager, viewer |
| excursions | 7 | staff | agent, manager, viewer |
| export | 6 | staff | manager, viewer |
| flights | 10 | staff | agent, manager |
| health | 1 | public | token/public |
| hotels | 9 | public, staff | manager, viewer |
| import | 3 | staff | manager |
| inquiries | 4 | staff | agent, viewer |
| installments | 2 | staff | agent |
| itineraries | 8 | staff | agent, viewer |
| me | 4 | staff | viewer |
| messageTemplates | 6 | staff | director |
| metrics | 2 | staff | viewer |
| notifications | 4 | staff | viewer |
| onboarding | 8 | staff | director |
| packageCosting | 4 | staff | manager |
| packageHotels | 5 | staff | manager, viewer |
| packageServices | 4 | staff | manager, viewer |
| packages | 7 | staff | manager, viewer |
| passengerGroups | 7 | staff | agent, manager |
| paylinks | 2 | staff | agent |
| payments | 6 | staff | manager |
| public | 5 | public | token/public |
| publicForms | 8 | public, staff | manager, viewer |
| quotationBooking | 2 | staff | agent |
| quotations | 8 | staff | agent, viewer |
| receipts | 7 | staff | manager |
| reports | 3 | staff | manager |
| reservations | 14 | staff | agent, manager, viewer |
| rooming | 2 | staff | manager |
| seats | 5 | staff | manager |
| settings | 10 | staff | director |
| signup | 2 | public | token/public |
| smsSettings | 3 | staff | director |
| subAgentPortal | 5 | staff, subagent-token | director |
| subagents | 5 | staff | director, manager |
| supplierConfirmations | 3 | staff | manager |
| supplierPayables | 5 | staff | manager |
| suppliers | 5 | staff | agent, viewer |
| transactions | 2 | staff | manager |
| waivers | 10 | public, staff | agent, manager |

Internal cron handlers add six GET/POST method combinations in the internal module; their service-secret checks, disabled/unconfigured failures and execution guards are covered by existing cronScheduler tests. They are not staff routes and never accept a staff role as a scheduler credential.

## Existing waiver workflow blocker

`waivers.ts` expects `waiver_templates.body_text` and waiver token snapshot/status/signature columns that are absent from the repository migration history (`20260711220000_passenger_waivers.sql` defines `body`, `revoked_at` and `consumed_at`). It also formats/truncates issued tokens differently from the raw token hashed for lookup. The current replayed schema fails closed on those queries; positive issuance/signing cannot be certified. This PR fixes the revocation/concurrent-write authorization logic using a deterministic route harness, without inventing or migrating a new waiver data model. Reconcile the existing waiver schema/token contract in a dedicated functional task before enabling or claiming full waiver acceptance. This is an explicit remaining coverage blocker, not a passed workflow or a demonstrated production exploit.

## Verification and release evidence

Local checks and CI results are recorded in the PR. Required gates: Lint & TypeCheck API; Test API; Lint & Build Admin; Test Admin; Migration Replay; Isolated Supabase acceptance. Merge is blocked until all six pass on the final head. Acceptance artifacts contain JUnit, HTML report, JSON endpoint-denial evidence, cross-tenant evidence, Data API denial evidence and browser screenshots. Failed security cases block the required acceptance job.

Migration added: `20261020125419_authorization_api_only_boundary.sql`, append-only, no business-data deletion. It is replayed only in disposable CI databases here. Production application of this migration is not performed or certified by this audit. Deploy the API-backed profile page together with the migration; older frontend clients that directly query tables will intentionally receive access denied. Do not roll back by broadly restoring browser grants. Service-role functions remain server-only. Isolated CI service credentials are never included in report attachments.

Limitations: no production probing, exhaustive fuzzing, external IdP audit, infrastructure/backup audit or third-party penetration test. Allowed-role positive flows are sampled by regression suites, not an exhaustive valid-payload test for all 327 routes. License/plan policy redesign is outside this role/tenant audit; existing entitlement behavior is preserved. Runtime observations are authoritative over source-derived contracts.
