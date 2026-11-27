# Intelligence M6 — AI Commercial Architecture & Provider Management

**Status:** DONE  
**Priority:** P1  
**Branch:** `feat/travline-intelligence`  
**Roadmap references:** `docs/TRAVLINE_INTELLIGENCE_ROADMAP.md`

## 1. Goal
Build the commercial AI management layer:
- Dedicated `requirePlatformAdmin` middleware backed by `platform_admins` (never trusting `profiles.org_id` alone).
- Provider resolution service (`aiProviderService.ts`) that resolves org BYOK providers first, falling back to platform-level active providers, and logs every call to `ai_usage_logs`.
- API endpoints for:
  - Platform Owner (`requirePlatformAdmin`): manage platform-global `ai_providers` and view cross-org AI usage summary.
  - Agency Director (`requireMinimumRole('director')`): manage org-scoped BYOK `ai_providers` (encrypted via `secretVault`, SSRF-validated via `aiUrlGuard`, masked `keyHint` only in responses) and view org AI usage.
- Plan module entitlement (`'ai_assistant'` in `planModules.ts`).
- Admin UI (`AiProvidersPanel` / `/settings/ai` or Settings section) with full BS/EN parity so Directors can configure/test/toggle providers without exposing API keys.

## 2. Out of scope
- Conversational AI assistant endpoints and chat UI (Milestone 7).
- AI dashboard widgets (Milestone 8).

## 3. Acceptance criteria
- [x] `requirePlatformAdmin` enforces `platform_admins` membership (`403` otherwise).
- [x] Platform and org AI provider CRUD endpoints encrypt keys, validate `baseUrl` via `validateAiBaseUrl`, and never return `encrypted_api_key` or plaintext keys.
- [x] `resolveActiveAiProvider(orgId)` prefers active org BYOK provider by priority, then active platform provider.
- [x] Admin AI provider management UI and BS/EN translations build and pass tests.
