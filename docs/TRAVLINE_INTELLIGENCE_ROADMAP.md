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
Deliverables: `docs/audits/intelligence/BUSINESS_LOGIC_MATRIX.md`, `ISSUE_REGISTER.md`, `SCENARIOS.md`.

## Milestone 2 — Document audit & corrections — DONE
Completed spec: `docs/tasks/active/intelligence-m2-document-corrections.md` (`ISS-002`, `ISS-003`, `ISS-005`, `ISS-008`).

## Milestone 3 — Product experience & business logic — DONE
Completed spec: `docs/tasks/active/intelligence-m3-business-logic-fixes.md` (`ISS-001`, `ISS-004`, `ISS-007`, `ISS-010`, `ISS-011`, `ISS-014`).

## Milestone 4 — Travline Academy — DONE
Completed spec: `docs/tasks/active/intelligence-m4-travline-academy.md`.

## Milestone 5 — Universal AI infrastructure — DONE
Completed spec: `docs/tasks/active/intelligence-m5-universal-ai-infra.md`.

## Milestones 6–10 — PLANNED
6 AI commercial architecture · 7 Read-only Travline AI · 8 Intelligent dashboard · 9 Drafts & controlled actions · 10 Full staging verification.

Dependencies: 5 → 6 → 7 → 8 → 9. Milestones 2–4 are independent of the AI track and are executed first so that the AI answers about *verified* documentation and *consistent* financial definitions.

## Update log
- 2026-11-25 — M0 started; branch created; roadmap created.
