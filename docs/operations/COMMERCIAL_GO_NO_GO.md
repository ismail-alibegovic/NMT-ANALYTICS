# Travline commercial release decision

Date: 2026-10-25. **NO-GO**. Scope: real agency daily operations, not a competition/demo. Evidence must be refreshed at each release candidate; tests/builds alone cannot authorize GO.

| Category | Evidence / limitation | Decision |
| --- | --- | --- |
| Completed merged code | Main a62122637b56208964d211d8f7e54c2f0845925c; PRs #151–#166 merged. Reservation transactional/resource/financial guards, Node 24 and prior BS/EN sales work retained. #163 exact-head API/admin/migration/authenticated CI passed. | Reusable baseline, not full commercial acceptance |
| New critical repair | Public signup service-role tenant rename and swallowed bootstrap failures reproduced. API/INSERT-trigger repair merged #164 after CI 40209105582 and isolated acceptance 40209105574 passed. Actual hosted rollout remains separately unverified. | Application repair verified; hosted verification pending |
| Dependency security | Body-parser/multer/Zod repaired in merged #165; API/admin complete and production audits report zero advisories, with enforced CI high/critical production gates. | Dependency patch verified at #165 head |
| Organization controls | Invalid settings/partial schema saves, tenant self-awarded entitlements and unsafe failed-read editing reproduced; repair merged #166 after CI 40215344251 and isolated acceptance 40215344250; expanded real Auth/settings persistence passed. | Application boundary verified; P5 operator workflow remains open |
| Infrastructure | No current commercial destination/configuration/catalog parity, operational monitoring receipt, hosted backup/PITR/object restore or measured RPO/RTO verified. Isolated replay/recovery is not hosted certification. | NO-GO |
| Existing business workflows | Representative synthetic acceptance exists; full module/state/role coverage, provider-disabled core finance, administration and first-agency/staff lifecycle still require recorded outcomes. | INCOMPLETE P1/P5 |
| Language / usability | Completed sales/locale changes retained; remaining grouped BS/EN inventory, responsive/accessibility/theme matrix unfinished. | INCOMPLETE P2/P3 |
| Deferred integrations | SMTP, SMS, gateways, client payment integrations, optional external integrations and competition demo intentionally deferred. No activation performed. Internal finance is **not** deferred. Real Auth message delivery remains an explicit account-access limitation. | Excluded only where supported core workflows remain safe and usable |

Operational requirements: named host/operator and approved exact environment; migration/catalog preflight and reviewed rollout; recoverable DB/object/config backups and isolated restoration; agreed/measured recovery objectives; actual health/log/alert evidence; secure usable onboarding/staff revocation/recovery; final supported-workflow acceptance. See [commercial operations](commercial-release.md) and [master roadmap](../TRAVLINE_FINAL_ROADMAP.md).

No real production/customer writes, hosted migrations, provider activation or secrets are part of this work. A future GO must link the immutable merged SHA and actual target evidence, list intentionally excluded integrations and remaining non-critical limitations, and name who accepts the operational readiness decision.

Document template read/persistence/concurrency defects are the active P1 repair. Reused executed business acceptance and remaining gaps are mapped in [commercial workflow coverage](commercial-workflow-coverage.md); route renders are not promoted to workflow completion.
