# Pilot production checklist

Run before the first agency pilot and after every production deploy. Everything here is read-only
unless stated. Never paste secrets into tickets or chat; pass them through the environment.

Legend: **Observed** = verified from outside on 2026-10-16. **Inferred** = follows from observed
behaviour plus the code. **Cannot inspect** = needs the owner's Vercel/Supabase/provider access.

## 1. Deployed commit
- Vercel production deployment must be built from the merge commit you intend to ship
  (`vercel ls` or the deployment page shows the commit SHA).
- Observed: production deployed `d5c2fd1` before the release-audit fixes.

## 2. Database migrations (Travline project `hacutwknfgufrqlgdiia` only)
```bash
export TRAVLINE_SUPABASE_MANAGEMENT_TOKEN=...   # personal access token with read access to Travline
python3 nmt-analytics-api/scripts/prod-readiness-check.py migrations
```
Prints `PARITY` or lists migrations missing from / unknown to production. It refuses to run if the
project name is not Travline, issues one `SELECT` on `supabase_migrations.schema_migrations`, and
never prints the token. Apply any missing migrations in order before deploying the code that needs
them; investigate "unknown to repo" entries before changing anything (they may be renamed files).
For a full structural diff use `schema-fingerprint-compare.sh` (needs a replay database).
- Cannot inspect from the audit environment: this has not been run against production.

## 3. Platform health
```bash
python3 nmt-analytics-api/scripts/prod-readiness-check.py health https://<production-host>
```
- Observed: `database: connected`, `devBypassEnabled: false`, `sentryEnabled: false`,
  `emailProviderConfigured` not reported (deployed build predates the fail-closed email change).

## 4. Email (SMTP)
- Per-organisation SMTP lives in Settings → Email (`org_settings.smtp_config`) and is used for
  that organisation's manual, automated and reminder emails.
- Optional platform provider: `SMTP_CONFIG` (JSON `{host,port,secure,user,pass,fromEmail}`) used for
  organisations without their own SMTP. In production, with neither, sends fail with
  `EMAIL_PROVIDER_NOT_CONFIGURED` and history shows `failed` (never a fake `sent`).
- Observed: `SMTP_CONFIG` is not among the Vercel project's environment variables.
- Cannot inspect: which organisations have saved SMTP, and whether it delivers. Test from Settings →
  Email → "Send test" to an address you own.

## 5. SMS
- Per-organisation `org_settings.sms_config` (provider `twilio` or `http`) or platform env:
  `TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN` + `TWILIO_FROM_NUMBER`, or `SMS_HTTP_ENDPOINT` (+ `SMS_HTTP_API_KEY`).
- The `mock` provider is disabled in production: sends fail and the settings save is rejected.
- Observed: none of these variables are among the Vercel project's environment variables.
- Cannot inspect: organisation-level SMS settings and provider account state.

## 6. Scheduled jobs and cron authentication
- `vercel.json` schedules one job: `POST /api/internal/jobs/process-communication-jobs` daily at
  06:00 UTC. It runs scheduled campaigns, automation rules and departure reminders together.
- Auth: the route requires `Authorization: Bearer <secret>` matching `CRON_SECRET` or
  `SCHEDULED_CAMPAIGNS_CRON_SECRET`. Vercel sends `CRON_SECRET` automatically when that project
  variable exists. With no secret configured the route answers 503.
- Observed: unauthenticated call returns **401**, not 503.
- Inferred: a cron secret is configured in the deployed runtime, although the one variable the audit
  could list was the service-role key only. Confirm in the Vercel dashboard that `CRON_SECRET` exists
  for Production and that the cron run history shows 200s.
- Note: daily granularity means a reminder can be up to 24 hours late.

## 7. Error monitoring
- Set `SENTRY_DSN` (and optionally `SENTRY_ENVIRONMENT`, `SENTRY_RELEASE`). When unset, Sentry is skipped entirely.
- Observed: `sentryEnabled: false` in production. This is a missing setting, not an unreadable one.

## 8. Secrets hygiene
- `vercel.json` contains the Supabase anon key. It is a public client key by design; never put the
  service-role key, management token or SMTP/SMS credentials in tracked files.
