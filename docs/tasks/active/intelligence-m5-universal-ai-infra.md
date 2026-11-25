# Intelligence M5 — Universal AI Platform Infrastructure

**Status:** DONE  
**Priority:** P1  
**Branch:** `feat/travline-intelligence`  
**Roadmap references:** `docs/TRAVLINE_INTELLIGENCE_ROADMAP.md`, `docs/audits/intelligence/ISSUE_REGISTER.md`

## 1. Goal
Build the foundational, provider-agnostic AI infrastructure and dedicated platform-admin boundary (`platform_admins`, encrypted `ai_providers` vault, SSRF guard, `ai_usage_logs`, and unified adapters for OpenAI, Anthropic, Gemini, and OpenAI-compatible endpoints) without touching Production or applying unapproved migrations.

## 2. Scope (In)
1. **Additive-Only Migration (`20261125000000_universal_ai_infrastructure.sql`):**
   - `platform_admins` (cross-org platform owner boundary, addressing `ISS-015`).
   - `ai_providers` (encrypted API key storage, `provider_type`, `base_url`, `default_model`, `is_active`, `priority`, RLS enabled).
   - `ai_usage_logs` (token/cost/latency/status telemetry per org and feature, RLS enabled).
2. **AES-256-GCM Secret Vault (`src/lib/secretVault.ts`):**
   - Encrypt/decrypt provider keys with authenticated encryption (`aes-256-gcm`), key-hint masking, and fail-closed missing-key handling.
3. **SSRF URL Guard (`src/lib/aiUrlGuard.ts`):**
   - Validate custom `openai_compatible` base URLs, rejecting loopback, link-local metadata, private RFC1918 ranges, and insecure schemes.
4. **Universal AI Provider Adapter (`src/lib/aiProviders.ts`):**
   - Normalized interface supporting `openai`, `anthropic`, `gemini`, and `openai_compatible` over `fetch` with timeouts and sanitized error handling.
5. **Tests:**
   - Unit tests covering vault encryption/tampering, SSRF guard, and all 4 provider adapters.

## 3. Out of scope
- Applying migrations to shared Staging or Production (migration file is authored append-only and verified locally).
- Platform Owner Admin UI / Org AI Settings UI / Commercial entitlements (Milestone 6).
- Read-only Travline AI Assistant chat endpoints (Milestone 7).

## 4. Acceptance criteria
- [x] Append-only migration `20261125130000_universal_ai_infrastructure.sql` created with RLS policies.
- [x] `secretVault.ts` passes roundtrip, tamper-detection, and masking tests.
- [x] `aiUrlGuard.ts` blocks private/loopback/metadata/non-HTTPS URLs.
- [x] `aiProviders.ts` supports `openai`, `anthropic`, `gemini`, and `openai_compatible`.
- [x] `nmt-analytics-api` `tsc --noEmit`, vitest, and `npm run build` pass.
