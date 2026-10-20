# Waiver consent audit

Verification status is recorded for the final head in PR #140 and its CI artifacts. This file describes coverage and rollout limits; it is not a stand-alone release certificate.

| Confirmed defect | Repair | Required evidence |
| --- | --- | --- |
| Generated public link truncated a token whose hash covered all 48 hex characters | Return the complete 192-bit token at the mounted `/waiver/:token` route; store only its SHA-256 hash | Issued link resolves; truncated link returns 404; history omits token/hash/link |
| API columns, template `body_text`, frontend routes/payload and stored schema disagreed | Alias existing template body, add consent snapshots/state in an append-only migration, align issuer/public UI and API | Migration Replay; template edit/reload; real issue/sign/PDF flow |
| Duplicate issue requests and concurrent signatures could corrupt workflow state | Partial unique index for pending links; scoped CAS for sign/revoke; existing single-use/revocation guards retained | Concurrent issue gives one 201 and one 409; sign gives one 200 and one 409; revoke/sign race has one winner |
| Required declaration snapshots and passenger consent state were not persisted consistently | Validate snapshotted declarations; transaction trigger synchronizes passenger consent and public SIGN audit | Missing declaration 400; persisted signer matches race winner; trigger/audit/PNG invariant SQL |
| Public SIGN audit used a non-UUID actor and could be dropped | Insert a null-user public-capability audit in the same transaction as signing | At least one matching SIGN audit for each signed synthetic consent |
| Issuer page was unmounted and controls used broken endpoints; failed signing removed drafts | Protected manager page, role floor and reachable excursion action; preserve form/drawing after failed save; typed-name keyboard path | Role route regressions; BS/EN browser workflows at 390/768/1440 in both themes |
| Capability URLs leaked into request logs and telemetry URL paths | Redact consent path capabilities; no-store API and no-referrer signing page | API/admin telemetry regressions and actual access-log test |

## Security boundaries

Template mutation is Manager/Director. Existing Agent/Manager/Director issuance, status, revocation and consent PDF access remain organization-scoped on the API; the manager page is an additional UI gate. Public signing is a bearer-capability action, not an authenticated tenant operation. An explicitly shared live link authorizes its holder; a foreign tenant session alone does not grant access to protected issuer records or files. New route entries join the mounted-route denial matrix.

The raw token is returned only when issued. Pending links cannot be recovered from history; users must revoke and explicitly reissue a lost link. Signed snapshots remain independent from template editing. Signed links cannot be treated as unused links for revocation.

## Limits and production prerequisites

Only disposable local Supabase is used by acceptance and invariant SQL. No production financial record or migration is modified. Legacy unsigned links lacking historical snapshots are revoked when the new migration is eventually applied; consumed legacy history is preserved and missing historical terms are reported as unavailable rather than fabricated. New composite foreign keys are NOT VALID for legacy history and still enforce new writes. Production migration parity, historical reference validation, provider activation and deployment readiness have separate status; SMTP/SMS/Auth-email activation remains postponed by user instruction.

Initial screen inventories and automated screenshots do not constitute manual visual inspection or certify every portal/form workflow. Full release GO requires the remaining production and release checks.
