# M17 — Production Communication & Scheduled Dispatch

**Status:** COMPLETED  
**Priority:** P0  
**Branch:** `feature/production-communication`  
**Roadmap references:** M17 (Communications Connection), M14 (Notifications System).

## 1. Goal

Verify and complete production-grade communication across real sender providers (Email SMTP/Resend and SMS providers), ensure safe delivery of manual messages, confirmations, reminders, and automations to passengers and agency staff, and unify scheduled dispatch execution under a resilient internal runner compatible with Vercel and cron triggers.

## 2. Current problem

1. **Email Provider:** Agency-level SMTP configuration exists, but in serverless runtimes (`app.ts`), system-level fallback `activateSmtpProvider()` is never initialized on startup because only `index.ts` called it.
2. **SMS Provider:** `SmsService` currently only supports a mock provider (`MockSmsProvider`). There is no real provider implementation (e.g. Twilio or generic HTTP gateway), preventing real SMS dispatch even when sender numbers are configured.
3. **Scheduled Dispatch:** The internal runner endpoint `/internal/jobs/process-communication-jobs` processes scheduled broadcast campaigns and automation rules, but omits upcoming departure reminders (`runUpcomingDepartureReminderDelivery()`). In addition, `vercel.json` lacks cron definitions for invoking scheduled communication in production, and secret checks only accept `SCHEDULED_CAMPAIGNS_CRON_SECRET` while ignoring standard Vercel `CRON_SECRET`.
4. **Settings UI:** Agency administrators can configure SMS sender name and number in Settings, but cannot test SMS delivery or configure real SMS gateways like they can for Email/SMTP.

## 3. Required discovery before editing

- API routes:
  - `nmt-analytics-api/src/routes/internal.ts` (scheduled cron runner)
  - `nmt-analytics-api/src/routes/communicationSend.ts` (manual message dispatch)
  - `nmt-analytics-api/src/routes/emailSettings.ts` & `smsSettings.ts` (provider configuration)
- API libraries:
  - `nmt-analytics-api/src/lib/email/` (`EmailService.ts`, `SmtpProvider.ts`, `activateSmtpProvider.ts`)
  - `nmt-analytics-api/src/lib/sms/` (`SmsService.ts`)
  - `nmt-analytics-api/src/lib/reminderDelivery.ts`
  - `nmt-analytics-api/src/lib/campaigns.ts`
  - `nmt-analytics-api/src/lib/automationExecution.ts`
- Frontend:
  - `nmt-analytics-admin/src/pages/admin/Settings.tsx`
  - `nmt-analytics-admin/src/pages/communication/CommunicationCenter.tsx`
  - `nmt-analytics-admin/src/lib/i18n/bs.ts` and `en.ts`

## 4. In scope

1. **Email Provider Activation:**
   - Call `activateSmtpProvider()` in `app.ts` so serverless instances initialize system SMTP from env on boot.
   - Maintain full backward compatibility with agency-level `smtp_config` in `org_settings`.
2. **Real SMS Provider Support:**
   - Add `TwilioSmsProvider` and `HttpSmsProvider` to `SmsService.ts`.
   - Update `smsSettings.ts` to accept `'mock' | 'twilio' | 'http'` configurations and support test SMS sends.
   - Support environment-level SMS credentials fallback (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`, `SMS_HTTP_ENDPOINT`).
3. **Complete Scheduled Dispatch:**
   - Update `/internal/jobs/process-communication-jobs` to run:
     - `processDueScheduledCampaigns()`
     - `processDueAutomationRules()`
     - `runUpcomingDepartureReminderDelivery()`
   - Add `/internal/jobs/process-departure-reminders` endpoint.
   - Accept `CRON_SECRET` or `SCHEDULED_CAMPAIGNS_CRON_SECRET` in `requireCronSecret`.
   - Add Vercel cron configuration to `vercel.json` targeting `/api/internal/jobs/process-communication-jobs`.
4. **Settings UI & Test Actions:**
   - Expose SMS test action in `Settings.tsx` allowing administrators to test SMS delivery.
   - Provide localized BS/EN strings.
5. **Comprehensive Tests:**
   - Verify Email and SMS provider dispatch and fallback behavior.
   - Verify unified scheduled dispatch route execution and security.
   - Verify frontend SMS settings and test actions.

## 5. Out of scope

- Visual redesign of Communication Center tabs.
- Third-party billing for SMS credits.

## 6. Domain rules

- Messages sent must always log to `communication_history` with `channel`, `recipient`, `status` ('sent' or 'failed'), and error messages when failed.
- SMS bodies must respect 320 character limit.
- Bulk sending requires explicit user confirmation.
- Tenant isolation: every message dispatch is strictly scoped to the authenticated organization.

## 7. Acceptance criteria

- [x] `app.ts` activates SMTP provider from environment on startup.
- [x] `SmsService` supports `twilio`, `http`, and `mock` providers with valid credentials validation and sending.
- [x] `/settings/sms` and `/settings/sms/test` support real provider configurations and test dispatch.
- [x] `/internal/jobs/process-communication-jobs` executes campaigns, automation rules, and departure reminders with authorization checks.
- [x] `vercel.json` includes scheduled cron for communication jobs.
- [x] Settings page provides functional SMS test action.
- [x] 100% BS/EN language parity maintained.
- [x] All API and Admin tests pass (`npm test`).
