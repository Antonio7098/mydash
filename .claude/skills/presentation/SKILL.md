---
name: "Presentation"
description: "Creates or updates an HTML presentation artefact with a clear narrative, reusable repository UI and a standalone file export."
argument-hint: "[presentation request]"
---

Treat `$ARGUMENTS` as the presentation outcome.

Read:

- `docs/agent-workflows/OPERATING_MODEL.md`
- `docs/agent-workflows/ARTIFACT_AUTHORING.md`
- `docs/agent-workflows/VISUAL_STANDARDS.md`

Load `/powerpoint` when working from a source deck. Load `/component` before
creating or changing reusable slide UI.

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
4. Checkpoint explicit task-owned paths with `mydash git checkpoint`.
5. Report validation, commit, push and remaining obstacles honestly.
