---
name: "My Dashboard"
description: "Routes My Dashboards requests to the correct repository workflow. Use when the user asks to create, inspect, update, share, export or understand a dashboard, presentation, concept, component, spreadsheet source, PowerPoint source or the My Dashboards app."
argument-hint: "[request]"
---

Treat `$ARGUMENTS` as the requested outcome.

Read `skills/OPERATING_MODEL.md` and `skills/CLI_REFERENCE.md` before changing
the repository.

## Orient

1. Run `npm run mydash -- git status --json`.
2. Run `npm run mydash -- doctor --json` when environment capability matters.
3. Discover current content through `mydash library`; do not rely on memory.
4. Inspect only the files and resources relevant to the request.

## Route

Load the specialised skill that best matches the work:

- `/mydash-help` — nontechnical explanation or app usage
- `/spreadsheet` — Excel, CSV, JSON or tabular source work
- `/powerpoint` — PowerPoint source inspection or extraction
- `/dashboard` — dashboard artefacts
- `/presentation` — presentation artefacts
- `/concept` — lightweight concepts and prototypes
- `/component` — primitives, components, layouts, themes, presets or assets
- `/hsbc-visual-standards` — visual language and accessibility

Several skills may apply. Use the smallest combination that covers the task.

## Rules

- Do not maintain an artefact index in this skill or in a JSON file.
- Discover artefacts and shared resources from the filesystem.
- Do not rebuild deterministic CLI capability inside a prompt or script.
- Prefer consuming Core; prefer creating locally.
- Keep the first version as small as the user’s outcome permits.
- Do not ask for information already present in the repository.
- Ask a question only when a missing decision would materially change the work.

## Completion

Before claiming the task is complete:

1. Run the relevant focused checks.
2. Run `npm run mydash -- validate` or scoped validation.
3. Review shared impact when applicable.
4. Checkpoint explicit task-owned paths with `mydash git checkpoint`.
5. Report validation, commit, push and remaining obstacles honestly.
