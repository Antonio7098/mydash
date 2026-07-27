---
name: "Spreadsheet"
description: "Inspects Excel, CSV, JSON and NDJSON sources and turns them into deterministic, profiled artefact data. Use when a dashboard or presentation begins with spreadsheet or tabular data."
argument-hint: "[source and desired outcome]"
---

Treat `$ARGUMENTS` as the data outcome.

Read:

- `skills/OPERATING_MODEL.md`
- `skills/CLI_REFERENCE.md`
- `skills/ARTIFACT_AUTHORING.md`

## Workflow

1. Identify the source format and location.
2. Inspect structure before extracting.
3. For Excel, inspect sheets, tables, hidden content and formulas.
4. Preview only the relevant range or table.
5. Extract deterministic records into the intended artefact’s `data/` directory
   or another explicit workspace output.
6. Profile fields, nulls, uniqueness, likely identifiers, numeric ranges and
   duplicate rows.
7. Reduce the dataset to what the artefact actually needs.
8. Create a repeatable recipe when the source will be refreshed.
9. Retain provenance.
10. Hand the resulting data to `/dashboard` or `/presentation` when applicable.

## Safety

- Never execute workbook macros.
- Never recalculate formulas.
- Treat formulas as inspected metadata or cached values.
- Never run JavaScript embedded in source data.
- Do not write outside the workspace.
- Do not overwrite an existing output without explicit intent.
- Do not copy an entire workbook into an artefact when a small extracted dataset
  is sufficient.

## Quality

Name fields clearly, preserve source meaning, record units and dates, and state
any transformation that could alter interpretation.

## Completion

Before claiming the task is complete:

1. Run the relevant focused checks.
2. Run `npm run mydash -- validate` or scoped validation.
3. Review shared impact when applicable.
4. Checkpoint explicit task-owned paths with `mydash git checkpoint`.
5. Report validation, commit, push and remaining obstacles honestly.
