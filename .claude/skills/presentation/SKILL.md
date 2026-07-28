---
name: "Presentation"
description: "Creates or updates an HTML presentation artefact with a clear narrative, reusable repository UI and a standalone file export."
argument-hint: "[presentation request]"
---

Treat `$ARGUMENTS` as the presentation outcome.

Inspect Git state, the configured `user`, relevant sources and the filesystem
library before editing. Preserve unrelated work. Consult
`docs/cli-reference.md` only for exact command syntax.

Load `/powerpoint` when working from a source deck. Load `/component` before
selecting, creating or changing any primitive, component, layout, theme, preset
or asset, including presentation-local resources.

## Narrative first

Define:

- audience;
- desired decision or understanding;
- opening context;
- evidence;
- implications;
- recommendation or next action.

Use one primary idea per slide. Prefer short declarative titles.

## Build

1. Inspect relevant presentation artefacts, themes and presets.
2. Reuse compatible resources.
3. Create presentation-specific UI locally.
4. Keep repeated chrome minimal.
5. Use diagrams, evidence and concise text instead of paragraphs.
6. Preserve notes only when useful.
7. Support keyboard navigation and visible focus.
8. Ensure the deck remains understandable when opened directly from one HTML
   file.

Do not mechanically reproduce every source slide. Rebuild the story for the
requested purpose.

Create presentations under `library/presentations/<id>/`. The
schema-version-2 `artifact.json` declares the workspace `user`; optional
`owner` is descriptive metadata. Create only needed `src/`, `data/`, `assets/`,
`recipes/`, `ui/` and `theme/` directories. Local resources declare
`level: local`, the containing `ownerArtifact`, a matching directory ID and
stable semantic slots. The final export must have no external load-time
dependencies.

The artefact manifest is `artifact.json`. Every resource also requires its own
kind-specific manifest: `ui.json` for primitives, components and layouts,
`theme.json` for themes, `preset.json` for presets and `asset.json` for assets.
An implementation without its manifest is incomplete and undiscoverable.
Follow `/component` for placement, required fields, dependencies and
validation.

## Verify

```text
mydash appearance resolve <id> --kind presentation
mydash artifact validate <id> --kind presentation
mydash validate --artifact <id> --kind presentation
```

Check the opening, transitions, final action, narrow viewport and standalone
export.

## Completion

Before claiming the task is complete:

1. Run the relevant focused checks.
2. Run `npm run mydash -- validate` or scoped validation.
3. Review shared impact when applicable.
4. Update `BUG_LOG.md` only if the work fixes a system bug or changes system
   behaviour; do not log routine presentation work.
5. Checkpoint explicit task-owned paths with `mydash git checkpoint`.
6. Report validation, commit, push and remaining obstacles honestly.
