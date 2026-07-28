---
name: "Spreadsheet"
description: "Inspects Excel, CSV, JSON and NDJSON sources and turns them into deterministic, profiled artefact data. Use when a dashboard or presentation begins with spreadsheet or tabular data."
argument-hint: "[source and desired outcome]"
---

Treat `$ARGUMENTS` as the data outcome.

Consult `docs/cli-reference.md` when exact Excel or data command syntax is
needed. Keep extracted outputs inside the workspace, use explicit output paths
and overwrite flags, preserve unrelated changes, validate before checkpointing
and checkpoint only explicit task-owned paths.

## Stage external sources

The user may provide a spreadsheet or other tabular file that has been copied
somewhere else on the computer. Before inspecting or analysing it, or beginning
dashboard or presentation work from it:

1. Establish the intended artefact kind and ID.
2. Assign a stable kebab-case source ID.
3. Run `mydash data stage` so the source is copied safely to
   `library/<kind>/<id>/data/source/<source-id>/current.<ext>`.
4. Tell the user the exact `stagedPath` returned by the command.
5. Use the staged workspace copy for all subsequent inspection, extraction and
   analysis.

Do not manually replace `current.*`. Staging rejects symlinks and unstable or
oversized files, detects unchanged content by hash, copies atomically and
retains history according to `source.json`.

## Refreshable sources

Read `docs/data-refresh.md` before configuring refreshes.

- `manual` means the user supplies each new snapshot for `mydash data stage`.
- `live-local` means `.mydash-local/sources.json` supplies a workstation-local
  path and `mydash data sync` snapshots it and runs the artefact refresh.
- Never point a recipe directly at an external or live path.
- Never store credentials or machine-specific paths in tracked policies or
  recipes.
- Create one artefact-local recipe per generated dataset.
- Configure required columns, minimum rows, unique keys, formula-error handling
  and an appropriate row-decrease threshold in `source.json`.
- Run `mydash data refresh-artifact` to validate, extract, quality-check and
  atomically publish all artefact datasets.
- Run `mydash data status` and report freshness, row counts, source hash and any
  retained last-known-good state.
- Ask before enabling a schedule or configuring access to an external source.

## Workflow

1. Identify the staged source's format and location.
2. Inspect structure before extracting.
3. For Excel, inspect sheets, tables, hidden content and formulas.
4. Preview only the relevant range or table.
5. Extract deterministic records into the intended artefact’s
   `data/generated/` directory.
6. Profile fields, nulls, uniqueness, likely identifiers, numeric ranges and
   duplicate rows.
7. Reduce the dataset to what the artefact actually needs.
8. Create a repeatable artefact-local recipe when the source will be refreshed.
9. Retain provenance.
10. Hand the resulting data to `/dashboard` or `/presentation` when applicable.

## Safety

- Never execute workbook macros.
- Never recalculate formulas.
- Treat formulas as inspected metadata or cached values.
- Never run JavaScript embedded in source data.
- Do not write outside the workspace.
- Do not overwrite an existing output without explicit intent.
- Keep the staged original under `data/source/<source-id>/`; do not use or duplicate an
  entire workbook as the artefact's working dataset when a small extracted
  dataset is sufficient.

## Quality

Name fields clearly, preserve source meaning, record units and dates, and state
any transformation that could alter interpretation.

## Completion

Before claiming the task is complete:

1. Run the relevant focused checks.
2. Run `npm run mydash -- validate` or scoped validation.
3. Review shared impact when applicable.
4. Update `BUG_LOG.md` only if the work fixes a system bug or changes system
   behaviour; do not log routine data extraction or artefact content work.
5. Checkpoint explicit task-owned paths with `mydash git checkpoint`.
6. Report validation, commit, push and remaining obstacles honestly.
