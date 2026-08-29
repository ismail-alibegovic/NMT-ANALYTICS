# Travline Task Specs

This directory is the execution layer between the product roadmap and coding agents.

## Structure

```text
docs/tasks/
├── README.md
├── TEMPLATE.md
├── active/
│   └── <one or more explicitly scoped tasks>
└── completed/
    └── <accepted historical task specs>
```

## Rules

1. `docs/ROADMAP.md` describes what may need work. It is not an implementation prompt.
2. A roadmap item becomes executable only after a scoped spec is created in `docs/tasks/active/`.
3. One Codex run should be given one named active task.
4. One task should normally map to one feature/fix branch and one PR.
5. The task must state goal, current problem, scope, out-of-scope, acceptance criteria, security/tenant requirements and verification.
6. Codex must inspect current code before implementation; task assumptions can be stale.
7. If implementation reality conflicts with the spec, document the conflict before expanding scope.
8. After a task is reviewed and accepted, move its spec from `active/` to `completed/` and record the PR/commit/result.

## Recommended prompt to Codex

Use a short prompt because the repository documents carry the durable context:

```text
Read AGENTS.md first.
Then read docs/PRODUCT.md, docs/ARCHITECTURE.md, docs/ROADMAP.md,
and the active task: docs/tasks/active/<TASK>.md.

Inspect the current implementation before editing.
Follow the task exactly; do not expand scope.
Work on the branch specified by the task (or create it from current origin/main if instructed).
Run every required verification command you can actually run.
Do not modify production secrets or ZO runtime state.
At the end, provide the completion report required by AGENTS.md and push/open a PR if the task requires it.
```

## Task sizing

Good task:

- one coherent workflow or infrastructure objective;
- usually reviewable in one PR;
- has explicit acceptance criteria;
- can be tested without needing unrelated roadmap work.

Bad task:

> Finish Travline 2.0 and fix everything in the roadmap.

If a task reveals multiple independent problems, split follow-up work into separate specs rather than growing the current branch indefinitely.
