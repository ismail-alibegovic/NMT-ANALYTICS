# Travline — Task Specs

## Canonical roadmap

`TRAVLINE_MASTER_PLAN_2_0.md` (M00–M24) is the **single canonical roadmap** for Travline development. All implementation must trace back to an M-task.

`docs/ROADMAP.md` provides a condensed status view keyed to M00–M24.

## How tasks work

1. **Pick ONE M-task** from the roadmap.
2. **Create a scoped spec** in `active/` using `TEMPLATE.md`.
3. **One M-task = one branch = one PR.** Do not bundle tasks.
4. After review and acceptance, move the spec from `active/` to `completed/`.

## Master Plan is context only

`TRAVLINE_MASTER_PLAN_2_0.md` describes the intended product direction. It is **never permission to implement all tasks at once**. Only an explicit, scoped active spec in `docs/tasks/active/` is an implementation directive.

## Active-task rule

Only ONE M-task may have an active spec at a time. If multiple active specs exist, STOP and ask which task to execute.

## Scope discipline

- Implement only what the active spec defines.
- If implementation reality conflicts with the spec, STOP and report the conflict with evidence. Do not silently expand scope.
- Do not add adjacent roadmap items.

## Directory structure

```
docs/tasks/
├── README.md              ← this file
├── TEMPLATE.md            ← reusable spec template for M-tasks
├── active/                ← exactly one scoped spec at a time
│   └── <Mxx>-<slug>.md
├── completed/             ← accepted historical spec artifacts
└── archived/              ← old T01–T38 task system (ZAHTJEVI-based, superseded)
    ├── T_TO_M_MAPPING.md  ← cross-reference T-tasks → M-tasks
    ├── INDEX.md           ← old master requirements breakdown (38 tasks)
    └── 01-*.md … 15-*.md ← old phase files
```

## Old task system

The T01–T38 task decomposition was based on `TRAVLINE_MASTER_ZAHTJEVI` and has been superseded by Master Plan 2.0 (M00–M24). All old files are preserved in `archived/` for reference.
