# MyDash bug and system change log

This log records changes to the MyDash system itself. Keep it useful as a
compact operational history, not as a duplicate Git log.

## What belongs here

- a reproducible bug that is found, whether still open or fixed;
- the cause and resolution of a fixed bug;
- a change to Navigator, CLI, server, discovery, validation, resolution,
  export, workspace, Git or shared system behaviour;
- a compatibility, migration or operational consequence of a system change.

Do not record routine creation or editing of dashboards, presentations,
concepts, primitives, components, layouts, themes, presets or assets. Record
those only when the work also changes the system that discovers, validates,
renders, exports or manages them.

## Entry format

Add the newest entry first.

```markdown
## YYYY-MM-DD — Short title

- Type: Bug | Fix | System change
- Status: Open | Fixed | Complete
- Area: Navigator | CLI | Server | Library | Validation | Export | Workspace | Git
- Summary: What happened or changed.
- Cause: Why the bug occurred, when applicable.
- Resolution: What fixed it or how the system now behaves.
- Validation: Checks that demonstrate the current state.
- References: Relevant paths, issue IDs or commits.
```

Omit fields that genuinely do not apply. Update an existing open bug entry when
it is fixed instead of creating a disconnected duplicate.

## 2026-07-29 — TypeScript migration of src/, cli/, server/, bin/, tests/

- Type: System change
- Status: Complete
- Area: Navigator | CLI | Server | Library | Validation | Export | Workspace | Git | Skills
- Summary: TypeScript migration of `src/`, `cli/`, `server/`, `bin/`, and `tests/`. The application now compiles to `dist/` via `tsc`; `npm start`, `npm run mydash` and `npm test` consume the compiled output. The bootstrap scripts under `scripts/00-` through `scripts/23-` are historical and refuse to overwrite TypeScript application directories.
- Resolution: Added `tsconfig.json`, `tsconfig.build.json`, and `tsconfig.test.json`; introduced `npm run typecheck`, `npm run build`, `npm run build:test`, and `npm run clean`. The package `bin` field now points at `dist/cli/index.js` after `npm run build`. Bootstrap scripts push a `BOOTSTRAP_TYPE_SCRIPT_GUARD` warning and skip writes against `src/`, `cli/`, `server/`, `tests/`, `bin/`, and `dist/`; legacy install paths (`scripts/`, `config/`, `library/`, `docs/`, `data/`, `recipes/`, `README.md`, `package.json`) are unaffected.
- Validation: `npm run typecheck`, `node scripts/tasks/check-source.mjs`, focused unit and integration tests, and consolidated workspace validation.
- References: `tsconfig.json`, `tsconfig.build.json`, `tsconfig.test.json`, `package.json` (build/typecheck scripts), `docs/migration/typescript.md`, `scripts/00-23-*.mjs` (refuse to overwrite .ts directories)

## 2026-07-28 — Artefact skills use the configured manifest user

- Type: System change
- Status: Complete
- Area: Workspace
- Summary: Made artefact ownership assignment explicit across the MyDash,
  dashboard, presentation and concept skills.
- Resolution: Agents now read `data.user` from `mydash doctor --json` and copy
  that exact value to `artifact.json.user`. They must not infer it from a
  display name, conversation, Git identity or optional `owner` metadata, and
  must stop for configuration when the workspace user is absent. Resource
  manifests remain global and do not receive the artefact `user` field.
- Validation: Skill catalogue validation and consolidated workspace validation.
- References: `.claude/skills/mydash/SKILL.md`,
  `.claude/skills/dashboard/SKILL.md`,
  `.claude/skills/presentation/SKILL.md`, `.claude/skills/concept/SKILL.md`,
  `CHANGELOG.md`

## 2026-07-28 — Changelog required for core-system changes

- Type: System change
- Status: Complete
- Area: Workspace
- Summary: Made `CHANGELOG.md` mandatory for every core-system change,
  including additions or corrections to agent skills and `/help`.
- Resolution: `/mydash` now distinguishes the user-facing changelog from the
  operational bug log, defines what qualifies as core-system work and excludes
  routine artefact-local content. `/help` explicitly records its changes in the
  changelog.
- Validation: Skill catalogue validation and consolidated workspace validation.
- References: `.claude/skills/mydash/SKILL.md`,
  `.claude/skills/help/SKILL.md`, `CHANGELOG.md`

## 2026-07-28 — Primary agent skill renamed to `/mydash`

- Type: System change
- Status: Complete
- Area: CLI, Validation, Workspace
- Summary: Renamed the repository-wide agent skill from `/my-dashboard` to
  `/mydash`, documented a global linked installation for Claude Code and
  strengthened reusable-resource and recurring-help guidance.
- Resolution: The embedded skill, catalogue validation, integration coverage
  and retained bootstrap references now use `mydash`. A non-technical setup
  guide covers installation, user configuration and safe dashboard
  migration. `/mydash` now makes resource manifests and `/component` routing
  explicit; `/component` defines the full authoring and promotion workflow; and
  `/help` retains confirmed guidance for recurring nontechnical problems.
  Dashboard, presentation and concept workflows now apply the same manifest
  rule to artefact-local resources. Workspace and artefact ownership now use
  the exact field `user`; the Navigator is explicitly scoped to the configured
  workspace user.
- Validation: Skill catalogue validation, focused unit and integration tests,
  source integrity checks and consolidated workspace validation passed.
- References: `.claude/skills/mydash/SKILL.md`,
  `.claude/skills/component/SKILL.md`, `.claude/skills/help/SKILL.md`,
  `.claude/skills/dashboard/SKILL.md`,
  `.claude/skills/presentation/SKILL.md`, `.claude/skills/concept/SKILL.md`,
  `src/skills/validate.mjs`, `docs/setup.md`

## 2026-07-28 — Snapshot-based artefact data refresh

- Type: System change
- Status: Complete
- Area: CLI, Validation, Workspace
- Summary: Added manual and live-local source acquisition, artefact-level data
  refresh, quality gates, rollback-protected publication, extended provenance
  and freshness/status reporting.
- Resolution: External files are staged as stable, hashed workspace snapshots;
  recipes consume only those snapshots and publish generated datasets only
  after all configured checks pass. Raw snapshots and machine-local source
  mappings are ignored by Git.
- Validation: `tests/integration/artifact-data-refresh-cli.test.mjs`, data CLI
  tests, skill checks and consolidated workspace validation.
- References: `src/data/artifact-refresh.mjs`, `cli/commands/data.mjs`,
  `docs/data-refresh.md`, `.claude/skills/spreadsheet/SKILL.md`

## 2026-07-27 — System change log introduced

- Type: System change
- Status: Complete
- Area: Workspace
- Summary: Replaced the static release checklist with a maintained bug and
  system-change history.
- Resolution: Added this log and made system-change logging part of the agent
  workflows.
- References: `BUG_LOG.md`, `.claude/skills/`
