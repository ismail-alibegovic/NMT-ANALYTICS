# <Task title>

**Status:** ACTIVE  
**Priority:** P0/P1/P2/...  
**Branch:** `feature/<name>` or `fix/<name>`  
**Roadmap references:** `<sections from docs/ROADMAP.md>`

## 1. Goal

Describe the user/business outcome in 2–5 sentences. State what becomes possible when this task is complete.

## 2. Current problem

List the observed problems. Distinguish confirmed current behavior from historical/user-reported behavior that still requires code verification.

## 3. Required discovery before editing

Codex must inspect:

- relevant frontend routes/components;
- relevant API routes/services;
- database migrations/schema relationships;
- existing tests;
- i18n keys;
- neighboring domains that could be affected.

Record any material mismatch between this spec and current code before expanding scope.

## 4. In scope

- <requirement>
- <requirement>
- <requirement>

## 5. Out of scope

Explicitly list adjacent things that must not be changed in this task.

- <not part of this PR>
- <not part of this PR>

## 6. Domain rules

State business behavior and important invariants.

Examples:

- package defaults vs departure overrides;
- passenger vs customer vs reservation meaning;
- capacity rules;
- trip-type conditional behavior;
- status transitions.

## 7. API requirements

Document routes/behavior to add or change. Prefer behavior and response semantics over prematurely dictating exact implementation if current code may already have a reusable pattern.

Required expectations:

- authentication;
- server-side organization scoping;
- role/permission/capability checks;
- input validation;
- useful 4xx conflict/validation semantics;
- audit logging for material mutations.

## 8. Database / migration requirements

State whether a schema change is expected.

If yes:

- append-only migration;
- backward-compatible where possible;
- org/tenant isolation;
- relationships and indexes;
- RLS strategy;
- migration replay.

If no schema change is needed, say so explicitly.

## 9. Frontend / UX requirements

State exact screens/workflows in scope.

Include:

- entry point/navigation;
- loading/empty/error/success states;
- BS/EN parity;
- responsive behavior;
- light/dark compatibility if affected;
- no unrelated redesign.

## 10. Tenant and security acceptance

At minimum:

- organization A cannot read/change organization B's data through new/changed paths;
- IDs supplied by the browser are validated in authenticated organization context;
- no new secrets reach the browser or repository;
- public endpoints, if any, resolve owning organization server-side.

## 11. Acceptance criteria

- [ ] <observable outcome>
- [ ] <observable outcome>
- [ ] <observable outcome>
- [ ] BS and EN verified for changed user-facing copy.
- [ ] No unrelated screens changed.

## 12. Required tests

### API

- <targeted tests>
- existing API suite remains green.

### Admin

- <component/workflow tests>
- existing admin suite remains green.

### Database

- migration replay if schema changed.

### Browser/E2E

Describe the minimum real workflow that proves the feature.

## 13. Required verification commands

```bash
cd nmt-analytics-api
npm ci
npm run build
npm test

cd ../nmt-analytics-admin
npm ci
npm run lint
npm test
npm run build
```

Add task-specific commands where needed.

## 14. Completion report

Use the completion report contract from `AGENTS.md` and additionally state:

- which acceptance criteria were proven;
- anything not proven and why;
- follow-up tasks discovered but intentionally not implemented.

## 15. Completion record

Fill this only after acceptance:

- **PR:**
- **Merge commit:**
- **Accepted date:**
- **Notes:**
