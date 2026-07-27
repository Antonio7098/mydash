---
name: "Dashboard"
description: "Creates or updates a decision-focused dashboard artefact that resolves repository UI resources and exports as one standalone HTML file."
argument-hint: "[dashboard request]"
---

Treat `$ARGUMENTS` as the dashboard outcome.

Inspect Git state, the configured `userId`, relevant sources and the filesystem
library before editing. Preserve unrelated work. Consult
`docs/cli-reference.md` only for exact command syntax.

Load `/spreadsheet` or `/powerpoint` when the source requires it. Load
`/component` before creating or changing reusable UI.

## Define the dashboard

Establish:

- audience;
- decision or operational question;
- source and freshness;
- most important summary;
- comparisons, trends or exceptions that matter;
- required interactions;
- what is deliberately out of scope.

Do not start by choosing chart types.

## Build

1. Inspect comparable artefacts and current shared resources.
2. Reuse a compatible theme, preset, layout and components.
3. Create new UI locally unless demonstrated reuse justifies sharing.
4. Create or update `artifact.json`.
5. Keep source HTML, CSS and JavaScript ordinary and inspectable.
6. Use semantic HTML, responsive layout and accessible interactions.
7. Embed only the data and assets required by the dashboard.
8. Include units, dates, source context, empty states and error states.
9. Avoid decorative gauges, unexplained scores and redundant cards.

Create dashboards under `library/dashboards/<id>/`. The schema-version-2
`artifact.json` declares the workspace `userId`; optional `owner` is descriptive
metadata. Create only needed `src/`, `data/`, `assets/`, `recipes/`, `ui/` and
`theme/` directories. Local resources declare `level: local`, the containing
`ownerArtifact`, a matching directory ID and stable semantic slots. Final
exports may use local HTML, CSS/imports, JavaScript modules, JSON/tabular data,
images, fonts and approved media, but no external load-time dependencies.

## Verify

```text
mydash appearance resolve <id> --kind dashboard
mydash artifact validate <id> --kind dashboard
mydash validate --artifact <id> --kind dashboard
```

Visually inspect the generated preview. Export when the user needs a shareable
file.

## Completion

Before claiming the task is complete:

1. Run the relevant focused checks.
2. Run `npm run mydash -- validate` or scoped validation.
3. Review shared impact when applicable.
4. Update `BUG_LOG.md` only if the work fixes a system bug or changes system
   behaviour; do not log routine dashboard work.
5. Checkpoint explicit task-owned paths with `mydash git checkpoint`.
6. Report validation, commit, push and remaining obstacles honestly.
