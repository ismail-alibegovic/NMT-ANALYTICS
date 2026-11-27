# Travline Intelligence — Persistent Master Roadmap

**Branch:** `feat/travline-intelligence` (from `release/commercial-rc-2026-11-24` @ `3cf2d013`)
**Owner brief:** business-logic audit → document excellence → academy → universal AI platform → AI assistant.
**Rules:** no merge to `main`; no Production writes/migrations/credential rotation; synthetic data only; AI must never be the source of financial truth; Gemini-only for development assistance.

Status legend: `DONE` verified · `IN PROGRESS` · `PLANNED` · `BLOCKED` · `DEFERRED`

## Milestone 0 — Baseline and protection — DONE

| Item | Status | Evidence |
|---|---|---|
| Repo state re-verified (not assumed) | DONE | `git fetch --prune`; PR #176 head `3cf2d01`, PR #177 head `bc5a0eb`, both OPEN/MERGEABLE (2026-11-25) |
| Release candidate preserved | DONE | Work on new branch `feat/travline-intelligence`; RC branch untouched |
| PR #177 compatibility reviewed | DONE | Not an ancestor of HEAD. Touches only `config.ts`, `lib/supabaseEnvironmentGuard.ts`, `tests/supabaseEnvironmentGuard.test.ts` (+166/−7). Independent of intelligence work; **decision deferred to Milestone 5** (needed when platform secrets/server keys are configured). |
| Local toolchain | NOTE | Local Node is v26.13.1; project requires 24.x. Local API suite shows 5 expected `productionEnvironment` failures on Node 26 only. **CI (Node 24) is the authoritative baseline.** |
| Baseline (CI, Node 24) | DONE | PR #176 @ `3cf2d01`: 12/12 checks green incl. Migration Replay, Staging Acceptance (23m35s), UI audit, Shared UI |
| Baseline (local) | DONE | See `docs/audits/intelligence/BASELINE.md` |
| Isolated environment | DECISION NEEDED | Shared Staging (`hlyqrwytlrimtrjncmez`) backs the verified RC preview. Intelligence migrations that are not backward-compatible must **not** be applied there without owner approval. Proposed: additive-only migrations on shared Staging, or a separate Supabase branch/project. |

## Milestone 1 — Business logic audit — DONE
- Commit `0c92ab4`: Deliverables `docs/audits/intelligence/BASELINE.md`, `BUSINESS_LOGIC_MATRIX.md`, `ISSUE_REGISTER.md`, `SCENARIOS.md`.

## Milestone 2 — Document audit & corrections — DONE
- Commit `4131f0e`: Spec `docs/tasks/active/intelligence-m2-document-corrections.md` (`ISS-002`, `ISS-003`, `ISS-005`, `ISS-008`). Verified: API `tsc`, 4/4 test files (55/55 tests), `npm run build`; Admin `lint` (0 errors), `tsc`, `financeDocumentsLocale.test.tsx` (8/8), `npm run build`.

## Milestone 3 — Product experience & business logic — DONE
- Commit `4283020`: Spec `docs/tasks/active/intelligence-m3-business-logic-fixes.md` (`ISS-001`, `ISS-004`, `ISS-007`, `ISS-010`, `ISS-011`, `ISS-014`). Verified: API `tsc`, 3/3 test files (12/12 tests), `npm run build`; Admin `lint` (0 errors), `tsc`, `financeDocumentsLocale.test.tsx` (8/8), `npm run build`.

## Milestone 4 — Travline Academy — DONE
- Commit `f8a43e3`: Spec `docs/tasks/active/intelligence-m4-travline-academy.md`. Verified: Admin `lint` (0 errors), `tsc`, `academy.test.tsx` (2/2), `npm run build`.

## Milestone 5 — Universal AI infrastructure — DONE
- Commit `6b8fc82`: Spec `docs/tasks/active/intelligence-m5-universal-ai-infra.md` (additive-only migration `20261125130000_universal_ai_infrastructure.sql`, `secretVault`, `aiUrlGuard`, `aiProviders`). Verified: API `tsc`, `m5AiInfrastructure.test.ts` (3/3), `npm run build`.

## Milestone 6 — AI commercial architecture — DONE
- Commit `84ec421`: Spec `docs/tasks/active/intelligence-m6-ai-commercial.md` (`requirePlatformAdmin`, `aiProviderService`, CRUD routes, `AiSettings.tsx`). Verified: API `tsc`, 2/2 test files (6/6), `npm run build`; Admin `lint` (0 errors), `tsc`, `npm run build`.

## Milestone 7 — Read-only Travline AI — DONE
- Commit `121ebc8`: Spec `docs/tasks/active/intelligence-m7-read-only-assistant.md` (`aiContextBuilder`, `POST /api/ai/assistant`, `AiAssistant.tsx`). Verified: API `tsc`, 3/3 test files (9/9), `npm run build`; Admin `lint` (0 errors), `tsc`, `npm run build`.

## Milestone 8 — Intelligent dashboard — DONE
- Commit `2ca5889`: Spec `docs/tasks/active/intelligence-m8-executive-signals.md` (`GET /api/ai/signals`, `ExecutiveSignalsCard.tsx`). Verified: API `tsc`, 2/2 test files (5/5), `npm run build`; Admin `lint` (0 errors), `tsc`, `npm run build`.

## Milestone 9 — Drafts & controlled actions — DONE
- Spec `docs/tasks/active/intelligence-m9-ai-actions.md`: additive migration `20261125140000_ai_action_proposals.sql`, `aiActions.ts` (`/ai/proposals`, `/confirm`, `/reject` with idempotency, RBAC, audit logs), and Admin editable proposal UI.

## Milestone 10 — Full staging verification — IN PROGRESS
Full API, Admin, migration, PDF sample generation, GitHub draft PR, and isolated Vercel Preview verification.

Dependencies: 5 → 6 → 7 → 8 → 9. Milestones 2–4 are independent of the AI track and are executed first so that the AI answers about *verified* documentation and *consistent* financial definitions.

## Update log
- 2026-11-25 — M0–M8 completed locally and published to `origin/feat/travline-intelligence` via draft PR targeting `release/commercial-rc-2026-11-24`.
