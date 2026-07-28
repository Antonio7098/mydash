---
name: "Dashboard"
description: "Creates or updates a decision-focused dashboard artefact that resolves repository UI resources and exports as one standalone HTML file."
argument-hint: "[dashboard request]"
---

Treat `$ARGUMENTS` as the dashboard outcome.

Inspect Git state, the configured `user`, relevant sources and the filesystem
library before editing. Preserve unrelated work. Consult
`docs/cli-reference.md` only for exact command syntax.

Load `/spreadsheet` or `/powerpoint` when the source requires it. Load
`/component` before selecting, creating or changing any primitive, component,
layout, theme, preset or asset, including dashboard-local resources.

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

When data comes from a refreshable source, consume only published
`data/generated/` outputs. Surface the dataset's as-of time and an intentional
stale/error state based on `data/refresh-status.json`; never read a live
workbook or `data/source/` snapshot in browser code.

Create dashboards under `library/dashboards/<id>/`. The schema-version-2
`artifact.json` declares the workspace `user`; optional `owner` is descriptive
metadata. Create only needed `src/`, `data/`, `assets/`, `recipes/`, `ui/` and
`theme/` directories. Local resources declare `level: local`, the containing
`ownerArtifact`, a matching directory ID and stable semantic slots. Final
exports may use local HTML, CSS/imports, JavaScript modules, JSON/tabular data,
images, fonts and approved media, but no external load-time dependencies.

Before creating or updating `artifact.json`, read the configured user from
`data.user` returned by `npm run mydash -- doctor --json` and set its `user`
field to that exact value. Do not infer it from the person's display name,
conversation, Git identity or optional `owner` metadata. If no configured user
exists, stop and ask the user to configure one.

The artefact manifest is `artifact.json`. Every resource also requires its own
kind-specific manifest: `ui.json` for primitives, components and layouts,
`theme.json` for themes, `preset.json` for presets and `asset.json` for assets.
An implementation without its manifest is incomplete and undiscoverable.
Follow `/component` for placement, required fields, dependencies and
validation.

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
