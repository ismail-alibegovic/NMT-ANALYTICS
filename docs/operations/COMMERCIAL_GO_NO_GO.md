# Travline commercial release decision

Date: 2026-10-25. **NO-GO**. Scope: real agency daily operations, not a competition/demo. Evidence must be refreshed at each release candidate; tests/builds alone cannot authorize GO.

| Category | Evidence / limitation | Decision |
| --- | --- | --- |
| Completed merged code | Main e88ccb29179b5cd976eb4177bc9eac09afe954f4; PRs #151–#164 merged. Reservation transactional/resource/financial guards, Node 24 and prior BS/EN sales work retained. #163 exact-head API/admin/migration/authenticated CI passed. | Reusable baseline, not full commercial acceptance |
| New critical repair | Public signup service-role tenant rename and swallowed bootstrap failures reproduced. API/INSERT-trigger repair merged #164 after CI 40209105582 and isolated acceptance 40209105574 passed. Actual hosted rollout remains separately unverified. | Application repair verified; hosted verification pending |
| Dependency security | Fresh API production audit: 3 high (body-parser/multer/zod); admin: 1 high (zod), 0 critical in either. Compatible patch and resource/startup regression batch is active; prepared audits are zero, final-head verification still required. | OPEN P0 security gate |
| Infrastructure | No current commercial destination/configuration/catalog parity, operational monitoring receipt, hosted backup/PITR/object restore or measured RPO/RTO verified. Isolated replay/recovery is not hosted certification. | NO-GO |
| Existing business workflows | Representative synthetic acceptance exists; full module/state/role coverage, provider-disabled core finance, administration and first-agency/staff lifecycle still require recorded outcomes. | INCOMPLETE P1/P5 |
| Language / usability | Completed sales/locale changes retained; remaining grouped BS/EN inventory, responsive/accessibility/theme matrix unfinished. | INCOMPLETE P2/P3 |
| Deferred integrations | SMTP, SMS, gateways, client payment integrations, optional external integrations and competition demo intentionally deferred. No activation performed. Internal finance is **not** deferred. Real Auth message delivery remains an explicit account-access limitation. | Excluded only where supported core workflows remain safe and usable |

Operational requirements: named host/operator and approved exact environment; migration/catalog preflight and reviewed rollout; recoverable DB/object/config backups and isolated restoration; agreed/measured recovery objectives; actual health/log/alert evidence; secure usable onboarding/staff revocation/recovery; final supported-workflow acceptance. See [commercial operations](commercial-release.md) and [master roadmap](../TRAVLINE_FINAL_ROADMAP.md).

No real production/customer writes, hosted migrations, provider activation or secrets are part of this work. A future GO must link the immutable merged SHA and actual target evidence, list intentionally excluded integrations and remaining non-critical limitations, and name who accepts the operational readiness decision.
