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
